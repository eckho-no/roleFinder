import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ backgroundColor: "var(--ink)", color: "var(--paper)" }}
    >
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-xl font-semibold" style={{ color: "var(--paper)" }}>
          roleFinder
        </h1>
        {/* useSearchParams (for the post-login `next` redirect) opts a
            client component out of static rendering unless wrapped in
            Suspense. */}
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
