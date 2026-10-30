import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Project } from "../types";
import { messageOf, useApi } from "../hooks";
import { EmptyState, ErrorState, Loading, btnPrimary, btnSecondary, inputCls } from "../components/States";

export function ProjectsPage() {
  const api = useApi();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setProjects(null);
    setError(null);
    api.projects.list().then(setProjects, (e) => setError(messageOf(e)));
  }, [api]);

  useEffect(load, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setFormError("Give the project a name.");
    setBusy(true);
    setFormError(null);
    try {
      const p = await api.projects.create({ name: name.trim() });
      setProjects((cur) => [p, ...(cur ?? [])]);
      setName("");
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Project) {
    if (!window.confirm(`Delete "${p.name}" and all of its tasks?`)) return;
    const before = projects;
    setProjects((cur) => cur?.filter((x) => x.id !== p.id) ?? null);
    try {
      await api.projects.remove(p.id);
    } catch (err) {
      setProjects(before);
      setError(messageOf(err));
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Projects</h1>
      <form onSubmit={create} className="mb-8 flex flex-wrap items-start gap-2" noValidate>
        <div className="min-w-60 flex-1">
          <label htmlFor="new-project" className="sr-only">New project name</label>
          <input id="new-project" value={name} onChange={(e) => setName(e.target.value)} placeholder="New project name" className={inputCls} aria-describedby={formError ? "new-project-err" : undefined} />
          {formError && <p id="new-project-err" role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{formError}</p>}
        </div>
        <button type="submit" disabled={busy} className={btnPrimary}>Create project</button>
      </form>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && projects === null && <Loading label="Loading projects" />}
      {projects && projects.length === 0 && <EmptyState title="No projects yet">Create your first project above to get a board.</EmptyState>}
      {projects && projects.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id} className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <a href={`#/projects/${p.id}`} className="text-lg font-medium underline-offset-2 hover:underline">{p.name}</a>
              <p className="mt-1 flex-1 text-sm text-slate-600 dark:text-slate-400">{p.description ?? "No description"}</p>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">{p.tasks_count ?? 0} tasks</span>
                <button type="button" className={btnSecondary} onClick={() => remove(p)} aria-label={`Delete project ${p.name}`}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
