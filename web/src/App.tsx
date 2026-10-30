import { useEffect } from "react";
import type { Api } from "./api/types";
import { AuthProvider, navigate, useAuth, useHashPath } from "./hooks";
import { AuthPage } from "./pages/AuthPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { BoardPage } from "./pages/BoardPage";
import { DemoBanner } from "./components/DemoBanner";
import { ThemeToggle } from "./components/ThemeToggle";
import { Loading } from "./components/States";

function Shell({ api }: { api: Api }) {
  const { user, booting, logout } = useAuth();
  const path = useHashPath();

  const isAuthRoute = path === "/login" || path === "/register";
  const board = /^\/projects\/(\d+)$/.exec(path);

  useEffect(() => {
    if (booting) return;
    if (!user && !isAuthRoute) navigate("/login");
    else if (user && (isAuthRoute || path === "/")) navigate("/projects");
  }, [booting, user, isAuthRoute, path]);

  let page;
  if (booting) page = <Loading label="Starting" />;
  else if (!user) page = isAuthRoute ? <AuthPage key={path} mode={path === "/register" ? "register" : "login"} /> : null;
  else if (board?.[1]) page = <BoardPage key={board[1]} projectId={Number(board[1])} />;
  else if (path === "/projects") page = <ProjectsPage />;
  else page = isAuthRoute || path === "/" ? null : <main className="p-8"><h1 className="text-xl font-semibold">Page not found</h1><a className="underline" href="#/projects">Go to projects</a></main>;

  return (
    <div className="flex min-h-screen flex-col">
      {api.mode === "mock" && <DemoBanner api={api} />}
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a href="#/projects" className="text-lg font-bold tracking-tight">TaskFlow</a>
          <nav className="flex items-center gap-3 text-sm" aria-label="Account">
            {user && <span className="hidden text-slate-600 sm:inline dark:text-slate-400">{user.name}</span>}
            <ThemeToggle />
            {user && (
              <button type="button" onClick={() => void logout().then(() => navigate("/login"))} className="rounded-md border border-slate-300 px-2.5 py-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
                Sign out
              </button>
            )}
          </nav>
        </div>
      </header>
      <div className="flex-1">{page}</div>
    </div>
  );
}

export default function App({ api }: { api: Api }) {
  return (
    <AuthProvider api={api}>
      <Shell api={api} />
    </AuthProvider>
  );
}
