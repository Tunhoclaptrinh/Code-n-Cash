import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { streamChanges } from "../api/notifications.api";

export type LiveStatus = "connecting" | "live" | "offline";

/** Waits before reconnecting: 1 s, doubling to at most 30 s. */
const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt);

/**
 * Keeps one change stream open while the user is signed in and the tab is visible. When another
 * person's write lands, the open screens re-read their data at once (the regular polling stays as
 * a fallback). Only read markers changing is ignored unless it is the user's own. The stream
 * carries collection names only; every refreshed query goes through the normal, scoped endpoints.
 *
 * A stream holds one HTTP/1.1 connection, and browsers allow six per host: a hidden tab therefore
 * closes its stream (and re-reads once when shown again), and a page being left closes it at once,
 * so several tabs or quick reloads never starve the app's other requests.
 */
export function useLiveUpdates(userId: string): LiveStatus {
  const cache = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  useEffect(() => {
    let controller: AbortController | null = null;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const close = () => {
      controller?.abort();
      controller = null;
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const connect = async () => {
      if (stopped || controller || document.hidden) return;
      const current = new AbortController();
      controller = current;
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
          current.signal,
        );
      } catch {
        /* Network drop, server restart or sign-out: fall through to the retry below. */
      }
      if (controller === current) controller = null;
      if (stopped || current.signal.aborted) return;
      setStatus("offline");
      timer = setTimeout(() => {
        timer = undefined;
        void connect();
      }, backoff(attempt++));
    };
    const onVisibility = () => {
      if (document.hidden) {
        close();
        setStatus("offline");
      } else {
        attempt = 0;
        // Whatever changed while the tab was hidden is read once, then the stream takes over.
        void cache.invalidateQueries({ type: "active" });
        void connect();
      }
    };
    const onPageHide = () => close();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    void connect();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      close();
    };
  }, [cache, userId]);
  return status;
}
