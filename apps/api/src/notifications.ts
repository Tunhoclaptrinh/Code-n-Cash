import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { Repository } from "./common/repository";
import type { RecordEntity, SessionRequest } from "./common/types";

/** One row per user: the newest update time the user has marked as read. */
const CURSORS = "notification-cursors";
/** Changes inside this window reach a client as one event. */
const COALESCE_MS = 300;
/** A comment line keeps proxies from closing a quiet stream. */
const HEARTBEAT_MS = 25_000;
/**
 * A read marker is the `at` of the newest update the user saw, kept exactly as the activity log
 * writes it (local business time, optionally with an offset), so client and server compare the
 * same strings. Data Pack events may be dated after today, so a future time is allowed.
 */
const SEEN_AT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * The signed-in user's notification state. Reads and writes concern only the caller (the id comes
 * from the session), so every signed-in role may use them; no business record changes here.
 *
 * - `GET/PUT /notifications/cursor`: when the user last marked updates as read, kept on the
 *   server so it follows them across devices. It only moves forward; each move is audited.
 * - `GET /notifications/stream`: server-sent events naming the collections a committed write
 *   touched, so open screens refresh at once instead of waiting for their next poll. Events carry
 *   no rows; the client re-reads through the normal, scoped endpoints.
 */
@Controller("notifications")
export class NotificationsController {
  constructor(@Inject(Repository) private repo: Repository) {}

  @Get("cursor")
  async cursor(@Req() req: SessionRequest) {
    const row = (await this.repo.list(CURSORS)).find(
      (x) => x.id === req.user.id,
    );
    return { seenAt: (row?.seenAt as string | undefined) ?? null };
  }

  @Put("cursor")
  async markSeen(@Req() req: SessionRequest, @Body() body: unknown) {
    const actor = req.user;
    const value = (body as { seenAt?: unknown } | null)?.seenAt;
    if (
      typeof value !== "string" ||
      !SEEN_AT.test(value) ||
      !Number.isFinite(Date.parse(value))
    )
      throw new BadRequestException("INVALID_SEEN_AT");
    const seenAt = value;
    return this.repo
      .transact(
        [CURSORS],
        (tables) => {
          const rows = tables[CURSORS];
          const now = new Date().toISOString();
          const row = rows.find((x) => x.id === actor.id);
          if (!row) {
            rows.push({
              id: actor.id,
              version: 1,
              createdAt: now,
              updatedAt: now,
              organizationId: actor.organizationId,
              userId: actor.id,
              seenAt,
            } as RecordEntity);
            return { seenAt, moved: true };
          }
          // Never backwards: an older tab marking read must not bring old updates back.
          if (String(row.seenAt ?? "") >= seenAt)
            return { seenAt: String(row.seenAt), moved: false };
          row.seenAt = seenAt;
          row.updatedAt = now;
          row.version = Number(row.version ?? 0) + 1;
          return { seenAt, moved: true };
        },
        (result) =>
          result.moved
            ? [
                {
                  id: randomBytes(16).toString("hex"),
                  version: 1,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  organizationId: actor.organizationId,
                  actorId: actor.id,
                  actorName: actor.displayName,
                  actorRole: actor.role,
                  action: "MARK_NOTIFICATIONS_READ",
                  resource: CURSORS,
                  recordId: actor.id,
                } as RecordEntity,
              ]
            : [],
      )
      .then(({ seenAt: stored }) => ({ seenAt: stored }));
  }

  @Get("stream")
  stream(@Req() req: Request, @Res() res: Response) {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write("retry: 5000\n\n");
    res.write("event: ready\ndata: {}\n\n");
    let pending = new Set<string>();
    let timer: NodeJS.Timeout | undefined;
    const flush = () => {
      timer = undefined;
      const resources = [...pending].filter((name) => name !== "audit");
      pending = new Set();
      if (resources.length)
        res.write(`event: change\ndata: ${JSON.stringify({ resources })}\n\n`);
    };
    const off = this.repo.onChange((resources) => {
      for (const name of resources) pending.add(name);
      timer ??= setTimeout(flush, COALESCE_MS);
    });
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    req.on("close", () => {
      off();
      clearInterval(heartbeat);
      if (timer) clearTimeout(timer);
    });
  }
}
