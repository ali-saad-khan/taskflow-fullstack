import { describe, expect, it, beforeEach } from "vitest";
import { ApiError, type Api } from "./types";
import type { Task } from "../types";

/**
 * Adapter contract: every Api implementation must pass these.
 * `factory` must return a FRESH, seed-free-or-seeded adapter whose state is isolated per call
 * and where the demo user (demo@taskflow.test / password) exists.
 */
export function runApiContract(name: string, factory: () => Api) {
  describe(`Api contract: ${name}`, () => {
    let api: Api;
    beforeEach(() => {
      api = factory();
    });

    const login = () => api.auth.login({ email: "demo@taskflow.test", password: "password" });
    const rejects = async (p: Promise<unknown>) => {
      try {
        await p;
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        return e as ApiError;
      }
      throw new Error("expected promise to reject");
    };
    const titles = (tasks: Task[], status: string) => tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position).map((t) => t.title);

    it("rejects unauthenticated calls with 401", async () => {
      expect((await rejects(api.projects.list())).status).toBe(401);
      expect((await rejects(api.auth.me())).code).toBe("unauthenticated");
    });

    it("logs in with valid credentials and rejects bad ones", async () => {
      const { user } = await login();
      expect(user.email).toBe("demo@taskflow.test");
      expect(api.auth.hasSession()).toBe(true);
      expect((await api.auth.me()).id).toBe(user.id);

      const err = await rejects(api.auth.login({ email: "demo@taskflow.test", password: "wrong" }));
      expect(err.status).toBe(401);
      expect(err.code).toBe("invalid_credentials");
    });

    it("registers a user, validating input like the server", async () => {
      const bad = await rejects(api.auth.register({ name: "", email: "nope", password: "short", password_confirmation: "x" }));
      expect(bad.status).toBe(422);
      expect(Object.keys(bad.fieldErrors).sort()).toEqual(["email", "name", "password"]);

      const dup = await rejects(
        api.auth.register({ name: "X", email: "demo@taskflow.test", password: "password123", password_confirmation: "password123" }),
      );
      expect(dup.fieldErrors.email).toBeDefined();

      const ok = await api.auth.register({ name: "Ada", email: "ada@example.com", password: "password123", password_confirmation: "password123" });
      expect(ok.user.name).toBe("Ada");
      expect(await api.projects.list()).toEqual([]);
    });

    it("logout ends the session", async () => {
      await login();
      await api.auth.logout();
      expect(api.auth.hasSession()).toBe(false);
      expect((await rejects(api.projects.list())).status).toBe(401);
    });

    it("creates, updates and deletes projects with validation", async () => {
      await login();
      const before = (await api.projects.list()).length;
      expect((await rejects(api.projects.create({ name: "" }))).fieldErrors.name).toBeDefined();

      const p = await api.projects.create({ name: "Contract", description: "d" });
      expect(p.name).toBe("Contract");
      expect((await api.projects.list()).length).toBe(before + 1);

      expect((await api.projects.update(p.id, { name: "Renamed" })).name).toBe("Renamed");
      expect((await rejects(api.projects.update(p.id, { name: "" }))).status).toBe(422);

      await api.projects.remove(p.id);
      expect((await rejects(api.projects.get(p.id))).status).toBe(404);
    });

    it("creates tasks with defaults, appended to the end of their column", async () => {
      await login();
      const p = await api.projects.create({ name: "Tasks" });
      const a = await api.tasks.create(p.id, { title: "A" });
      const b = await api.tasks.create(p.id, { title: "B" });
      const c = await api.tasks.create(p.id, { title: "C", status: "doing", priority: "high", due_date: "2030-01-31" });
      expect(a).toMatchObject({ status: "todo", priority: "medium", position: 0, due_date: null, description: null });
      expect(b.position).toBe(1);
      expect(c).toMatchObject({ status: "doing", position: 0, priority: "high", due_date: "2030-01-31" });
    });

    it("validates task input (422 with per-field errors)", async () => {
      await login();
      const p = await api.projects.create({ name: "V" });
      const err = await rejects(
        api.tasks.create(p.id, { title: "", status: "blocked" as never, priority: "urgent" as never, due_date: "31/12/2030" }),
      );
      expect(err.status).toBe(422);
      expect(Object.keys(err.fieldErrors).sort()).toEqual(["due_date", "priority", "status", "title"]);
    });

    it("updates a task and clears its due date", async () => {
      await login();
      const p = await api.projects.create({ name: "U" });
      const t = await api.tasks.create(p.id, { title: "Old", due_date: "2030-01-01" });
      const u = await api.tasks.update(t.id, { title: "New", priority: "low", due_date: null });
      expect(u).toMatchObject({ title: "New", priority: "low", due_date: null });
      expect((await rejects(api.tasks.update(t.id, { title: "" }))).status).toBe(422);
    });

    it("moves within a column and across columns, keeping positions contiguous", async () => {
      await login();
      const p = await api.projects.create({ name: "M" });
      const a = await api.tasks.create(p.id, { title: "a" });
      await api.tasks.create(p.id, { title: "b" });
      await api.tasks.create(p.id, { title: "c" });
      const d = await api.tasks.create(p.id, { title: "d", status: "doing" });

      await api.tasks.move(a.id, { status: "todo", position: 2 });
      let all = await api.tasks.list(p.id);
      expect(titles(all, "todo")).toEqual(["b", "c", "a"]);

      const moved = await api.tasks.move(d.id, { status: "todo", position: 1 });
      expect(moved).toMatchObject({ status: "todo", position: 1 });
      all = await api.tasks.list(p.id);
      expect(titles(all, "todo")).toEqual(["b", "d", "c", "a"]);
      expect(all.filter((t) => t.status === "todo").map((t) => t.position)).toEqual([0, 1, 2, 3]);
      expect(titles(all, "doing")).toEqual([]);
    });

    it("clamps out-of-range positions and validates the move payload", async () => {
      await login();
      const p = await api.projects.create({ name: "C" });
      const a = await api.tasks.create(p.id, { title: "a" });
      await api.tasks.create(p.id, { title: "x", status: "done" });
      expect((await api.tasks.move(a.id, { status: "done", position: 99 })).position).toBe(1);
      const err = await rejects(api.tasks.move(a.id, { status: "nope" as never, position: -1 }));
      expect(err.status).toBe(422);
      expect(Object.keys(err.fieldErrors).sort()).toEqual(["position", "status"]);
    });

    it("deleting a task closes the gap", async () => {
      await login();
      const p = await api.projects.create({ name: "D" });
      const a = await api.tasks.create(p.id, { title: "a" });
      await api.tasks.create(p.id, { title: "b" });
      await api.tasks.remove(a.id);
      const all = await api.tasks.list(p.id);
      expect(all.map((t) => [t.title, t.position])).toEqual([["b", 0]]);
    });

    it("returns 404 for missing resources and 403 for other users' data", async () => {
      await login();
      const mine = await api.projects.create({ name: "Mine" });
      const task = await api.tasks.create(mine.id, { title: "secret" });
      expect((await rejects(api.tasks.update(9999, { title: "x" }))).status).toBe(404);

      await api.auth.logout();
      await api.auth.register({ name: "Eve", email: "eve@example.com", password: "password123", password_confirmation: "password123" });
      expect((await rejects(api.projects.get(mine.id))).status).toBe(403);
      expect((await rejects(api.tasks.list(mine.id))).status).toBe(403);
      expect((await rejects(api.tasks.create(mine.id, { title: "x" }))).status).toBe(403);
      expect((await rejects(api.tasks.move(task.id, { status: "done", position: 0 }))).status).toBe(403);
      expect((await rejects(api.tasks.remove(task.id))).code).toBe("forbidden");
      expect(await api.projects.list()).toEqual([]);
    });
  });
}
