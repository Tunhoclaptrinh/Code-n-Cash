/** Simulates network latency so loading states behave the way they would against a real API. */
export function simulateLatency<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(structuredClone(value)), ms);
  });
}

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.code = code;
  }
}
