export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export async function simulateLatency<T>(value: T, _ms?: number): Promise<T> {
  return value;
}
