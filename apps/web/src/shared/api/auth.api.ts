import { platform } from "./platform";
import type { User } from "./types";
export async function signIn(email: string, password: string): Promise<User> {
  const result = await platform.login(email, password);
  localStorage.setItem("codecash.accessToken", result.token);
  return result.user;
}
export async function getUser(_userId: string): Promise<User | null> {
  try {
    return await platform.get<User>("/auth/me");
  } catch {
    return null;
  }
}
