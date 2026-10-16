import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { DashboardPage } from "@/pages/app/DashboardPage";
import type { TabroomEvent, TabroomImport } from "@/types/models";

const mocks = vi.hoisted(() => ({
  tabroomImports: [] as TabroomImport[],
  syncTabroomSession: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    currentUser: null,
    authReady: true,
    isDemoMode: true,
  }),
}));

vi.mock("@/features/profile/profileService", () => ({
  syncTabroomSession: mocks.syncTabroomSession,
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: (collectionName: string) => ({
    data: collectionName === "tabroomImports" ? mocks.tabroomImports : [],
    isLoading: false,
    error: null,
  }),
}));

const futureDate = (daysAhead: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T12:00:00.000Z`;
};

const tabroomEvent = (overrides: Partial<TabroomEvent>): TabroomEvent => ({
  id: "event",
  name: "Tournament",
  date: futureDate(3),
  endDate: futureDate(3),
  result: "",
  sourceUrl: "https://www.tabroom.com/",
  ...overrides,
});

const tabroomImport = (events: TabroomEvent[], lastSuccessfulAt: string): TabroomImport => ({
  id: "tabroom-import-user",
  userId: "user",
  status: "success",
  source: "tabroom-api",
  startedAt: lastSuccessfulAt,
  lastSuccessfulAt,
  events,
});

describe("DashboardPage", () => {
  beforeEach(() => {
    mocks.tabroomImports = [];
    mocks.syncTabroomSession.mockClear();
  });

  it("shows the main dashboard sections", () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /your workspace/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /recent speeches/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /resource library/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /channels/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload another" })).toHaveAttribute("href", "/app/speeches/new?upload=1");
  });

  it("marks waitlisted tournaments and hides dropped or cancelled ones", () => {
    mocks.tabroomImports = [tabroomImport([
      tabroomEvent({ id: "registered", name: "Registered Invitational", date: futureDate(2), endDate: futureDate(2) }),
      tabroomEvent({ id: "waitlisted", name: "Waitlisted Classic", date: futureDate(4), endDate: futureDate(4), entryStatus: "waitlisted" }),
      tabroomEvent({ id: "dropped", name: "Dropped Open", entryStatus: "dropped" }),
      tabroomEvent({ id: "cancelled", name: "Cancelled Cup", entryStatus: "cancelled" }),
    ], new Date().toISOString())];

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Registered Invitational")).toBeInTheDocument();
    const waitlisted = screen.getByText("Waitlisted Classic").closest("button");
    expect(waitlisted).toHaveClass("is-waitlisted");
    expect(screen.queryByText("Dropped Open")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancelled Cup")).not.toBeInTheDocument();
    expect(screen.getByText("Waitlisted", { selector: ".dashboard-calendar-legend span" })).toBeInTheDocument();
    // A fresh import does not trigger another Tabroom sync.
    expect(mocks.syncTabroomSession).not.toHaveBeenCalled();
  });

  it("puts Sync now beside the calendar legend", () => {
    mocks.tabroomImports = [tabroomImport([], new Date().toISOString())];

    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    const footer = container.querySelector(".dashboard-calendar-footer");
    expect(footer).toContainElement(screen.getByRole("button", { name: /sync now/i }));
    expect(footer).toContainElement(screen.getByLabelText("Calendar legend"));
  });

  it("asks to reconnect instead of syncing once the Tabroom session expired", () => {
    mocks.tabroomImports = [{
      ...tabroomImport([], new Date(Date.now() - 60 * 60 * 1000).toISOString()),
      status: "error",
      errorCode: "session-expired",
      errorMessage: "Your Tabroom connection expired. Reconnect your account to sync again.",
    }];

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /reconnect tabroom/i })).toHaveAttribute("href", "/app/profile#tabroom");
    expect(screen.queryByRole("button", { name: /sync now/i })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/connection expired/i);
    expect(mocks.syncTabroomSession).not.toHaveBeenCalled();
  });

  it("refreshes a stale Tabroom import when the dashboard opens", () => {
    mocks.tabroomImports = [tabroomImport([], new Date(Date.now() - 60 * 60 * 1000).toISOString())];

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(mocks.syncTabroomSession).toHaveBeenCalledTimes(1);
  });
});
