import { ApiError, type Api } from "./types";
import { DEMO_CREDENTIALS } from "./demo";
import { applyMove, columnOf, toISODate } from "../board/logic";
import {
  PRIORITIES,
  STATUSES,
  type LoginInput,
  type MoveInput,
  type Project,
  type ProjectInput,
  type RegisterInput,
  type Task,
  type TaskInput,
  type User,
} from "../types";

/**
 * In-memory implementation of the API contract, persisted to localStorage.
 * It mirrors the Laravel API: same shapes, same status codes (401/403/404/422),
 * same validation rules and the same reorder semantics (see board/logic.applyMove).
 * Passwords are stored in plain text: this is a demo backend that never leaves the browser.
 */


interface StoredUser extends User {
  password: string;
}
interface MockState {
  users: StoredUser[];
  projects: (Project & { user_id: number })[];
  tasks: Task[];
  seq: { user: number; project: number; task: number };
  /** id of the signed-in user, i.e. the mock equivalent of a bearer token */
  session: number | null;
}

export interface MockAdapterOptions {
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  storageKey?: string;
  /** Simulated latency in ms: a number, or [min, max]. Default [120, 320]. */
  latency?: number | [number, number];
  now?: () => Date;
}

type FieldErrors = Record<string, string[]>;

function fail(errors: FieldErrors): never {
  throw new ApiError(422, "validation_failed", "The given data was invalid.", errors);
}
const addErr = (e: FieldErrors, field: string, msg: string) => {
  (e[field] ??= []).push(msg);
};
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

function seed(now: Date): MockState {
  const day = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return toISODate(d);
  };
  const ts = now.toISOString();
  const state: MockState = {
    users: [{ id: 1, name: "Demo User", email: DEMO_CREDENTIALS.email, password: DEMO_CREDENTIALS.password }],
    projects: [
      { id: 1, user_id: 1, name: "Website relaunch", description: "Marketing site refresh for Q4.", created_at: ts, updated_at: ts },
      { id: 2, user_id: 1, name: "Mobile app MVP", description: "First public release of the companion app.", created_at: ts, updated_at: ts },
      { id: 3, user_id: 1, name: "Empty project", description: "Nothing here yet, great for the empty state.", created_at: ts, updated_at: ts },
    ],
    tasks: [],
    seq: { user: 1, project: 3, task: 0 },
    session: null,
  };
  const t = (
    project_id: number,
    title: string,
    status: Task["status"],
    priority: Task["priority"],
    due: number | null,
    description: string | null = null,
  ) => {
    const position = state.tasks.filter((x) => x.project_id === project_id && x.status === status).length;
    state.tasks.push({
      id: ++state.seq.task,
      project_id,
      title,
      description,
      status,
      priority,
      due_date: due === null ? null : day(due),
      position,
      created_at: ts,
      updated_at: ts,
    });
  };
  t(1, "Audit existing pages", "done", "medium", -5, "Inventory every page and its traffic.");
  t(1, "Pick a new colour palette", "done", "low", -3);
  t(1, "Design the new homepage", "doing", "high", 1, "Hero, social proof, pricing teaser.");
  t(1, "Write launch announcement", "doing", "medium", 4);
  t(1, "Fix broken redirects", "todo", "high", -1, "Overdue on purpose, to show highlighting.");
  t(1, "Set up analytics", "todo", "medium", 0);
  t(1, "Accessibility pass", "todo", "medium", 9, "Keyboard navigation and contrast.");
  t(1, "Update footer links", "todo", "low", null);
  t(2, "Define MVP scope", "done", "high", -7);
  t(2, "Build onboarding flow", "doing", "high", 3);
  t(2, "Push notification spike", "todo", "low", 14);
  t(2, "Beta tester recruitment", "todo", "medium", 6);
  return state;
}

export function createMockAdapter(opts: MockAdapterOptions = {}): Api {
  const storage = opts.storage ?? localStorage;
  const key = opts.storageKey ?? "taskflow.mock.v1";
  const now = opts.now ?? (() => new Date());
  const latency = opts.latency ?? [120, 320];
  let failing = false;

  function load(): MockState {
    try {
      const raw = storage.getItem(key);
      if (raw) return JSON.parse(raw) as MockState;
    } catch {
      /* corrupted or unavailable storage: fall through to a fresh seed */
    }
    const fresh = seed(now());
    save(fresh);
    return fresh;
  }
  function save(s: MockState) {
    try {
      storage.setItem(key, JSON.stringify(s));
    } catch {
      /* quota or private mode: keep working in-memory only for this call */
    }
  }

  const sleep = () => {
    const ms = Array.isArray(latency) ? latency[0] + Math.random() * (latency[1] - latency[0]) : latency;
    return ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();
  };

  /** Run one request: simulate latency, load state, persist if the handler mutated it. */
  async function call<T>(opts2: { mutation?: boolean; auth?: boolean }, fn: (s: MockState, me: StoredUser) => T): Promise<T> {
    await sleep();
    if (opts2.mutation && failing) throw new ApiError(0, "network_error", "Simulated network failure.");
    const s = load();
    let me = null as StoredUser | null;
    if (opts2.auth !== false) {
      me = s.users.find((u) => u.id === s.session) ?? null;
      if (!me) throw new ApiError(401, "unauthenticated", "Unauthenticated.");
    }
    const out = fn(s, me as StoredUser);
    save(s);
    return structuredClone(out);
  }

  const publicUser = (u: StoredUser): User => ({ id: u.id, name: u.name, email: u.email });
  const publicProject = (s: MockState, p: Project & { user_id: number }): Project => {
    const { user_id: _omit, ...rest } = p;
    return { ...rest, tasks_count: s.tasks.filter((t) => t.project_id === p.id).length };
  };

  function findProject(s: MockState, me: StoredUser, id: number) {
    const p = s.projects.find((x) => x.id === id);
    if (!p) throw new ApiError(404, "not_found", "Resource not found.");
    return { p, check: () => { if (p.user_id !== me.id) throw new ApiError(403, "forbidden", "This action is unauthorized."); } };
  }
  function findTask(s: MockState, me: StoredUser, id: number) {
    const task = s.tasks.find((x) => x.id === id);
    if (!task) throw new ApiError(404, "not_found", "Resource not found.");
    return {
      task,
      check: () => {
        const owner = s.projects.find((x) => x.id === task.project_id)?.user_id;
        if (owner !== me.id) throw new ApiError(403, "forbidden", "This action is unauthorized.");
      },
    };
  }

  function validateProject(input: Partial<ProjectInput>, partial: boolean) {
    const e: FieldErrors = {};
    if (!partial || "name" in input) {
      if (typeof input.name !== "string" || input.name.trim() === "") addErr(e, "name", "The name field is required.");
      else if (input.name.length > 120) addErr(e, "name", "The name field must not be greater than 120 characters.");
    }
    if (input.description != null && (typeof input.description !== "string" || input.description.length > 1000))
      addErr(e, "description", "The description field must not be greater than 1000 characters.");
    if (Object.keys(e).length) fail(e);
  }

  function validateTask(input: Partial<TaskInput>, partial: boolean) {
    const e: FieldErrors = {};
    if (!partial || "title" in input) {
      if (typeof input.title !== "string" || input.title.trim() === "") addErr(e, "title", "The title field is required.");
      else if (input.title.length > 200) addErr(e, "title", "The title field must not be greater than 200 characters.");
    }
    if (input.description != null && (typeof input.description !== "string" || input.description.length > 5000))
      addErr(e, "description", "The description field must not be greater than 5000 characters.");
    if (input.status !== undefined && !(STATUSES as readonly string[]).includes(input.status))
      addErr(e, "status", "The selected status is invalid.");
    if (input.priority !== undefined && !(PRIORITIES as readonly string[]).includes(input.priority))
      addErr(e, "priority", "The selected priority is invalid.");
    if (input.due_date != null && (typeof input.due_date !== "string" || !isDate(input.due_date)))
      addErr(e, "due_date", "The due date field must match the format Y-m-d.");
    if (Object.keys(e).length) fail(e);
  }

  function validateMove(input: Partial<MoveInput>) {
    const e: FieldErrors = {};
    if (!(STATUSES as readonly string[]).includes(input.status as string)) addErr(e, "status", "The selected status is invalid.");
    if (!Number.isInteger(input.position)) addErr(e, "position", "The position field must be an integer.");
    else if ((input.position as number) < 0) addErr(e, "position", "The position field must be at least 0.");
    if (Object.keys(e).length) fail(e);
  }

  function compact(s: MockState, projectId: number) {
    const tasks = s.tasks.filter((t) => t.project_id === projectId);
    for (const status of STATUSES) columnOf(tasks, status).forEach((t, i) => (t.position = i));
  }

  const stamp = () => now().toISOString();

  return {
    mode: "mock",
    simulate: {
      setFailing: (v) => { failing = v; },
      isFailing: () => failing,
      reset: () => {
        storage.removeItem(key);
      },
    },
    auth: {
      register: (input: RegisterInput) =>
        call({ auth: false, mutation: false }, (s) => {
          const e: FieldErrors = {};
          if (!input.name?.trim()) addErr(e, "name", "The name field is required.");
          else if (input.name.length > 100) addErr(e, "name", "The name field must not be greater than 100 characters.");
          if (!input.email?.trim()) addErr(e, "email", "The email field is required.");
          else if (!/^\S+@\S+\.\S+$/.test(input.email)) addErr(e, "email", "The email field must be a valid email address.");
          else if (s.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) addErr(e, "email", "The email has already been taken.");
          if (!input.password) addErr(e, "password", "The password field is required.");
          else {
            if (input.password.length < 8) addErr(e, "password", "The password field must be at least 8 characters.");
            if (input.password !== input.password_confirmation) addErr(e, "password", "The password field confirmation does not match.");
          }
          if (Object.keys(e).length) fail(e);
          const user: StoredUser = { id: ++s.seq.user, name: input.name, email: input.email, password: input.password };
          s.users.push(user);
          s.session = user.id;
          return { user: publicUser(user) };
        }),
      login: (input: LoginInput) =>
        call({ auth: false }, (s) => {
          const e: FieldErrors = {};
          if (!input.email?.trim()) addErr(e, "email", "The email field is required.");
          if (!input.password) addErr(e, "password", "The password field is required.");
          if (Object.keys(e).length) fail(e);
          const user = s.users.find((u) => u.email.toLowerCase() === input.email.toLowerCase());
          if (!user || user.password !== input.password)
            throw new ApiError(401, "invalid_credentials", "Invalid credentials.");
          s.session = user.id;
          return { user: publicUser(user) };
        }),
      logout: () =>
        call({}, (s) => {
          s.session = null;
        }),
      me: () => call({}, (_s, me) => publicUser(me)),
      hasSession: () => {
        const s = load();
        return s.session !== null;
      },
    },
    projects: {
      list: () =>
        call({}, (s, me) =>
          s.projects.filter((p) => p.user_id === me.id).sort((a, b) => b.id - a.id).map((p) => publicProject(s, p)),
        ),
      get: (id) =>
        call({}, (s, me) => {
          const { p, check } = findProject(s, me, id);
          check();
          return publicProject(s, p);
        }),
      create: (input) =>
        call({ mutation: true }, (s, me) => {
          validateProject(input, false);
          const ts = stamp();
          const p = { id: ++s.seq.project, user_id: me.id, name: input.name, description: input.description ?? null, created_at: ts, updated_at: ts };
          s.projects.push(p);
          return publicProject(s, p);
        }),
      update: (id, input) =>
        call({ mutation: true }, (s, me) => {
          const { p, check } = findProject(s, me, id);
          validateProject(input, true);
          check();
          if (input.name !== undefined) p.name = input.name;
          if (input.description !== undefined) p.description = input.description;
          p.updated_at = stamp();
          return publicProject(s, p);
        }),
      remove: (id) =>
        call({ mutation: true }, (s, me) => {
          const { p, check } = findProject(s, me, id);
          check();
          s.projects = s.projects.filter((x) => x.id !== p.id);
          s.tasks = s.tasks.filter((t) => t.project_id !== p.id);
        }),
    },
    tasks: {
      list: (projectId) =>
        call({}, (s, me) => {
          const { check } = findProject(s, me, projectId);
          check();
          const tasks = s.tasks.filter((t) => t.project_id === projectId);
          return STATUSES.flatMap((st) => columnOf(tasks, st));
        }),
      create: (projectId, input) =>
        call({ mutation: true }, (s, me) => {
          const { check } = findProject(s, me, projectId);
          validateTask(input, false);
          check();
          const status = input.status ?? "todo";
          const ts = stamp();
          const task: Task = {
            id: ++s.seq.task,
            project_id: projectId,
            title: input.title,
            description: input.description ?? null,
            status,
            priority: input.priority ?? "medium",
            due_date: input.due_date ?? null,
            position: s.tasks.filter((t) => t.project_id === projectId && t.status === status).length,
            created_at: ts,
            updated_at: ts,
          };
          s.tasks.push(task);
          return task;
        }),
      update: (id, input) =>
        call({ mutation: true }, (s, me) => {
          const { task, check } = findTask(s, me, id);
          validateTask(input, true);
          check();
          const { status, ...rest } = input;
          Object.assign(task, rest, { updated_at: stamp() });
          if (status && status !== task.status) {
            const end = s.tasks.filter((t) => t.project_id === task.project_id && t.status === status).length;
            replaceProjectTasks(s, task.project_id, applyMove(s.tasks.filter((t) => t.project_id === task.project_id), id, status, end));
          }
          return s.tasks.find((t) => t.id === id) as Task;
        }),
      remove: (id) =>
        call({ mutation: true }, (s, me) => {
          const { task, check } = findTask(s, me, id);
          check();
          s.tasks = s.tasks.filter((t) => t.id !== task.id);
          compact(s, task.project_id);
        }),
      move: (id, input) =>
        call({ mutation: true }, (s, me) => {
          const { task, check } = findTask(s, me, id);
          validateMove(input);
          check();
          replaceProjectTasks(
            s,
            task.project_id,
            applyMove(s.tasks.filter((t) => t.project_id === task.project_id), id, input.status, input.position),
          );
          return s.tasks.find((t) => t.id === id) as Task;
        }),
    },
  };
}

function replaceProjectTasks(s: MockState, projectId: number, next: Task[]) {
  const byId = new Map(next.map((t) => [t.id, t]));
  s.tasks = s.tasks.map((t) => (t.project_id === projectId ? (byId.get(t.id) ?? t) : t));
}
