import { useCallback, useEffect, useReducer, useRef, useState, type DragEvent } from "react";
import { applyMove, columnOf, groupByStatus } from "../board/logic";
import { boardReducer, initialBoardState, type BoardAction } from "../board/reducer";
import { messageOf, useApi } from "../hooks";
import { STATUSES, STATUS_LABELS, type Project, type Task, type TaskInput, type TaskStatus } from "../types";
import { Column } from "../components/Column";
import { TaskDialog } from "../components/TaskDialog";
import type { MoveAction } from "../components/TaskCard";
import { ErrorState, Loading } from "../components/States";

type DialogState = { mode: "create"; status: TaskStatus } | { mode: "edit"; task: Task } | null;

export function BoardPage({ projectId }: { projectId: number }) {
  const api = useApi();
  const [state, dispatch] = useReducer(boardReducer, initialBoardState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [project, setProject] = useState<Project | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const pendingFocus = useRef<{ id: number; action: string } | null>(null);
  const tempId = useRef(-1);

  const load = useCallback(() => {
    dispatch({ type: "load_start" });
    Promise.all([api.projects.get(projectId), api.tasks.list(projectId)]).then(
      ([p, tasks]) => {
        setProject(p);
        dispatch({ type: "loaded", tasks });
      },
      (e) => dispatch({ type: "load_failed", error: messageOf(e) }),
    );
  }, [api, projectId]);

  useEffect(load, [load]);

  // Restore keyboard focus to the moved card's button after React re-parents it.
  useEffect(() => {
    const pf = pendingFocus.current;
    if (!pf) return;
    pendingFocus.current = null;
    const card = document.querySelector(`[data-task-id="${pf.id}"]`);
    const target =
      card?.querySelector<HTMLButtonElement>(`button[data-action="${pf.action}"]:not(:disabled)`) ??
      card?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    target?.focus();
  }, [state.tasks]);

  /** Apply `action` immediately; if the server call fails, restore the snapshot and tell the user. */
  async function optimistic<T>(action: BoardAction, call: () => Promise<T>, onOk?: (result: T) => void) {
    const snapshot = stateRef.current.tasks;
    setNotice(null);
    dispatch(action);
    try {
      const result = await call(); // note: `onOk?.(await call())` would skip the call when onOk is undefined
      onOk?.(result);
    } catch (e) {
      dispatch({ type: "rollback", tasks: snapshot });
      setNotice(messageOf(e));
    }
  }

  function moveTask(id: number, status: TaskStatus, position: number) {
    const before = stateRef.current.tasks;
    const task = before.find((t) => t.id === id);
    if (!task || id < 0) return;
    const after = applyMove(before, id, status, position);
    const moved = after.find((t) => t.id === id);
    if (!moved || (moved.status === task.status && moved.position === task.position)) return;

    setAnnouncement(`${task.title} moved to ${STATUS_LABELS[status]}, position ${moved.position + 1} of ${columnOf(after, status).length}.`);
    void optimistic({ type: "move", id, status, position }, () => api.tasks.move(id, { status, position }));
  }

  function keyboardMove(task: Task, action: MoveAction) {
    pendingFocus.current = { id: task.id, action };
    const col = STATUSES.indexOf(task.status);
    const here = columnOf(stateRef.current.tasks, task.status);
    const idx = here.findIndex((t) => t.id === task.id);
    if (action === "up") return moveTask(task.id, task.status, idx - 1);
    if (action === "down") return moveTask(task.id, task.status, idx + 1);
    const target = STATUSES[col + (action === "left" ? -1 : 1)];
    if (target) moveTask(task.id, target, columnOf(stateRef.current.tasks, target).length);
  }

  function submitDialog(input: TaskInput) {
    const current = dialog;
    setDialog(null);
    if (!current) return;

    if (current.mode === "create") {
      const status = input.status ?? current.status;
      const temp: Task = {
        id: tempId.current--,
        project_id: projectId,
        title: input.title,
        description: input.description ?? null,
        status,
        priority: input.priority ?? "medium",
        due_date: input.due_date ?? null,
        position: columnOf(stateRef.current.tasks, status).length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      void optimistic({ type: "add_pending", task: temp }, () => api.tasks.create(projectId, { ...input, status }), (task) =>
        dispatch({ type: "add_confirmed", tempId: temp.id, task }),
      );
    } else {
      const id = current.task.id;
      pendingFocus.current = { id, action: "edit" };
      void optimistic(
        { type: "patch", id, patch: { ...input, description: input.description ?? null, due_date: input.due_date ?? null } as Partial<Task> },
        () => api.tasks.update(id, input),
        (task) => dispatch({ type: "upsert", task }),
      );
    }
  }

  function deleteTask(task: Task) {
    setDialog(null);
    void optimistic({ type: "remove", id: task.id }, () => api.tasks.remove(task.id));
  }

  function onDragStart(task: Task, e: DragEvent) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(task.id));
    setDragId(task.id);
  }

  if (state.phase === "loading") return <Loading label="Loading board" />;
  if (state.phase === "error") return <ErrorState message={state.error ?? "Unknown error"} onRetry={load} />;

  const grouped = groupByStatus(state.tasks);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-1 text-sm"><a href="#/projects" className="underline underline-offset-2">← All projects</a></div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{project?.name}</h1>
          {project?.description && <p className="text-sm text-slate-600 dark:text-slate-400">{project.description}</p>}
        </div>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create", status: "todo" })}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          New task
        </button>
      </div>

      {notice && (
        <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
          <span>{notice}</span>
          <button type="button" className="underline" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {state.tasks.length === 0 && (
        <p className="mb-4 rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
          This board is empty. Add your first task to get started.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            tasks={grouped[s]}
            dragId={dragId}
            onAdd={(status) => setDialog({ mode: "create", status })}
            onEdit={(task) => setDialog({ mode: "edit", task })}
            onKeyboardMove={keyboardMove}
            onDragStart={onDragStart}
            onDragEnd={() => setDragId(null)}
            onDropTask={(id, status, index) => {
              setDragId(null);
              moveTask(id, status, index);
            }}
          />
        ))}
      </div>

      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {dialog && (
        <TaskDialog
          task={dialog.mode === "edit" ? dialog.task : undefined}
          defaultStatus={dialog.mode === "create" ? dialog.status : undefined}
          onClose={() => setDialog(null)}
          onSubmit={submitDialog}
          onDelete={dialog.mode === "edit" ? () => deleteTask(dialog.task) : undefined}
        />
      )}
    </main>
  );
}
