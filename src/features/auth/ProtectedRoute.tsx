import { Outlet } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";

export const ProtectedRoute = () => {
  const { authReady } = useAuth();

  if (!authReady) {
    return (
      <div className="auth-layout">
        <div className="auth-card">
          <p className="eyebrow">Opening your dashboard</p>
          <h1>Gathering your latest debate work.</h1>
          <p className="muted">
            We are loading your account, recent uploads, and community spaces.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
};
