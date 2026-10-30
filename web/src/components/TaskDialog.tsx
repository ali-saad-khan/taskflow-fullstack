import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { PRIORITIES, STATUSES, STATUS_LABELS, type Task, type TaskInput, type TaskPriority, type TaskStatus } from "../types";
import { btnPrimary, btnSecondary, inputCls } from "./States";

export interface TaskDialogProps {
  task?: Task;
  defaultStatus?: TaskStatus;
  onClose(): void;
  onSubmit(input: TaskInput): void;
  onDelete?(): void;
}

/** Modal built on the native <dialog>: focus trap, Esc and inert background come from the platform. */
export function TaskDialog({ task, defaultStatus = "todo", onClose, onSubmit, onDelete }: TaskDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [due, setDue] = useState(task?.due_date ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      opener?.focus?.(); // hand focus back to whatever opened the dialog
    };
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return setError("Title is required.");
    if (trimmed.length > 200) return setError("Title must be 200 characters or fewer.");
    onSubmit({
      title: trimmed,
      description: description.trim() || null,
      status,
      priority,
      due_date: due || null,
    });
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <form onSubmit={submit} noValidate className="space-y-4 p-5">
        <h2 id={titleId} className="text-lg font-semibold">{task ? "Edit task" : "New task"}</h2>
        <div>
          <label htmlFor="task-title" className="mb-1 block text-sm font-medium">Title</label>
          <input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "task-title-err" : undefined}
            className={inputCls}
            autoFocus
          />
          {error && <p id="task-title-err" role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>}
        </div>
        <div>
          <label htmlFor="task-desc" className="mb-1 block text-sm font-medium">Description</label>
          <textarea id="task-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="task-status" className="mb-1 block text-sm font-medium">Status</label>
            <select id="task-status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={inputCls}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="task-priority" className="mb-1 block text-sm font-medium">Priority</label>
            <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={inputCls}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="task-due" className="mb-1 block text-sm font-medium">Due date</label>
            <input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div>
            {task && onDelete && (
              <button
                type="button"
                className="rounded-md px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
                onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              >
                {confirmDelete ? "Confirm delete" : "Delete"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={btnPrimary}>{task ? "Save changes" : "Create task"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
