import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { streamChanges } from "../api/notifications.api";

export type LiveStatus = "connecting" | "live" | "offline";

/** Waits before reconnecting: 1 s, doubling to at most 30 s. */
const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt);

/**
 * Keeps one change stream open while the user is signed in. When another person's write lands,
 * the open screens re-read their data at once (the regular polling stays as a fallback). Only
 * read markers changing is ignored unless it is the user's own. The stream carries collection
 * names only; every refreshed query goes through the normal, scoped endpoints.
 */
export function useLiveUpdates(userId: string): LiveStatus {
  const cache = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  useEffect(() => {
    const controller = new AbortController();
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = async () => {
      setStatus("connecting");
      try {
        await streamChanges(
          (resources) => {
            const onlyMarkers = resources.every(
              (name) => name === "notification-cursors",
            );
            if (onlyMarkers)
              void cache.invalidateQueries({
                queryKey: ["notification-cursor", userId],
              });
            else void cache.invalidateQueries({ type: "active" });
          },
          () => {
            attempt = 0;
            setStatus("live");
          },
          controller.signal,
        );
      } catch {
        /* Network drop, server restart or sign-out: fall through to the retry below. */
      }
      if (controller.signal.aborted) return;
      setStatus("offline");
      timer = setTimeout(() => void connect(), backoff(attempt++));
    };
    void connect();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [cache, userId]);
  return status;
}
