import { describe, expect, it, vi } from "vitest";
import { createMockAdapter } from "./mock";
import { createHttpAdapter } from "./http";
import { runApiContract } from "./contract";
import { ApiError } from "./types";

// The same contract the Laravel API satisfies, run against the in-memory adapter.
let n = 0;
runApiContract("mockAdapter", () => {
  // isolated storage per test
  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  return createMockAdapter({ storage, storageKey: `t${n++}`, latency: 0 });
});

describe("mockAdapter specifics", () => {
  it("persists state across adapter instances (localStorage)", async () => {
    const a = createMockAdapter({ latency: 0 });
    await a.auth.login({ email: "demo@taskflow.test", password: "password" });
    const p = await a.projects.create({ name: "Persisted" });

    const b = createMockAdapter({ latency: 0 });
    expect(b.auth.hasSession()).toBe(true);
    expect((await b.projects.get(p.id)).name).toBe("Persisted");
  });

  it("seeds demo data including an overdue task and an empty project", async () => {
    const a = createMockAdapter({ latency: 0 });
    await a.auth.login({ email: "demo@taskflow.test", password: "password" });
    const projects = await a.projects.list();
    expect(projects.some((p) => p.tasks_count === 0)).toBe(true);
    const tasks = await a.tasks.list(1);
    expect(tasks.length).toBeGreaterThan(5);
  });

  it("can simulate failing mutations without affecting reads", async () => {
    const a = createMockAdapter({ latency: 0 });
    await a.auth.login({ email: "demo@taskflow.test", password: "password" });
    a.simulate?.setFailing(true);
    await expect(a.tasks.create(1, { title: "x" })).rejects.toMatchObject({ code: "network_error" });
    await expect(a.tasks.list(1)).resolves.toBeDefined();
  });
});

describe("httpAdapter (stubbed fetch)", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("stores the token on login and sends it as a Bearer header, unwrapping { data }", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, { user: { id: 1, name: "A", email: "a@a.io" }, token: "tok" }))
      .mockResolvedValueOnce(json(200, { data: [{ id: 5, name: "P" }] }));
    const http = createHttpAdapter({ baseUrl: "http://x/api/v1/", fetchImpl: fetchImpl as unknown as typeof fetch, storage: store() });

    await http.auth.login({ email: "a@a.io", password: "pw" });
    expect(http.auth.hasSession()).toBe(true);
    const projects = await http.projects.list();

    expect(projects).toEqual([{ id: 5, name: "P" }]);
    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("http://x/api/v1/projects");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("maps the Laravel error envelope to ApiError and network failures to status 0", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(422, { message: "bad", code: "validation_failed", errors: { title: ["required"] } }))
      .mockRejectedValueOnce(new TypeError("offline"));
    const http = createHttpAdapter({ baseUrl: "http://x", fetchImpl: fetchImpl as unknown as typeof fetch, storage: store() });

    await expect(http.tasks.create(1, { title: "" })).rejects.toMatchObject({ status: 422, fieldErrors: { title: ["required"] } });
    const err = await http.projects.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
  });

  it("clears the token on logout even if the request fails", async () => {
    const s = store();
    s.setItem("taskflow.token", "tok");
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(401, { message: "Unauthenticated.", code: "unauthenticated" }));
    const http = createHttpAdapter({ baseUrl: "http://x", fetchImpl: fetchImpl as unknown as typeof fetch, storage: s });
    await expect(http.auth.logout()).rejects.toBeInstanceOf(ApiError);
    expect(http.auth.hasSession()).toBe(false);
  });
});
