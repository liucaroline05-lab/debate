import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { DashboardPage } from "@/pages/app/DashboardPage";

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    currentUser: null,
    authReady: true,
    isDemoMode: true,
  }),
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: () => ({
    data: [],
    isLoading: false,
    error: null,
  }),
}));

describe("DashboardPage", () => {
  it("shows the main dashboard sections", () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /your debate week at a glance/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /recent speeches/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /resource library/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /channels/i })).toBeInTheDocument();
  });
});
