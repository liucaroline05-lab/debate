import type { ReactNode } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { AuthProvider } from "@/features/auth/AuthContext";
import { DashboardPage } from "@/pages/app/DashboardPage";
import { SpeechUploadPage } from "@/pages/app/SpeechUploadPage";
import { SpeechDetailPage } from "@/pages/app/SpeechDetailPage";
import { DebatesPage } from "@/pages/app/DebatesPage";
import { DebateWatchPage } from "@/pages/app/DebateWatchPage";
import { ResourcesPage } from "@/pages/app/ResourcesPage";
import { CommunityPage } from "@/pages/app/CommunityPage";
import { ProfilePage } from "@/pages/app/ProfilePage";
import { UserProfilePage } from "@/pages/app/UserProfilePage";
import { SettingsPage } from "@/pages/app/SettingsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

const withProviders = (element: ReactNode) => <AuthProvider>{element}</AuthProvider>;

export const router = createBrowserRouter([
  {
    path: "/",
    element: withProviders(<Navigate to="/app/dashboard" replace />),
  },
  {
    path: "/about",
    element: withProviders(<Navigate to="/app/dashboard" replace />),
  },
  {
    path: "/services",
    element: withProviders(<Navigate to="/app/dashboard" replace />),
  },
  {
    path: "/contact",
    element: withProviders(<Navigate to="/app/dashboard" replace />),
  },
  {
    path: "/login",
    element: withProviders(<Navigate to="/app/dashboard" replace />),
  },
  {
    path: "/signup",
    element: withProviders(<Navigate to="/app/dashboard?auth=signup" replace />),
  },
  {
    path: "/app",
    element: withProviders(<ProtectedRoute />),
    errorElement: withProviders(<NotFoundPage />),
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: "dashboard", element: <DashboardPage /> },
          { path: "speeches/new", element: <SpeechUploadPage /> },
          { path: "speeches/:speechId", element: <SpeechDetailPage /> },
          { path: "debates", element: <DebatesPage /> },
          { path: "debates/:debateId", element: <DebateWatchPage /> },
          { path: "resources", element: <ResourcesPage /> },
          { path: "community", element: <CommunityPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "users/:userId", element: <UserProfilePage /> },
          { path: "settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
  {
    path: "*",
    element: withProviders(<NotFoundPage />),
  },
]);
