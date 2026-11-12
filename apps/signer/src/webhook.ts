import { webhookSignature } from "./auth";

/** Waits between delivery attempts: 1 s, 5 s, 25 s. */
const BACKOFF_MS = [1000, 5000, 25000];

/**
 * Posts an event to the relying party's callback, signed with the shared webhook secret, and
 * retries a few times. The relying party also polls, so a lost webhook only delays the result.
 */
export async function deliver(
  url: string,
  secret: string,
  event: Record<string, unknown>,
  onAttempt: (result: { ok: boolean; error: string | null }) => void,
) {
  const body = JSON.stringify(event);
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signer-Event": String(event.type),
          "X-Signer-Signature": webhookSignature(secret, body),
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) return onAttempt({ ok: true, error: null });
      onAttempt({ ok: false, error: `HTTP ${response.status}` });
    } catch (error) {
      onAttempt({ ok: false, error: (error as Error).message });
    }
    if (attempt < BACKOFF_MS.length)
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
  }
}
