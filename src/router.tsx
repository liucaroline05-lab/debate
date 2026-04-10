import type { ReactNode } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { AuthProvider } from "@/features/auth/AuthContext";
import { HomePage } from "@/pages/public/HomePage";
import { AboutPage } from "@/pages/public/AboutPage";
import { ServicesPage } from "@/pages/public/ServicesPage";
import { ContactPage } from "@/pages/public/ContactPage";
import { LoginPage } from "@/pages/public/LoginPage";
import { SignupPage } from "@/pages/public/SignupPage";
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
    element: withProviders(<PublicLayout />),
    errorElement: withProviders(<NotFoundPage />),
    children: [
      { index: true, element: <HomePage /> },
      { path: "about", element: <AboutPage /> },
      { path: "services", element: <ServicesPage /> },
      { path: "contact", element: <ContactPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "signup", element: <SignupPage /> },
    ],
  },
  {
    path: "/app",
    element: withProviders(<ProtectedRoute />),
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
