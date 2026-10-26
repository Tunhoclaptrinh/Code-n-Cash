import {
  Injectable,
  Inject,
  Controller,
  Post,
  Get,
  Body,
  Req,
  Param,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  CanActivate,
  ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Repository } from "./common/repository";
import { Public } from "./common/decorators/roles.decorator";
import { RequirePermission, permissionsFor } from "./common/permissions";
import type { Actor, SessionRequest, Role, RecordEntity } from "./common/types";
import { buildDirectory, FEATURED_ACCOUNTS } from "./domain/accounts";
import { loadDataPack } from "./domain/datapack";
import { DomainService } from "./domain/service";
import { TrustService } from "./trust/service";
import { auditContext } from "./common/audit-events";
/**
 * One-click demo sign-in: on by default in development, off in production unless DEMO_LOGIN=true.
 * Never enable it on a deployment that holds real data.
 */
export function demoLoginEnabled() {
  if (process.env.DEMO_LOGIN === "true") return true;
  if (process.env.DEMO_LOGIN === "false") return false;
  return process.env.NODE_ENV !== "production";
}
@Injectable()
export class AuthService {
  private secret = process.env.JWT_SECRET || randomBytes(48).toString("hex");
  constructor(@Inject(Repository) private repo: Repository) {
    if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET)
      throw new Error("JWT_SECRET is required");
  }
  actor(record: RecordEntity): Actor {
    return {
      id: record.id,
      email: String(record.email),
      displayName: String(record.displayName),
      role: record.role as Role,
      organizationId: String(record.organizationId),
      roleChipOrganization: String(
        record.roleChipOrganization ?? record.organizationId,
      ),
      partyId: record.partyId ? String(record.partyId) : null,
      title: String(record.title ?? ""),
      permissions: permissionsFor(record.role as Role),
      active: record.active !== false,
    };
  }
  async login(body: unknown) {
    if (!body || typeof body !== "object")
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    const { email, password } = body as Record<string, unknown>;
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 1024
    )
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    const user = (await this.repo.list("users")).find(
      (x) => String(x.email).toLowerCase() === email.trim().toLowerCase(),
    );
    if (
      !user ||
      user.active === false ||
      !(await bcrypt.compare(password, String(user.passwordHash)))
    )
      throw new UnauthorizedException("INVALID_CREDENTIALS");
    await this.recordAccess("LOGIN", user);
    return this.session(user);
  }
  private session(user: RecordEntity) {
    return {
      token: jwt.sign(
        { sub: user.id, tv: user.tokenVersion ?? 0 },
        this.secret,
        {
          expiresIn: "8h",
          issuer: "codecash",
          audience: "codecash-web",
        },
      ),
      user: this.actor(user),
    };
  }
  private async recordAccess(action: string, user: RecordEntity) {
    const now = new Date().toISOString();
    await this.repo.mutate("audit", (entries) =>
      entries.push({
        id: randomBytes(16).toString("hex"),
        version: 1,
        createdAt: now,
        updatedAt: now,
        organizationId: user.organizationId,
        actorId: user.id,
        actorName: user.displayName,
        actorRole: user.role,
        action,
        resource: "users",
        recordId: user.id,
      }),
    );
  }
  /** Seeded accounts: the featured ones first, then every organisation of the Data Pack. */
  async demoAccounts() {
    if (!demoLoginEnabled())
      return { enabled: false, accounts: [], organizations: [] };
    const users = (await this.repo.list("users")).filter(
      (u) => u.origin === "SEED" && u.active !== false,
    );
    // Contract codes of each organisation, drafts included, so the demo menu finds "who acts on CT0105".
    const contractsOf = new Map<string, Set<string>>();
    const link = (party: unknown, code: unknown) => {
      if (!party || !code) return;
      const codes = contractsOf.get(String(party)) ?? new Set<string>();
      codes.add(String(code));
      contractsOf.set(String(party), codes);
    };
    for (const c of await this.repo.list("contracts")) {
      link(c.buyer_id, c.contract_id);
      link(c.supplier_id, c.contract_id);
    }
    for (const d of await this.repo.list("contract-drafts")) {
      link(d.organizationId, d.code);
      link(d.supplierId, d.code);
    }
    const view = (u: RecordEntity) => ({
      email: String(u.email),
      displayName: String(u.displayName),
      role: u.role as Role,
      organization: String(u.roleChipOrganization ?? ""),
      organizationId: String(u.organizationId),
      partyId: u.partyId ? String(u.partyId) : null,
      contracts: [...(contractsOf.get(String(u.organizationId)) ?? [])],
    });
    const groups = new Map<string, ReturnType<typeof view>[]>();
    for (const user of users) {
      if (FEATURED_ACCOUNTS.includes(user.id)) continue;
      const list = groups.get(String(user.organizationId)) ?? [];
      list.push(view(user));
      groups.set(String(user.organizationId), list);
    }
    return {
      enabled: true,
      accounts: FEATURED_ACCOUNTS.map((id) => users.find((u) => u.id === id))
        .filter((u): u is RecordEntity => !!u)
        .map(view),
      organizations: [...groups]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, accounts]) => ({
          id,
          name: accounts[0].organization,
          accounts,
        })),
    };
  }
  async demoLogin(body: unknown) {
    if (!demoLoginEnabled()) throw new NotFoundException("DEMO_LOGIN_DISABLED");
    const email = String((body as { email?: unknown })?.email ?? "")
      .trim()
      .toLowerCase();
    const user = (await this.repo.list("users")).find(
      (x) =>
        x.origin === "SEED" &&
        String(x.email).toLowerCase() === email &&
        x.active !== false,
    );
    if (!user) throw new UnauthorizedException("INVALID_CREDENTIALS");
    const now = new Date().toISOString();
    await this.repo.mutate("audit", (items) =>
      items.push({
        id: randomBytes(16).toString("hex"),
        version: 1,
        createdAt: now,
        updatedAt: now,
        organizationId: String(user.organizationId),
        actorId: user.id,
        actorName: user.displayName,
        actorRole: user.role,
        action: "LOGIN_DEMO",
        resource: "users",
        recordId: user.id,
      }),
    );
    return this.session(user);
  }
  async authenticate(token: string) {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: "codecash",
        audience: "codecash-web",
      }) as jwt.JwtPayload;
      const user = (await this.repo.list("users")).find(
        (x) => x.id === decoded.sub,
      );
      if (
        !user ||
        user.active === false ||
        decoded.tv !== (user.tokenVersion ?? 0)
      )
        throw new Error();
      return this.actor(user);
    } catch {
      throw new UnauthorizedException("INVALID_SESSION");
    }
  }
  async resetPassword(id: string, password: unknown, actor: Actor) {
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128
    )
      throw new BadRequestException("PASSWORD_MINIMUM_12_CHARACTERS");
    const passwordHash = await bcrypt.hash(password, 12);
    await this.repo.mutate(
      "users",
      (items) => {
        const user = items.find((x) => x.id === id);
        if (!user) throw new NotFoundException("USER_NOT_FOUND");
        user.passwordHash = passwordHash;
        user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
        user.version++;
        user.updatedAt = new Date().toISOString();
      },
      {
        id: randomBytes(16).toString("hex"),
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "RESET_PASSWORD",
        resource: "users",
        recordId: id,
      },
    );
    return { updated: true };
  }
  async logout(actor: Actor) {
    await this.repo.transact(
      ["users"],
      (tables) => {
        const items = tables.users;
        const user = items.find((x) => x.id === actor.id);
        if (user) user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
      },
      () => [
        {
          id: randomBytes(16).toString("hex"),
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          organizationId: actor.organizationId,
          actorId: actor.id,
          actorName: actor.displayName,
          actorRole: actor.role,
          action: "LOGOUT",
          resource: "users",
          recordId: actor.id,
        },
      ],
    );
    return { loggedOut: true };
  }
  /**
   * Creates the seed accounts of buildDirectory (one person per Data Pack party, plus two internal
   * controllers). Existing passwords are kept; accounts created before the Data Pack import are
   * relinked to their party.
   */
  async seed() {
    // The parties table is filled by the Data Pack import; read the file when it is not there yet.
    const stored = await this.repo.list("parties");
    const parties = stored.length ? stored : (await loadDataPack()).parties;
    const { accounts } = buildDirectory(parties as never);
    const passwordHash = await bcrypt.hash(
      process.env.SEED_PASSWORD ?? "Passw0rd!",
      12,
    );
    const now = new Date().toISOString();
    await this.repo.mutate("users", (items) => {
      const kept = new Set<RecordEntity>();
      for (const account of accounts) {
        const fields = {
          email: account.email,
          displayName: account.displayName,
          title: account.title,
          role: account.role,
          organizationId: account.organizationId,
          roleChipOrganization: account.organizationName,
          partyId: account.partyId,
          origin: account.origin,
        };
        const existing = items.find(
          (u) =>
            u.id === account.id ||
            String(u.email).toLowerCase() === account.email,
        );
        if (existing) kept.add(existing);
        if (existing && existing.partyId !== undefined) continue;
        if (existing)
          Object.assign(existing, fields, {
            version: existing.version + 1,
            updatedAt: now,
          });
        else {
          const created: RecordEntity = {
            id: account.id,
            ...fields,
            passwordHash,
            active: true,
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
          items.push(created);
          kept.add(created);
        }
      }
      // Seeded accounts the directory no longer has (the platform controllers that once decided
      // exceptions on every contract) are switched off, never deleted: audit entries name them.
      for (const user of items)
        if (user.origin === "SEED" && user.active !== false && !kept.has(user))
          Object.assign(user, {
            active: false,
            version: user.version + 1,
            updatedAt: now,
          });
    });
  }
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private reflector: Reflector,
    @Inject(AuthService) private auth: AuthService,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride("public", [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      throw new UnauthorizedException("AUTHENTICATION_REQUIRED");
    req.user = await this.auth.authenticate(header.slice(7));
    const context = auditContext.getStore();
    if (context) context.actor = req.user;
    return true;
  }
}
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private auth: AuthService,
    @Inject(DomainService) private domain: DomainService,
    @Inject(TrustService) private trust: TrustService,
  ) {}
  @Public() @Post("login") login(@Body() body: unknown) {
    return this.auth.login(body);
  }
  @Public() @Get("demo-accounts") demoAccounts() {
    return this.auth.demoAccounts();
  }
  @Public() @Post("demo-login") demoLogin(@Body() body: unknown) {
    return this.auth.demoLogin(body);
  }
  /** Demo deployments only, system administrator only; the previous data is archived, not deleted. */
  @RequirePermission("demo:reset")
  @Post("reset-demo")
  async resetDemo(@Req() req: SessionRequest) {
    if (!demoLoginEnabled()) throw new NotFoundException("DEMO_LOGIN_DISABLED");
    // Anchor the chain about to be archived, so its final head is witnessed outside the database.
    const anchor = await this.trust.anchorIfChanged(req.user).catch(() => null);
    const result = await this.domain.resetDemo(req.user, anchor?.id ?? null);
    await this.auth.seed();
    return result;
  }
  @Post("logout") logout(@Req() req: SessionRequest) {
    return this.auth.logout(req.user);
  }
  @Get("me") me(@Req() req: SessionRequest) {
    return req.user;
  }
  @RequirePermission("users:reset-password")
  @Post("users/:id/password")
  reset(
    @Param("id") id: string,
    @Body() body: { password: unknown },
    @Req() req: SessionRequest,
  ) {
    return this.auth.resetPassword(id, body?.password, req.user);
  }
}
