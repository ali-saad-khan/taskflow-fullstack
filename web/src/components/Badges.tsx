import { dueState, formatDue } from "../board/logic";
import type { TaskPriority, TaskStatus } from "../types";

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 ring-red-300 dark:ring-red-800",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 ring-amber-300 dark:ring-amber-800",
  low: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200 ring-sky-300 dark:ring-sky-800",
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span
      data-testid="priority-badge"
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PRIORITY_STYLE[priority]}`}
    >
      {priority}
    </span>
  );
}

const DUE_STYLE = {
  overdue: "bg-red-600 text-white dark:bg-red-500 dark:text-red-950",
  today: "bg-amber-500 text-amber-950",
  soon: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  later: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
} as const;

const DUE_LABEL = { overdue: "Overdue", today: "Due today", soon: "Due soon", later: "Due" } as const;

export function DueBadge({ due, status, now }: { due: string | null; status: TaskStatus; now?: Date }) {
  const state = dueState(due, status, now);
  if (!due) return null;
  if (state === "none") {
    return <span className="text-xs text-slate-500 dark:text-slate-400">{formatDue(due)}</span>;
  }
  return (
    <span
      data-testid="due-badge"
      data-state={state}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${DUE_STYLE[state]}`}
    >
      {DUE_LABEL[state]} · {formatDue(due)}
    </span>
  );
}
