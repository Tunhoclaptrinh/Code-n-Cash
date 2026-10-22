import { Controller, Get, Post, Req, Inject } from "@nestjs/common";
import { spawn } from "node:child_process";
import { BaseService } from "./common/services/base.service";
import type { SessionRequest } from "./common/types";
import { Roles } from "./common/decorators/roles.decorator";
@Controller("engine")
export class EngineController {
  constructor(@Inject(BaseService) private base: BaseService) {}
  private run(): Promise<any> {
    if (process.env.ENGINE_URL)
      return fetch(process.env.ENGINE_URL.replace(/\/$/, "") + "/decisions", {
        signal: AbortSignal.timeout(30000),
      }).then((response) => {
        if (!response.ok) throw new Error("ENGINE_REQUEST_FAILED");
        return response.json();
      });
    return new Promise((resolveResult, reject) => {
      const child = spawn(
        process.env.PYTHON ?? "python3",
        ["apps/engine/cli.py", "--json"],
        { cwd: process.env.REPO_ROOT ?? process.cwd(), env: process.env },
      );
      let out = "",
        err = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("ENGINE_TIMEOUT"));
      }, 30000);
      child.stdout.on("data", (x) => (out += x));
      child.stderr.on("data", (x) => (err += x));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error(err));
        else
          try {
            resolveResult(JSON.parse(out));
          } catch (e) {
            reject(e);
          }
      });
    });
  }
  @Roles(
    "CONTRACT_OWNER",
    "LEGAL_REVIEWER",
    "FINANCE_APPROVER",
    "ADMIN_AUDITOR",
  )
  @Get("decisions")
  async decisions() {
    return this.run();
  }
  @Roles("CONTRACT_OWNER", "FINANCE_APPROVER", "ADMIN_AUDITOR")
  @Post("evaluate")
  async evaluate(@Req() req: SessionRequest) {
    const result = await this.run();
    await this.base.audit("EVALUATE", "engine", result.runId, req.user);
    return result;
  }
}
