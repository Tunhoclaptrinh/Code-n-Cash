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
import { toCsv } from "../utils/csv";
import { can, scopeOf } from "../permissions";
import type { Actor, Field, Resource, RecordEntity } from "../types";

/** Each operation maps to `<resource>:<operation>` in packages/contracts/permissions.json. */
type Operation = "read" | "create" | "update" | "delete" | "import" | "export";
const MAX_BATCH = 500;

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
  private access(name: string, actor: Actor, operation: Operation) {
    const def = this.definition(name);
    if (def.readOnly && !["read", "export"].includes(operation))
      throw new ForbiddenException("APPEND_ONLY_RESOURCE");
    if (!can(actor.role, `${name}:${operation}`))
      throw new ForbiddenException("PERMISSION_DENIED");
    return def;
  }
  private visible(name: string, item: RecordEntity, actor: Actor) {
    return (
      scopeOf(actor.role, `${name}:read`) === "all" ||
      item.organizationId === actor.organizationId
    );
  }
  private clean(item: RecordEntity) {
    const { passwordHash, tokenVersion, ...safe } = item;
    return safe;
  }
  /** Every problem with one record, in field order; `validate` reports only the first. */
  private fieldErrors(def: Resource, body: unknown, partial = false) {
    if (!body || typeof body !== "object" || Array.isArray(body))
      return { errors: ["INVALID_BODY"], data: {} };
    const input = body as Record<string, unknown>;
    const allowed = [...def.fields.map((f) => f.key), "version"];
    const errors: string[] = [];
    if (Object.keys(input).some((k) => !allowed.includes(k)))
      errors.push("UNKNOWN_FIELD");
    const data: Record<string, unknown> = {};
    for (const f of def.fields) {
      const value = input[f.key];
      if (value === undefined) {
        if (f.required && !partial) errors.push(`REQUIRED:${f.key}`);
        continue;
      }
      if (f.required && (value === "" || value === null)) {
        errors.push(`REQUIRED:${f.key}`);
        continue;
      }
      const error = this.valueError(f, value);
      if (error) {
        errors.push(error);
        continue;
      }
      data[f.key] =
        f.type === "email" ? String(value).trim().toLowerCase() : value;
    }
    return { errors, data };
  }
  private valueError(f: Field, value: unknown): string | undefined {
    if (
      f.type === "number" &&
      (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    )
      return `INVALID_NUMBER:${f.key}`;
    if (f.type === "boolean" && typeof value !== "boolean")
      return `INVALID_BOOLEAN:${f.key}`;
    if (
      ["string", "email", "select"].includes(f.type) &&
      (typeof value !== "string" || value.length > 2000)
    )
      return `INVALID_STRING:${f.key}`;
    if (
      f.type === "email" &&
      value &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
    )
      return "INVALID_EMAIL";
    if (f.options && !f.options.includes(String(value)))
      return `INVALID_OPTION:${f.key}`;
    return undefined;
  }
  private validate(def: Resource, body: unknown, partial = false) {
    const { errors, data } = this.fieldErrors(def, body, partial);
    if (errors.length) throw new BadRequestException(errors[0]);
    return data;
  }
  /** Ids referenced by `ref` fields that do not exist in the target resource. */
  private async referenceErrors(
    def: Resource,
    data: Record<string, unknown>,
    cache = new Map<string, Set<string>>(),
  ) {
    const errors: string[] = [];
    for (const f of def.fields) {
      if (!f.ref || data[f.key] === undefined || data[f.key] === "") continue;
      if (!cache.has(f.ref))
        cache.set(
          f.ref,
          new Set((await this.repo.list(f.ref)).map((item) => item.id)),
        );
      if (!cache.get(f.ref)!.has(String(data[f.key])))
        errors.push(`INVALID_REFERENCE:${f.key}`);
    }
    return errors;
  }
  private async checkReferences(def: Resource, data: Record<string, unknown>) {
    const errors = await this.referenceErrors(def, data);
    if (errors.length) throw new BadRequestException(errors[0]);
  }
  private duplicate(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
  ): boolean {
    return Boolean(
      (a.code && b.code === a.code) || (a.email && b.email === a.email),
    );
  }
  /** Scoped, filtered, searched and sorted records; `list` pages them and `export` takes all. */
  private async query(
    def: Resource,
    query: Record<string, unknown>,
    actor: Actor,
  ) {
    const allowed = [
      "id",
      "createdAt",
      "updatedAt",
      ...def.fields.map((f) => f.key),
    ];
    const filters = parseFilters(query.filters, allowed);
    const sort = String(query.sortBy ?? "createdAt");
    if (!allowed.includes(sort)) throw new BadRequestException("INVALID_SORT");
    if (query.sortOrder && !["asc", "desc"].includes(String(query.sortOrder)))
      throw new BadRequestException("INVALID_SORT");
    let items = (await this.repo.list(def.name)).filter((x) =>
      this.visible(def.name, x, actor),
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
    return items;
  }
  async list(name: string, query: Record<string, unknown>, actor: Actor) {
    const def = this.access(name, actor, "read");
    const { page, limit } = parsePage(query);
    const items = await this.query(def, query, actor);
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
    this.access(name, actor, "read");
    const item = (await this.repo.list(name)).find(
      (x) => x.id === id && this.visible(name, x, actor),
    );
    if (!item) throw new NotFoundException("RECORD_NOT_FOUND");
    return this.clean(item);
  }
  private async newRecord(
    name: string,
    data: Record<string, unknown>,
    actor: Actor,
  ): Promise<RecordEntity> {
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
    return item;
  }
  async create(name: string, body: unknown, actor: Actor) {
    const def = this.access(name, actor, "create");
    const data = this.validate(def, body);
    await this.checkReferences(def, data);
    const item = await this.newRecord(name, data, actor);
    await this.repo.mutate(
      name,
      (items) => {
        if (items.some((x) => this.duplicate(data, x)))
          throw new ConflictException("DUPLICATE_RECORD");
        items.push(item);
      },
      this.auditRecord("CREATE", name, item.id, actor),
    );
    return this.clean(item);
  }
  async update(name: string, id: string, body: unknown, actor: Actor) {
    const def = this.access(name, actor, "update");
    const data = this.validate(def, body, true);
    await this.checkReferences(def, data);
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
        if (items.some((x) => x.id !== id && this.duplicate(data, x)))
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
    this.access(name, actor, "delete");
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
  private importRows(body: unknown): unknown[] {
    const rows = (body as { items?: unknown })?.items;
    if (!Array.isArray(rows) || !rows.length || rows.length > MAX_BATCH)
      throw new BadRequestException("INVALID_IMPORT");
    return rows;
  }
  /**
   * Dry run of an import: one result per row with every problem found, so the user can fix the
   * file before anything is written (Base import-export: validate, then import).
   */
  async validateImport(name: string, body: unknown, actor: Actor) {
    const def = this.access(name, actor, "import");
    const rows = this.importRows(body);
    const existing = await this.repo.list(name);
    const cache = new Map<string, Set<string>>();
    const accepted: Record<string, unknown>[] = [];
    const results = [];
    for (const [index, row] of rows.entries()) {
      const { errors, data } = this.fieldErrors(def, row);
      errors.push(...(await this.referenceErrors(def, data, cache)));
      if (
        [...existing, ...accepted].some((other) => this.duplicate(data, other))
      )
        errors.push("DUPLICATE_RECORD");
      if (!errors.length) accepted.push(data);
      results.push({
        row: index + 1,
        data: row,
        status: errors.length ? "invalid" : "valid",
        errors,
      });
    }
    const valid = results.filter((r) => r.status === "valid").length;
    return {
      summary: { total: rows.length, valid, error: rows.length - valid },
      results,
    };
  }
  /** All-or-nothing: one invalid row rejects the whole file. */
  async import(name: string, body: unknown, actor: Actor) {
    const def = this.access(name, actor, "import");
    const rows = this.importRows(body);
    const cache = new Map<string, Set<string>>();
    const prepared: RecordEntity[] = [];
    for (const value of rows) {
      const data = this.validate(def, value);
      const references = await this.referenceErrors(def, data, cache);
      if (references.length) throw new BadRequestException(references[0]);
      prepared.push(await this.newRecord(name, data, actor));
    }
    await this.repo.mutate(
      name,
      (items) => {
        const all = [...items];
        for (const item of prepared) {
          if (all.some((x) => this.duplicate(item, x)))
            throw new ConflictException("DUPLICATE_RECORD");
          all.push(item);
        }
        items.push(...prepared);
      },
      this.auditRecord("IMPORT", name, String(prepared.length), actor),
    );
    return { created: prepared.length };
  }
  /** Header row plus one sample row, in the column order the import expects. */
  async template(name: string, actor: Actor) {
    const def = this.access(name, actor, "import");
    const sample: Record<string, unknown> = {};
    for (const f of def.fields) {
      const ref = f.ref ? (await this.repo.list(f.ref))[0]?.id : undefined;
      sample[f.key] =
        ref ??
        (f.options
          ? f.options[0]
          : f.type === "boolean"
            ? true
            : f.type === "number"
              ? 1
              : f.type === "email"
                ? "name@example.com"
                : "");
    }
    return toCsv(
      def.fields.map((f) => f.key),
      [sample],
    );
  }
  /**
   * Server-side export of the whole filtered result (Base import-export). Reference fields get a
   * `<field>_name` column with the referenced record's name.
   */
  async export(name: string, query: Record<string, unknown>, actor: Actor) {
    const def = this.access(name, actor, "export");
    const format = String(query.format ?? "csv");
    if (!["csv", "json"].includes(format))
      throw new BadRequestException("INVALID_FORMAT");
    let items = (await this.query(def, query, actor)).map((x) => this.clean(x));
    if (query.limit !== undefined) {
      const limit = Number(query.limit);
      const page = Number(query.page ?? 1);
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        !Number.isInteger(page) ||
        page < 1
      )
        throw new BadRequestException("INVALID_PAGINATION");
      items = items.slice((page - 1) * limit, page * limit);
    }
    const available = [
      "id",
      ...def.fields.map((f) => f.key),
      "createdAt",
      "updatedAt",
    ];
    const requested = query.columns
      ? String(query.columns).split(",").filter(Boolean)
      : def.fields.map((f) => f.key);
    if (requested.some((column) => !available.includes(column)))
      throw new BadRequestException("INVALID_COLUMN");
    const names = new Map<string, Map<string, string>>();
    for (const f of def.fields.filter(
      (f) => f.ref && requested.includes(f.key),
    ))
      if (!names.has(f.ref!))
        names.set(
          f.ref!,
          new Map(
            (await this.repo.list(f.ref!)).map((r) => [r.id, String(r.name)]),
          ),
        );
    const columns = requested.flatMap((column) => {
      const field = def.fields.find((f) => f.key === column);
      return field?.ref ? [column, `${column}_name`] : [column];
    });
    const rows = items.map((item) =>
      Object.fromEntries(
        columns.map((column) => {
          if (column.endsWith("_name")) {
            const key = column.slice(0, -"_name".length);
            const field = def.fields.find((f) => f.key === key);
            if (field?.ref)
              return [
                column,
                names.get(field.ref)?.get(String(item[key])) ?? "",
              ];
          }
          return [column, item[column] ?? ""];
        }),
      ),
    );
    await this.audit("EXPORT", name, String(rows.length), actor);
    return format === "json"
      ? { contentType: "application/json", body: JSON.stringify(rows, null, 2) }
      : { contentType: "text/csv; charset=utf-8", body: toCsv(columns, rows) };
  }
  async bulkDelete(name: string, body: unknown, actor: Actor) {
    this.access(name, actor, "delete");
    const ids = (body as any)?.ids;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > MAX_BATCH ||
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
    await this.repo.mutate("audit", (items) =>
      items.push(this.auditRecord(action, resource, recordId, actor)),
    );
  }
}
