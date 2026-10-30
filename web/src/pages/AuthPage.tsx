import { useState, type FormEvent } from "react";
import { ApiError } from "../api/types";
import { DEMO_CREDENTIALS } from "../api/demo";
import { messageOf, navigate, useApi, useAuth } from "../hooks";
import { btnPrimary, btnSecondary, inputCls } from "../components/States";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const api = useApi();
  const [form, setForm] = useState({ name: "", email: "", password: "", password_confirmation: "" });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form);
      navigate("/projects");
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.fieldErrors);
      else setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (id: keyof typeof form, label: string, type = "text", autoComplete?: string) => (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={form[id]}
        onChange={set(id)}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `${id}-err` : undefined}
        className={inputCls}
      />
      {errors[id] && <p id={`${id}-err`} className="mt-1 text-sm text-red-700 dark:text-red-300">{errors[id]?.join(" ")}</p>}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">{isLogin ? "Sign in" : "Create your account"}</h1>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {!isLogin && field("name", "Name", "text", "name")}
        {field("email", "Email", "email", "email")}
        {field("password", "Password", "password", isLogin ? "current-password" : "new-password")}
        {!isLogin && field("password_confirmation", "Confirm password", "password", "new-password")}
        {formError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{formError}</p>}
        <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
        </button>
      </form>
      {api.mode === "mock" && isLogin && (
        <button
          type="button"
          className={`${btnSecondary} mt-3 w-full`}
          onClick={() => setForm({ ...form, ...DEMO_CREDENTIALS })}
        >
          Fill in demo credentials
        </button>
      )}
      <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">
        {isLogin ? (
          <>No account? <a className="underline" href="#/register">Register</a></>
        ) : (
          <>Already registered? <a className="underline" href="#/login">Sign in</a></>
        )}
      </p>
    </main>
  );
}
