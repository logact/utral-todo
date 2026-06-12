import { out } from "./output.js";

export interface ClientOptions {
  baseUrl: string;
  token?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

let globalOptions: ClientOptions = { baseUrl: "http://localhost:3001" };

export function setClientOptions(opts: ClientOptions) {
  globalOptions = opts;
}

export function getClientOptions(): ClientOptions {
  return globalOptions;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (globalOptions.token) {
    h["Authorization"] = `Bearer ${globalOptions.token}`;
  }
  return h;
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const url = `${globalOptions.baseUrl}${path}`;
  const options: RequestInit = {
    method,
    headers: headers(),
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    return {
      success: res.ok,
      status: res.status,
      data: data as T,
      error: res.ok ? null : data?.error ?? `HTTP ${res.status}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, status: 0, data: null, error: msg };
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export function handleResponse<T>(res: ApiResponse<T>, exitOnError = true): T | null {
  if (!res.success) {
    out({ success: false, error: res.error, status: res.status });
    if (exitOnError) process.exit(1);
    return null;
  }
  return res.data;
}
