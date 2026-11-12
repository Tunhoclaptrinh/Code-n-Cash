import { platform } from "./platform";

/** When the signed-in user last marked updates as read (server side, follows them across devices). */
export const getNotificationCursor = () =>
  platform.get<{ seenAt: string | null }>("/notifications/cursor");

/** Moves the read marker forward; the server ignores a time older than the stored one. */
export const markNotificationsSeen = (seenAt: string) =>
  platform.put<{ seenAt: string }>("/notifications/cursor", { seenAt });

/** Server-sent events naming the collections a write touched; ends when `signal` aborts. */
export const streamChanges = (
  onChange: (resources: string[]) => void,
  onReady: () => void,
  signal: AbortSignal,
) =>
  platform.stream(
    "/notifications/stream",
    ({ event, data }) => {
      if (event === "ready") return onReady();
      if (event !== "change") return;
      try {
        const parsed = JSON.parse(data) as { resources?: unknown };
        if (Array.isArray(parsed.resources))
          onChange(parsed.resources.map(String));
      } catch {
        /* A malformed event is skipped; the next poll catches up. */
      }
    },
    signal,
  );
