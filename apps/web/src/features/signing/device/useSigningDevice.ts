import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deviceClient,
  getDeviceSession,
  type DeviceCredential,
  type DeviceTransaction,
} from "./deviceApi";

/** Waits before reconnecting the device stream: 1 s, doubling to at most 30 s. */
const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt);

/**
 * The simulated signing device of the signed-in person (the phone app or USB token of a remote
 * signing service). It talks to the signing service directly with a device session CodeCash
 * issued, hears new requests on the service's event stream, and approves with the PIN. When
 * CodeCash does not sign through the service, `enabled` is false and nothing else runs.
 */
export function useSigningDevice(userId: string) {
  const cache = useQueryClient();
  const base = ["signing-device", userId];
  const session = useQuery({
    queryKey: base,
    queryFn: getDeviceSession,
    retry: false,
    staleTime: 10 * 60_000,
  });
  const client = useMemo(
    () => (session.data ? deviceClient(session.data) : null),
    [session.data],
  );
  const credential = useQuery({
    queryKey: [...base, "credential"],
    queryFn: () => client!.get<DeviceCredential>("/v1/device/credential"),
    enabled: !!client,
  });
  const transactions = useQuery({
    queryKey: [...base, "transactions"],
    queryFn: () =>
      client!
        .get<{ items: DeviceTransaction[] }>("/v1/device/transactions")
        .then((r) => r.items),
    enabled: !!client,
    refetchInterval: 20_000,
  });

  // The service pushes every change of this person's requests; the list re-reads on each.
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!client) return;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;
    const connect = async () => {
      if (stopped || controller || document.hidden) return;
      const current = new AbortController();
      controller = current;
      try {
        await client.stream(
          "/v1/device/events",
          ({ event }) => {
            if (event === "ready") {
              attempt = 0;
              setLive(true);
            } else
              void cache.invalidateQueries({
                queryKey: ["signing-device", userId, "transactions"],
              });
          },
          current.signal,
        );
      } catch {
        /* dropped, or the session expired: reconnect below */
      }
      if (controller === current) controller = null;
      setLive(false);
      if (stopped || current.signal.aborted) return;
      timer = setTimeout(() => {
        timer = undefined;
        void cache.invalidateQueries({ queryKey: ["signing-device", userId] });
      }, backoff(attempt++));
    };
    const onVisibility = () => {
      if (document.hidden) controller?.abort();
      else void connect();
    };
    const onPageHide = () => controller?.abort();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    void connect();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      controller?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [client, cache, userId]);

  const refresh = () => {
    void cache.invalidateQueries({ queryKey: [...base, "transactions"] });
    void cache.invalidateQueries({ queryKey: [...base, "credential"] });
  };
  const approve = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: string }) =>
      client!.post<DeviceTransaction>(
        `/v1/device/transactions/${encodeURIComponent(id)}/approve`,
        { pin },
      ),
    onSettled: refresh,
  });
  const reject = useMutation({
    mutationFn: (id: string) =>
      client!.post<DeviceTransaction>(
        `/v1/device/transactions/${encodeURIComponent(id)}/reject`,
        {},
      ),
    onSettled: refresh,
  });

  const now = Date.now();
  const pending = (transactions.data ?? []).filter(
    (t) => t.status === "PENDING" && Date.parse(t.expiresAt) > now,
  );
  return {
    enabled: session.isSuccess,
    loading: session.isPending,
    session: session.data,
    credential: credential.data,
    transactions: transactions.data ?? [],
    pending,
    live,
    approve,
    reject,
  };
}

export type SigningDevice = ReturnType<typeof useSigningDevice>;
