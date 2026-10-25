import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnprocessableEntityException,
  ServiceUnavailableException,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { Response } from "express";
import { Repository } from "./common/repository";
import { BaseService } from "./common/services/base.service";
import type { RecordEntity, SessionRequest } from "./common/types";
import { RequirePermission } from "./common/permissions";
import { repoRoot } from "./common/paths";
import { dataPackDir } from "./domain/datapack";
import { readRecords } from "./domain/csv";
import { parseEngineOutput } from "./domain/engine-contract";

/** Files the engine writes for a dataset run (cli.py --output). */
const OUTPUTS: Record<string, string> = {
  "submission_output.csv": "text/csv; charset=utf-8",
  "audit.json": "application/json",
  "metrics.json": "application/json",
};
// nginx accepts 25 MB per request (infra/nginx) and waits 60 s for the API.
const MAX_FILES = 20;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** Stdout of an `apps/engine` script (the CLI by default); exit code 2 means the input was rejected. */
function python(
  args: string[],
  timeoutMs: number,
  script = "cli.py",
): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    const child = spawn(
      process.env.PYTHON ?? "python3",
      [`apps/engine/${script}`, ...args],
      { cwd: repoRoot(), env: process.env },
    );
    let out = "",
      err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("ENGINE_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (x) => (out += x));
    child.stderr.on("data", (x) => (err += x));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveOutput(out);
      else if (code === 2)
        reject(new UnprocessableEntityException(err.trim().slice(0, 2000)));
      else reject(new Error(err));
    });
  });
}

/**
 * The synthetic benchmark depends only on the official Data Pack, so it is computed once per
 * process (about 6 s) and concurrent requests share the same run. A failed run is not cached.
 */
let benchmarkRun: Promise<unknown> | undefined;
function computeBenchmark(): Promise<unknown> {
  benchmarkRun ??= python([], 120000, "benchmark.py")
    .then((out) => {
      const result = JSON.parse(out);
      if (!result?.synthetic?.test || !result?.publicSamples)
        throw new Error("BENCHMARK_OUTPUT_INVALID");
      return result;
    })
    .catch((error) => {
      benchmarkRun = undefined;
      throw error;
    });
  return benchmarkRun;
}

@Controller("engine")
export class EngineController {
  constructor(
    @Inject(BaseService) private base: BaseService,
    @Inject(Repository) private repo: Repository,
  ) {}
  private async run() {
    const template = readRecords(
      await readFile(
        resolve(
          dataPackDir(),
          "04_output_templates/submission_output_template.csv",
        ),
        "utf8",
      ),
    ).rows;
    let raw: unknown;
    if (process.env.ENGINE_URL) {
      // A provider failure must never silently turn into another engine's answer.
      try {
        const response = await fetch(
          process.env.ENGINE_URL.replace(/\/$/, "") + "/decisions",
          { signal: AbortSignal.timeout(30000) },
        );
        if (!response.ok) throw new Error("ENGINE_REQUEST_FAILED");
        raw = await response.json();
      } catch {
        throw new ServiceUnavailableException("ENGINE_UNAVAILABLE");
      }
    } else raw = JSON.parse(await python(["--json"], 30000));
    const result = parseEngineOutput(raw, {
      profile: "BTC_SUBMISSION",
      rows: template,
    });
    if (result.summary.invariantViolations.length)
      throw new UnprocessableEntityException("ENGINE_INVARIANT_VIOLATION");
    return result;
  }
  private folder(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new BadRequestException("INVALID_DATASET");
    return resolve(repoRoot(), process.env.DATA_DIR ?? ".data", "datasets", id);
  }
  /** Datasets belong to the uploader's organization. */
  private async dataset(id: string, req: SessionRequest) {
    const record = (await this.repo.list("datasets")).find(
      (x) => x.id === id && x.organizationId === req.user.organizationId,
    );
    if (!record) throw new NotFoundException("DATASET_NOT_FOUND");
    return record;
  }

  @RequirePermission("engine:read")
  @Get("decisions")
  async decisions() {
    return this.run();
  }
  /** Read-only accuracy figures on the generated cases; never computed for uploaded datasets. */
  @RequirePermission("engine:read")
  @Get("benchmark")
  async benchmark() {
    return computeBenchmark();
  }
  @RequirePermission("engine:evaluate")
  @Post("evaluate")
  async evaluate(@Req() req: SessionRequest) {
    const result = await this.run();
    await this.base.audit("EVALUATE", "engine", result.runId, req.user);
    return result;
  }

  @RequirePermission("engine:datasets")
  @Get("datasets")
  async datasets(@Req() req: SessionRequest) {
    return (await this.repo.list("datasets"))
      .filter((x) => x.organizationId === req.user.organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  /** CSV files and/or zip archives of a Data Pack; the engine finds the files it needs by name. */
  @RequirePermission("engine:datasets")
  @Post("datasets")
  @UseInterceptors(
    FilesInterceptor("files", MAX_FILES, {
      limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
    }),
  )
  async upload(
    @UploadedFiles()
    files: { buffer: Buffer; originalname: string; size: number }[],
    @Body() body: { name?: string },
    @Req() req: SessionRequest,
  ) {
    if (!files?.length) throw new BadRequestException("FILES_REQUIRED");
    const names = new Set<string>();
    const stored = files.map((file) => {
      const name = basename(file.originalname).replace(/[^\w.-]+/g, "_");
      if (!/\.(csv|zip)$/i.test(name) || name.startsWith("."))
        throw new BadRequestException("CSV_OR_ZIP_REQUIRED");
      if (names.has(name.toLowerCase()))
        throw new BadRequestException(`DUPLICATE_FILE:${name}`);
      names.add(name.toLowerCase());
      return { name, size: file.size, buffer: file.buffer };
    });
    const id = randomUUID(),
      input = resolve(this.folder(id), "input");
    await mkdir(input, { recursive: true });
    try {
      for (const file of stored)
        await writeFile(resolve(input, file.name), file.buffer, { flag: "wx" });
      const report = JSON.parse(
        await python(["--data", input, "--inspect"], 60000),
      );
      const now = new Date().toISOString();
      const fallback =
        stored.length === 1
          ? stored[0].name.replace(/\.(csv|zip)$/i, "")
          : `dataset-${now.slice(0, 16).replace("T", "-")}`;
      const record: RecordEntity = {
        id,
        version: 1,
        createdAt: now,
        updatedAt: now,
        organizationId: req.user.organizationId,
        name: String(body?.name || fallback).slice(0, 120),
        createdBy: req.user.displayName,
        files: stored.map(({ name, size }) => ({ name, size })),
        report,
      };
      await this.repo.mutate(
        "datasets",
        (items) => items.push(record),
        this.base.auditRecord("UPLOAD", "datasets", id, req.user),
      );
      return record;
    } catch (error) {
      await rm(this.folder(id), { recursive: true, force: true });
      throw error;
    }
  }
  @RequirePermission("engine:datasets")
  @Post("datasets/:id/evaluate")
  async evaluateDataset(@Param("id") id: string, @Req() req: SessionRequest) {
    await this.dataset(id, req);
    const folder = this.folder(id);
    const out = await python(
      [
        "--data",
        resolve(folder, "input"),
        "--output",
        resolve(folder, "output"),
        "--json",
      ],
      55000,
    );
    const result = parseEngineOutput(JSON.parse(out), {
      profile: "BTC_SUBMISSION",
    });
    // The full run (rows and traces) is kept beside the official output files for reopening.
    await writeFile(resolve(folder, "result.json"), out);
    const now = new Date().toISOString();
    await this.repo.mutate(
      "datasets",
      (items) => {
        const item = items.find((x) => x.id === id)!;
        item.lastRun = {
          runId: result.runId,
          at: now,
          summary: result.summary,
        };
        item.updatedAt = now;
        item.version += 1;
      },
      this.base.auditRecord("EVALUATE", "datasets", result.runId, req.user),
    );
    return result;
  }
  /** Latest run of a dataset, in the same shape as /engine/decisions. */
  @RequirePermission("engine:datasets")
  @Get("datasets/:id/result")
  async result(@Param("id") id: string, @Req() req: SessionRequest) {
    const record = await this.dataset(id, req);
    if (!record.lastRun) throw new NotFoundException("DATASET_NOT_EVALUATED");
    return JSON.parse(
      await readFile(resolve(this.folder(id), "result.json"), "utf8"),
    );
  }
  @RequirePermission("engine:datasets")
  @Get("datasets/:id/files/:file")
  async output(
    @Param("id") id: string,
    @Param("file") file: string,
    @Req() req: SessionRequest,
    @Res() res: Response,
  ) {
    const record = await this.dataset(id, req);
    if (!OUTPUTS[file]) throw new BadRequestException("UNKNOWN_OUTPUT");
    if (!record.lastRun) throw new NotFoundException("DATASET_NOT_EVALUATED");
    const bytes = await readFile(resolve(this.folder(id), "output", file));
    res.setHeader("Content-Type", OUTPUTS[file]);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
    res.send(bytes);
  }
  @RequirePermission("engine:datasets")
  @Delete("datasets/:id")
  async remove(@Param("id") id: string, @Req() req: SessionRequest) {
    await this.dataset(id, req);
    await this.repo.mutate(
      "datasets",
      (items) =>
        items.splice(
          items.findIndex((x) => x.id === id),
          1,
        ),
      this.base.auditRecord("DELETE", "datasets", id, req.user),
    );
    await rm(this.folder(id), { recursive: true, force: true });
    return { deleted: 1 };
  }
}
