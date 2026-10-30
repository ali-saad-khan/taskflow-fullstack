import type { Task } from "../types";

let id = 0;
export function makeTask(over: Partial<Task> = {}): Task {
  id += 1;
  return {
    id,
    project_id: 1,
    title: `Task ${id}`,
    description: null,
    status: "todo",
    priority: "medium",
    due_date: null,
    position: 0,
    created_at: "2030-01-01T00:00:00Z",
    updated_at: "2030-01-01T00:00:00Z",
    ...over,
  };
}
