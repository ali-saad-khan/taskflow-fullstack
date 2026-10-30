import { STATUSES, type Task, type TaskStatus } from "../types";

/** Tasks of one column, ordered by position (ties broken by id). */
export function columnOf(tasks: Task[], status: TaskStatus): Task[] {
  return tasks
    .filter((t) => t.status === status)
    .sort((a, b) => a.position - b.position || a.id - b.id);
}

export function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  return {
    todo: columnOf(tasks, "todo"),
    doing: columnOf(tasks, "doing"),
    done: columnOf(tasks, "done"),
  };
}

/** Re-assign contiguous 0..n-1 positions inside every column. */
export function normalize(tasks: Task[]): Task[] {
  const byId = new Map<number, number>();
  for (const status of STATUSES) {
    columnOf(tasks, status).forEach((t, i) => byId.set(t.id, i));
  }
  return tasks.map((t) => (byId.get(t.id) === t.position ? t : { ...t, position: byId.get(t.id) ?? t.position }));
}

/**
 * Move a task to `status` at `position`. Same semantics as the Laravel
 * TaskOrdering service: `position` is the index among the *other* tasks of
 * the target column and is clamped to its size; both columns are renumbered.
 * Pure: returns a new array, unknown ids return the input unchanged.
 */
export function applyMove(tasks: Task[], id: number, status: TaskStatus, position: number): Task[] {
  const moving = tasks.find((t) => t.id === id);
  if (!moving) return tasks;

  const target = columnOf(tasks, status).filter((t) => t.id !== id);
  const index = Math.max(0, Math.min(position, target.length));
  target.splice(index, 0, { ...moving, status });

  const oldColumn = moving.status === status ? [] : columnOf(tasks, moving.status).filter((t) => t.id !== id);

  const updates = new Map<number, Task>();
  target.forEach((t, i) => updates.set(t.id, { ...t, position: i }));
  oldColumn.forEach((t, i) => updates.set(t.id, { ...t, position: i }));

  return tasks.map((t) => updates.get(t.id) ?? t);
}

export type DueState = "none" | "overdue" | "today" | "soon" | "later";

/** Local YYYY-MM-DD for a Date. */
export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Classify a due date relative to `now`. Finished tasks never alarm. */
export function dueState(due: string | null, status: TaskStatus, now: Date = new Date()): DueState {
  if (!due || status === "done") return "none";
  const diff = dayNumber(due) - dayNumber(toISODate(now));
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 2) return "soon";
  return "later";
}

export function formatDue(due: string): string {
  const [y, m, d] = due.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
