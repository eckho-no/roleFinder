"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type LoginBody = { ok: boolean };

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (response.status === 429) {
        setError("Too many attempts — try again shortly.");
        return;
      }

      const body = (await response.json()) as LoginBody;
      if (!body.ok) {
        setError("Incorrect password.");
        return;
      }

      // The session cookie is already set (via the fetch response's
      // Set-Cookie header) by the time this runs, so the RSC request
      // `router.push` triggers carries it — no full reload needed.
      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor="password" className="text-sm" style={{ color: "var(--paper-dim)" }}>
        Password
      </label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoFocus
        autoComplete="current-password"
        className="h-11 rounded border px-3 text-base"
        style={{
          backgroundColor: "var(--ink)",
          color: "var(--paper)",
          borderColor: "var(--paper-dim)",
        }}
      />
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--skip)" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || password.length === 0}
        className="h-11 rounded font-medium disabled:opacity-50"
        style={{ backgroundColor: "var(--act)", color: "var(--ink)" }}
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
