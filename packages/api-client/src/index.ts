import type {
  AuthResult,
  PageQuery,
  PageResult,
  Entity,
} from "@codecash/contracts";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export interface ClientOptions {
  baseUrl: string;
  getToken?: () => string | null;
  onUnauthorized?: () => void;
  fetch?: typeof fetch;
}
export class ApiClient {
  constructor(private readonly options: ClientOptions) {}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    const token = this.options.getToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData))
      headers.set("Content-Type", "application/json");
    const response = await (this.options.fetch ?? fetch)(
      `${this.options.baseUrl}${path}`,
      { ...init, headers },
    );
    const contentType = response.headers.get("content-type") ?? "";
    const body =
      response.status === 204
        ? null
        : contentType.includes("json")
          ? await response.json()
          : await response.text();
    if (!response.ok) {
      if (response.status === 401) this.options.onUnauthorized?.();
      throw new ApiError(
        response.status,
        body?.code ?? "REQUEST_FAILED",
        Array.isArray(body?.message)
          ? body.message.join(", ")
          : (body?.message ?? response.statusText),
        body?.requestId,
      );
    }
    return (
      body && typeof body === "object" && "success" in body && "data" in body
        ? body.data
        : body
    ) as T;
  }
  async download(path: string, init: RequestInit = {}): Promise<Blob> {
    const headers = new Headers(init.headers);
    const token = this.options.getToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await (this.options.fetch ?? fetch)(
      this.options.baseUrl + path,
      { ...init, headers },
    );
    if (!response.ok)
      throw new ApiError(
        response.status,
        "DOWNLOAD_FAILED",
        response.statusText,
      );
    return response.blob();
  }
  get<T>(path: string, signal?: AbortSignal) {
    return this.request<T>(path, { signal });
  }
  post<T>(path: string, data: unknown) {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
  patch<T>(path: string, data: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }
  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }
  login(email: string, password: string) {
    return this.post<AuthResult>("/auth/login", { email, password });
  }
  resource<T extends Entity>(name: string) {
    return new ResourceClient<T>(this, name);
  }
}
export class ResourceClient<T extends Entity> {
  private readonly path: string;
  constructor(
    private client: ApiClient,
    name: string,
  ) {
    this.path = `/resources/${encodeURIComponent(name)}`;
  }
  list(params: PageQuery = {}, signal?: AbortSignal): Promise<PageResult<T>> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      if (value !== undefined && value !== "")
        query.set(
          key,
          key === "filters" ? JSON.stringify(value) : String(value),
        );
    return this.client.get(`${this.path}?${query}`, signal);
  }
  get(id: string) {
    return this.client.get<T>(`${this.path}/${encodeURIComponent(id)}`);
  }
  create(data: Partial<T>) {
    return this.client.post<T>(this.path, data);
  }
  update(id: string, data: Partial<T>) {
    return this.client.patch<T>(`${this.path}/${encodeURIComponent(id)}`, data);
  }
  remove(id: string) {
    return this.client.delete<{ deleted: boolean }>(
      `${this.path}/${encodeURIComponent(id)}`,
    );
  }
  removeMany(ids: string[]) {
    return this.client.post<{ deleted: number }>(`${this.path}/bulk-delete`, {
      ids,
    });
  }
  import(items: Partial<T>[]) {
    return this.client.post<{ created: number }>(`${this.path}/import`, {
      items,
    });
  }
}
