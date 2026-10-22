import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { Repository } from "../repository";
import { parsePage } from "../dto/pagination.dto";
import { parseFilters } from "../utils/query-builder";
import type { Actor, Resource, RecordEntity } from "../types";
@Injectable()
export class BaseService {
  readonly definitions: Resource[] = JSON.parse(
    readFileSync(
      resolve(
        process.env.REPO_ROOT ?? process.cwd(),
        "packages/contracts/resources.json",
      ),
      "utf8",
    ),
  );
  constructor(@Inject(Repository) private repo: Repository) {}
  definition(name: string) {
    const def = this.definitions.find((d) => d.name === name);
    if (!def) throw new NotFoundException("RESOURCE_NOT_FOUND");
    return def;
  }
  private admin(actor: Actor) {
    return actor.role === "ADMIN_AUDITOR";
  }
  private writable(name: string, actor: Actor) {
    const def = this.definition(name);
    if (def.readOnly) throw new ForbiddenException("APPEND_ONLY_RESOURCE");
    if (this.admin(actor)) return def;
    if (
      !["contract-drafts"].includes(name) ||
      !["CONTRACT_OWNER", "LEGAL_REVIEWER"].includes(actor.role)
    )
      throw new ForbiddenException("FORBIDDEN");
    return def;
  }
  private visible(name: string, item: RecordEntity, actor: Actor) {
    return this.admin(actor) || item.organizationId === actor.organizationId;
  }
  private clean(item: RecordEntity) {
    const { passwordHash, tokenVersion, ...safe } = item;
    return safe;
  }
  private validate(def: Resource, body: unknown, partial = false) {
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new BadRequestException("INVALID_BODY");
    const data = body as Record<string, unknown>;
    const allowed = [...def.fields.map((f) => f.key), "version"];
    if (Object.keys(data).some((k) => !allowed.includes(k)))
      throw new BadRequestException("UNKNOWN_FIELD");
    const result: Record<string, unknown> = {};
    for (const f of def.fields) {
      const value = data[f.key];
      if (value === undefined) {
        if (f.required && !partial)
          throw new BadRequestException(`REQUIRED:${f.key}`);
        continue;
      }
      if (f.required && (value === "" || value === null))
        throw new BadRequestException(`REQUIRED:${f.key}`);
      if (
        f.type === "number" &&
        (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      )
        throw new BadRequestException(`INVALID_NUMBER:${f.key}`);
      if (f.type === "boolean" && typeof value !== "boolean")
        throw new BadRequestException(`INVALID_BOOLEAN:${f.key}`);
      if (
        ["string", "email", "select"].includes(f.type) &&
        (typeof value !== "string" || value.length > 2000)
      )
        throw new BadRequestException(`INVALID_STRING:${f.key}`);
      if (
        f.type === "email" &&
        value &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
      )
        throw new BadRequestException("INVALID_EMAIL");
      if (f.options && !f.options.includes(String(value)))
        throw new BadRequestException(`INVALID_OPTION:${f.key}`);
      result[f.key] =
        f.type === "email" ? String(value).trim().toLowerCase() : value;
    }
    return result;
  }
  async list(name: string, query: Record<string, unknown>, actor: Actor) {
    const def = this.definition(name);
    const { page, limit } = parsePage(query);
    const allowed = [
      "id",
      "createdAt",
      "updatedAt",
      ...def.fields.map((f) => f.key),
    ];
    const filters = parseFilters(query.filters, allowed);
    const sort = String(query.sortBy ?? "createdAt");
    if (!allowed.includes(sort)) throw new BadRequestException("INVALID_SORT");
    let items = (await this.repo.list(name)).filter((x) =>
      this.visible(name, x, actor),
    );
    items = items.filter((x) =>
      Object.entries(filters).every(([k, v]) => x[k] === v),
    );
    if (query.search) {
      const q = String(query.search).toLowerCase();
      items = items.filter((x) =>
        def.fields.some((f) =>
          String(x[f.key] ?? "")
            .toLowerCase()
            .includes(q),
        ),
      );
    }
    items.sort((a, b) => {
      const x = a[sort],
        y = b[sort];
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x ?? "").localeCompare(String(y ?? ""));
      return (
        (query.sortOrder === "asc" ? 1 : -1) * cmp || a.id.localeCompare(b.id)
      );
    });
    return {
      items: items
        .slice((page - 1) * limit, page * limit)
        .map((x) => this.clean(x)),
      total: items.length,
      page,
      limit,
      totalPages: Math.ceil(items.length / limit),
    };
  }
  async get(name: string, id: string, actor: Actor) {
    this.definition(name);
    const item = (await this.repo.list(name)).find(
      (x) => x.id === id && this.visible(name, x, actor),
    );
    if (!item) throw new NotFoundException("RECORD_NOT_FOUND");
    return this.clean(item);
  }
  async create(name: string, body: unknown, actor: Actor) {
    const data = this.validate(this.writable(name, actor), body);
    const now = new Date().toISOString();
    const item: RecordEntity = {
      ...data,
      id: randomUUID(),
      version: 1,
      organizationId: actor.organizationId,
      createdAt: now,
      updatedAt: now,
    };
    if (name === "users") {
      item.organizationId = String(data.organizationId);
      item.passwordHash = await bcrypt.hash(randomUUID(), 12);
      item.active = data.active ?? true;
    }
    await this.repo.mutate(
      name,
      (items) => {
        if (
          items.some(
            (x) =>
              (data.code && x.code === data.code) ||
              (data.email && x.email === data.email),
          )
        )
          throw new ConflictException("DUPLICATE_RECORD");
        items.push(item);
      },
      this.auditRecord("CREATE", name, item.id, actor),
    );
    return this.clean(item);
  }
  async update(name: string, id: string, body: unknown, actor: Actor) {
    const data = this.validate(this.writable(name, actor), body, true);
    await this.get(name, id, actor);
    if (
      name === "users" &&
      id === actor.id &&
      (data.role !== undefined || data.active === false)
    )
      throw new ForbiddenException("CANNOT_REMOVE_OWN_ACCESS");
    const expected = (body as Record<string, unknown>).version;
    if (!Number.isInteger(expected))
      throw new BadRequestException("VERSION_REQUIRED");
    let updated!: RecordEntity;
    await this.repo.mutate(
      name,
      (items) => {
        const i = items.findIndex(
          (x) => x.id === id && this.visible(name, x, actor),
        );
        if (i < 0) throw new NotFoundException();
        if (items[i].version !== expected)
          throw new ConflictException("VERSION_CONFLICT");
        if (
          items.some(
            (x) =>
              x.id !== id &&
              ((data.code && x.code === data.code) ||
                (data.email && x.email === data.email)),
          )
        )
          throw new ConflictException("DUPLICATE_RECORD");
        updated = {
          ...items[i],
          ...data,
          version: items[i].version + 1,
          updatedAt: new Date().toISOString(),
        };
        items[i] = updated;
      },
      this.auditRecord("UPDATE", name, id, actor),
    );
    return this.clean(updated);
  }
  async remove(name: string, id: string, actor: Actor) {
    this.writable(name, actor);
    await this.get(name, id, actor);
    if (name === "users" && id === actor.id)
      throw new ForbiddenException("CANNOT_DELETE_SELF");
    await this.repo.mutate(
      name,
      (items) => {
        const index = items.findIndex(
          (x) => x.id === id && this.visible(name, x, actor),
        );
        if (index < 0) throw new NotFoundException();
        items.splice(index, 1);
      },
      this.auditRecord("DELETE", name, id, actor),
    );
    return { deleted: true };
  }

  async import(name: string, body: unknown, actor: Actor) {
    const def = this.writable(name, actor);
    if (
      !body ||
      typeof body !== "object" ||
      !Array.isArray((body as any).items) ||
      (body as any).items.length > 500
    )
      throw new BadRequestException("INVALID_IMPORT");
    const prepared: RecordEntity[] = [];
    for (const value of (body as any).items) {
      const data = this.validate(def, value);
      const now = new Date().toISOString();
      const item: RecordEntity = {
        ...data,
        id: randomUUID(),
        version: 1,
        createdAt: now,
        updatedAt: now,
        organizationId: actor.organizationId,
      };
      if (name === "users") {
        item.organizationId = String(data.organizationId);
        item.passwordHash = await bcrypt.hash(randomUUID(), 12);
        item.active = data.active ?? true;
      }
      prepared.push(item);
    }
    await this.repo.mutate(
      name,
      (items) => {
        const all = [...items];
        for (const item of prepared) {
          if (
            all.some(
              (x) =>
                (item.code && x.code === item.code) ||
                (item.email && x.email === item.email),
            )
          )
            throw new ConflictException("DUPLICATE_RECORD");
          all.push(item);
        }
        items.push(...prepared);
      },
      this.auditRecord("IMPORT", name, String(prepared.length), actor),
    );
    return { created: prepared.length };
  }
  async bulkDelete(name: string, body: unknown, actor: Actor) {
    this.writable(name, actor);
    const ids = (body as any)?.ids;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 500 ||
      ids.some((x) => typeof x !== "string")
    )
      throw new BadRequestException("INVALID_BATCH");
    if (name === "users" && ids.includes(actor.id))
      throw new ForbiddenException("CANNOT_DELETE_SELF");
    await this.repo.mutate(
      name,
      (items) => {
        for (const id of ids)
          if (!items.some((x) => x.id === id && this.visible(name, x, actor)))
            throw new NotFoundException("RECORD_NOT_FOUND");
        for (let i = items.length - 1; i >= 0; i--)
          if (ids.includes(items[i].id)) items.splice(i, 1);
      },
      this.auditRecord("BULK_DELETE", name, ids.join(","), actor),
    );
    return { deleted: ids.length };
  }
  auditRecord(
    action: string,
    resource: string,
    recordId: string,
    actor: Actor,
  ): RecordEntity {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      version: 1,
      createdAt: now,
      updatedAt: now,
      organizationId: actor.organizationId,
      action,
      resource,
      recordId,
      actorId: actor.id,
    };
  }
  async audit(
    action: string,
    resource: string,
    recordId: string,
    actor: Actor,
  ) {
    const now = new Date().toISOString();
    await this.repo.mutate("audit", (items) =>
      items.push({
        id: randomUUID(),
        version: 1,
        createdAt: now,
        updatedAt: now,
        organizationId: actor.organizationId,
        action,
        resource,
        recordId,
        actorId: actor.id,
      }),
    );
  }
}
