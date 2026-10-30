import { Fragment, useState, type DragEvent } from "react";
import { STATUS_LABELS, type Task, type TaskStatus } from "../types";
import { TaskCard, type MoveAction } from "./TaskCard";

interface Props {
  status: TaskStatus;
  tasks: Task[];
  dragId: number | null;
  onAdd(status: TaskStatus): void;
  onEdit(task: Task): void;
  onKeyboardMove(task: Task, action: MoveAction): void;
  onDragStart(task: Task, e: DragEvent): void;
  onDragEnd(): void;
  /** `index` is the position among the column's other tasks, as the API expects. */
  onDropTask(id: number, status: TaskStatus, index: number): void;
}

export function Column({ status, tasks, dragId, onAdd, onEdit, onKeyboardMove, onDragStart, onDragEnd, onDropTask }: Props) {
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const headingId = `col-${status}`;

  function indexFromPointer(e: DragEvent<HTMLElement>): number {
    const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-task-id]")).filter(
      (el) => Number(el.dataset.taskId) !== dragId,
    );
    const at = cards.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    return at === -1 ? cards.length : at;
  }

  let visible = 0;

  return (
    <section
      aria-labelledby={headingId}
      data-status={status}
      onDragOver={(e) => {
        if (dragId === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropIndex(indexFromPointer(e));
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropIndex(null);
      }}
      onDrop={(e) => {
        if (dragId === null) return;
        e.preventDefault();
        onDropTask(dragId, status, indexFromPointer(e));
        setDropIndex(null);
      }}
      className={`flex min-h-48 flex-col rounded-xl border bg-slate-100 p-3 dark:bg-slate-900/60 ${
        dropIndex !== null ? "border-indigo-500 ring-2 ring-indigo-400" : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 id={headingId} className="text-sm font-semibold">
          {STATUS_LABELS[status]} <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">({tasks.length})</span>
        </h2>
        <button
          type="button"
          onClick={() => onAdd(status)}
          className="rounded px-2 py-0.5 text-sm hover:bg-slate-200 dark:hover:bg-slate-800"
          aria-label={`Add task to ${STATUS_LABELS[status]}`}
        >
          + Add
        </button>
      </header>
      {tasks.length === 0 && dropIndex === null && (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No tasks here yet</p>
      )}
      <ul className="flex flex-1 flex-col gap-2">
        {tasks.map((t, i) => {
          const isDragged = t.id === dragId;
          const showLine = !isDragged && dropIndex === visible;
          if (!isDragged) visible++;
          return (
            <Fragment key={t.id}>
              {showLine && <li aria-hidden className="h-1 rounded bg-indigo-500" />}
              <TaskCard
                task={t}
                index={i}
                columnSize={tasks.length}
                dragging={isDragged}
                onEdit={onEdit}
                onKeyboardMove={onKeyboardMove}
                onDragStart={onDragStart}
                onDragEnd={() => {
                  setDropIndex(null);
                  onDragEnd();
                }}
              />
            </Fragment>
          );
        })}
        {dropIndex !== null && dropIndex === visible && <li aria-hidden className="h-1 rounded bg-indigo-500" />}
      </ul>
    </section>
  );
}
