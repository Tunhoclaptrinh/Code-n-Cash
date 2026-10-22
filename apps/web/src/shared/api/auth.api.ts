import type { AuthResult, Role } from "@codecash/contracts";
import { platform } from "./platform";
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
}

/** Sample accounts offered on the sign-in page; empty when the API has demo sign-in off. */
export async function listDemoAccounts(): Promise<DemoAccount[]> {
  try {
    const result = await platform.get<{
      enabled: boolean;
      accounts: DemoAccount[];
    }>("/auth/demo-accounts");
    return result.enabled ? result.accounts : [];
  } catch {
    return [];
  }
}

export async function signInDemo(email: string): Promise<User> {
  return storeSession(
    await platform.post<AuthResult>("/auth/demo-login", { email }),
  );
}

export async function getUser(_userId: string): Promise<User | null> {
  try {
    return await platform.get<User>("/auth/me");
  } catch {
    return null;
  }
}
