import type { DragEvent } from "react";
import { STATUSES, STATUS_LABELS, type Task } from "../types";
import { DueBadge, PriorityBadge } from "./Badges";

export type MoveAction = "left" | "right" | "up" | "down";

interface Props {
  task: Task;
  index: number;
  columnSize: number;
  dragging: boolean;
  onEdit(task: Task): void;
  onKeyboardMove(task: Task, action: MoveAction): void;
  onDragStart(task: Task, e: DragEvent): void;
  onDragEnd(): void;
}

const btn =
  "rounded border border-slate-300 px-1.5 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-30 dark:border-slate-600 dark:hover:bg-slate-800";

export function TaskCard({ task, index, columnSize, dragging, onEdit, onKeyboardMove, onDragStart, onDragEnd }: Props) {
  const col = STATUSES.indexOf(task.status);
  const prev = STATUSES[col - 1];
  const next = STATUSES[col + 1];
  const pending = task.id < 0; // optimistic placeholder awaiting the server id

  return (
    <li
      data-task-id={task.id}
      draggable={!pending}
      onDragStart={(e) => onDragStart(task, e)}
      onDragEnd={onDragEnd}
      className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
        dragging ? "opacity-40" : ""
      } ${pending ? "animate-pulse" : "cursor-grab"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium break-words">{task.title}</h3>
        <PriorityBadge priority={task.priority} />
      </div>
      {task.description && <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{task.description}</p>}
      <div className="mt-2 min-h-5">
        <DueBadge due={task.due_date} status={task.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1" role="group" aria-label={`Actions for ${task.title}`}>
        <button type="button" data-action="left" className={btn} disabled={!prev || pending} aria-label={prev ? `Move ${task.title} to ${STATUS_LABELS[prev]}` : `Move ${task.title} left`} onClick={() => onKeyboardMove(task, "left")}>←</button>
        <button type="button" data-action="up" className={btn} disabled={index === 0 || pending} aria-label={`Move ${task.title} up`} onClick={() => onKeyboardMove(task, "up")}>↑</button>
        <button type="button" data-action="down" className={btn} disabled={index === columnSize - 1 || pending} aria-label={`Move ${task.title} down`} onClick={() => onKeyboardMove(task, "down")}>↓</button>
        <button type="button" data-action="right" className={btn} disabled={!next || pending} aria-label={next ? `Move ${task.title} to ${STATUS_LABELS[next]}` : `Move ${task.title} right`} onClick={() => onKeyboardMove(task, "right")}>→</button>
        <button type="button" data-action="edit" className={`${btn} ml-auto`} disabled={pending} aria-label={`Edit ${task.title}`} onClick={() => onEdit(task)}>Edit</button>
      </div>
    </li>
  );
}
