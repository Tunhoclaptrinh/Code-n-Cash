import type { AuthResult, Role } from "@codecash/contracts";
import { ApiError as HttpError } from "@codecash/api-client";
import { platform } from "./platform";

const RESTORE_RETRIES = 4;
import type { User } from "./types";

function storeSession(result: AuthResult): User {
  localStorage.setItem("codecash.accessToken", result.token);
  return result.user;
}

export async function signIn(email: string, password: string): Promise<User> {
  return storeSession(await platform.login(email, password));
}

export interface DemoAccount {
  email: string;
  displayName: string;
  role: Role;
  organization: string;
  organizationId: string;
  partyId: string | null;
  /** Contract codes the account's organisation is a party to. */
  contracts: string[];
}

export interface DemoDirectory {
  enabled: boolean;
  /** Accounts of the demo buyer and supplier, plus the two controllers. */
  featured: DemoAccount[];
  /** Every other seeded account, by Data Pack organisation. */
  organizations: { id: string; name: string; accounts: DemoAccount[] }[];
}

/** Sample accounts offered on the sign-in page; empty when the API has demo sign-in off. */
export async function listDemoAccounts(): Promise<DemoDirectory> {
  const result = await platform.get<{
    enabled: boolean;
    accounts: DemoAccount[];
    organizations: DemoDirectory["organizations"];
  }>("/auth/demo-accounts");
  return {
    enabled: result.enabled,
    featured: result.enabled ? result.accounts : [],
    organizations: result.enabled ? (result.organizations ?? []) : [],
  };
}

/** Archives the current demo data, audit log included, and restarts from the initial data. */
export async function resetDemoData(): Promise<{ archive: string }> {
  return platform.post<{ archive: string }>("/auth/reset-demo", {});
}

export async function signInDemo(email: string): Promise<User> {
  return storeSession(
    await platform.post<AuthResult>("/auth/demo-login", { email }),
  );
}

/**
 * Restores the stored session. Only the API saying the token is no longer valid (401) ends it; a
 * gateway error or a dropped connection while the server restarts is retried, so a busy or restarting
 * server does not sign the user out.
 */
export async function getUser(_userId: string): Promise<User | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await platform.get<User>("/auth/me");
    } catch (error) {
      const signedOut = error instanceof HttpError && error.status === 401;
      if (signedOut || attempt >= RESTORE_RETRIES) return null;
      await new Promise((done) => setTimeout(done, 1000 * 2 ** attempt));
    }
  }
}
