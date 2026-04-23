import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import type { UserRole } from "@/types/models";

type AuthMode = "login" | "signup";

const getModeFromSearch = (value: string | null): AuthMode =>
  value === "signup" ? "signup" : "login";

export const AuthOverlay = () => {
  const { login, signup, loginWithGoogle, isDemoMode } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = getModeFromSearch(searchParams.get("auth"));
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    role: "student" as UserRole,
  });
  const [error, setError] = useState("");

  const setMode = (nextMode: AuthMode) => {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (nextMode === "signup") {
      nextSearchParams.set("auth", "signup");
    } else {
      nextSearchParams.delete("auth");
    }

    setError("");
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    try {
      if (mode === "signup") {
        await signup(form);
        return;
      }

      await login({
        email: form.email,
        password: form.password,
      });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : mode === "signup"
            ? "Unable to create your account right now."
            : "Unable to log in right now.",
      );
    }
  };

  const handleGoogleAuth = async () => {
    setError("");

    try {
      await loginWithGoogle();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to continue with Google right now.",
      );
    }
  };

  return (
    <section className="app-auth-overlay" aria-label="Authentication">
      <form className="auth-card app-auth-card" onSubmit={handleSubmit}>
        <p className="eyebrow">{mode === "signup" ? "Create your space" : "Welcome back"}</p>
        <h1>
          {mode === "signup"
            ? "Open a calm, structured home for your debate work."
            : "Step back into your practice space."}
        </h1>
        <p className="muted">
          {isDemoMode
            ? mode === "signup"
              ? "Firebase needs to be configured before new accounts can be created."
              : "Firebase needs to be configured before anyone can log in."
            : mode === "signup"
              ? "Create an account with email and password or continue with Google."
              : "Use your email or Google account to continue."}
        </p>

        <div className="form-grid" style={{ marginTop: "1.5rem" }}>
          {mode === "signup" ? (
            <>
              <div className="form-field">
                <label htmlFor="displayName">Display name</label>
                <input
                  id="displayName"
                  placeholder="Maya Rivera"
                  value={form.displayName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, displayName: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="role">Role</label>
                <select
                  id="role"
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      role: event.target.value as UserRole,
                    }))
                  }
                >
                  <option value="student">Student</option>
                  <option value="coach">Coach</option>
                </select>
              </div>
            </>
          ) : null}

          <div className="form-field full">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="maya@example.com"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              required
            />
          </div>

          <div className="form-field full">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              required
            />
          </div>
        </div>

        {error ? <p className="meta-line">{error}</p> : null}

        <div className="button-row" style={{ marginTop: "1.25rem" }}>
          <button type="submit" className="btn btn-primary">
            {mode === "signup" ? "Create account" : "Log in"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleGoogleAuth()}
          >
            Continue with Google
          </button>
        </div>

        <p className="auth-switch-line">
          {mode === "signup" ? "Already have an account?" : "Need an account?"}{" "}
          <button
            type="button"
            className="auth-switch-button"
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          >
            {mode === "signup" ? "Log in instead." : "Create one here."}
          </button>
        </p>
      </form>
    </section>
  );
};
