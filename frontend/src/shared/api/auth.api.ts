import { db } from '../mock/db';
import { MOCK_PASSWORD } from '../mock/users';
import { ApiError, simulateLatency } from './client';
import type { User } from './types';

export async function signIn(email: string, password: string): Promise<User> {
  const user = db.users.find((candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase());
  if (!user || password !== MOCK_PASSWORD) {
    await simulateLatency(null);
    throw new ApiError('INVALID_CREDENTIALS');
  }
  return simulateLatency(user);
}

export async function getUser(userId: string): Promise<User | null> {
  const user = db.users.find((candidate) => candidate.id === userId) ?? null;
  return simulateLatency(user, 40);
}
