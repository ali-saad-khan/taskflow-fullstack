import { ApiError, type Api } from "./types";
import type { Project, Task, User } from "../types";

export interface HttpAdapterOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

const TOKEN_KEY = "taskflow.token";

export function createHttpAdapter(opts: HttpAdapterOptions): Api {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const store = opts.storage ?? localStorage;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = store.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, "network_error", "Could not reach the server.");
    }

    if (res.status === 204) return undefined as T;

    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const p = (payload ?? {}) as { message?: string; code?: string; errors?: Record<string, string[]> };
      throw new ApiError(res.status, p.code ?? "error", p.message ?? `Request failed (${res.status})`, p.errors ?? {});
    }
    return payload as T;
  }

  const data = async <T>(method: string, path: string, body?: unknown) =>
    (await request<{ data: T }>(method, path, body)).data;

  async function authenticate(path: string, input: unknown) {
    const res = await request<{ user: User; token: string }>("POST", path, input);
    store.setItem(TOKEN_KEY, res.token);
    return { user: res.user };
  }

  return {
    mode: "http",
    auth: {
      register: (input) => authenticate("/auth/register", input),
      login: (input) => authenticate("/auth/login", input),
      async logout() {
        try {
          await request<void>("POST", "/auth/logout");
        } finally {
          store.removeItem(TOKEN_KEY);
        }
      },
      me: () => data<User>("GET", "/auth/me"),
      hasSession: () => store.getItem(TOKEN_KEY) !== null,
    },
    projects: {
      list: () => data<Project[]>("GET", "/projects"),
      get: (id) => data<Project>("GET", `/projects/${id}`),
      create: (input) => data<Project>("POST", "/projects", input),
      update: (id, input) => data<Project>("PATCH", `/projects/${id}`, input),
      remove: (id) => request<void>("DELETE", `/projects/${id}`),
    },
    tasks: {
      list: (projectId) => data<Task[]>("GET", `/projects/${projectId}/tasks`),
      create: (projectId, input) => data<Task>("POST", `/projects/${projectId}/tasks`, input),
      update: (id, input) => data<Task>("PATCH", `/tasks/${id}`, input),
      remove: (id) => request<void>("DELETE", `/tasks/${id}`),
      move: (id, input) => data<Task>("POST", `/tasks/${id}/move`, input),
    },
  };
}
