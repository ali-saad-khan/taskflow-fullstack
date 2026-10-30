import type { Task, TaskStatus } from "../types";
import { applyMove, normalize } from "./logic";

export interface BoardState {
  phase: "loading" | "ready" | "error";
  error: string | null;
  tasks: Task[];
}

export type BoardAction =
  | { type: "load_start" }
  | { type: "loaded"; tasks: Task[] }
  | { type: "load_failed"; error: string }
  | { type: "move"; id: number; status: TaskStatus; position: number }
  | { type: "add_pending"; task: Task }
  | { type: "add_confirmed"; tempId: number; task: Task }
  | { type: "patch"; id: number; patch: Partial<Task> }
  | { type: "upsert"; task: Task }
  | { type: "remove"; id: number }
  /** Restore a snapshot taken before an optimistic update that the server rejected. */
  | { type: "rollback"; tasks: Task[] };

export const initialBoardState: BoardState = { phase: "loading", error: null, tasks: [] };

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "load_start":
      return { phase: "loading", error: null, tasks: [] };
    case "loaded":
      return { phase: "ready", error: null, tasks: action.tasks };
    case "load_failed":
      return { phase: "error", error: action.error, tasks: [] };
    case "move":
      return { ...state, tasks: applyMove(state.tasks, action.id, action.status, action.position) };
    case "add_pending":
      return { ...state, tasks: normalize([...state.tasks, action.task]) };
    case "add_confirmed":
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.tempId ? action.task : t)),
      };
    case "patch": {
      const existing = state.tasks.find((t) => t.id === action.id);
      if (!existing) return state;
      const { status, ...rest } = action.patch;
      let tasks = state.tasks.map((t) => (t.id === action.id ? { ...t, ...rest } : t));
      if (status && status !== existing.status) {
        const endOfColumn = tasks.filter((t) => t.status === status).length;
        tasks = applyMove(tasks, action.id, status, endOfColumn);
      }
      return { ...state, tasks };
    }
    case "upsert": {
      const exists = state.tasks.some((t) => t.id === action.task.id);
      return {
        ...state,
        tasks: exists
          ? state.tasks.map((t) => (t.id === action.task.id ? action.task : t))
          : [...state.tasks, action.task],
      };
    }
    case "remove":
      return { ...state, tasks: normalize(state.tasks.filter((t) => t.id !== action.id)) };
    case "rollback":
      return { ...state, tasks: action.tasks };
  }
}
