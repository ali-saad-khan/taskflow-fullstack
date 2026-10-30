export const STATUSES = ["todo", "doing", "done"] as const;
export type TaskStatus = (typeof STATUSES)[number];

export const PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof PRIORITIES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "In progress",
  done: "Done",
};

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  tasks_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** YYYY-MM-DD or null */
  due_date: string | null;
  /** 0-based, contiguous inside each (project, status) column */
  position: number;
  created_at: string;
  updated_at: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
}
export interface LoginInput {
  email: string;
  password: string;
}
export interface ProjectInput {
  name: string;
  description?: string | null;
}
export interface TaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
}
export interface MoveInput {
  status: TaskStatus;
  position: number;
}
