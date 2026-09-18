import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResourceDetailPage } from "@/pages/app/ResourceDetailPage";
import type { ResourceItem, ResourceNote, ResourceSave } from "@/types/models";

const service = vi.hoisted(() => ({
  saveResourceNote: vi.fn(async () => {}),
  subscribeToResourceNote: vi.fn(
    (
      _resourceId: string,
      _userId: string,
      onNote: (note: ResourceNote | null) => void,
    ) => {
      onNote(mocks.note);
      return () => {};
    },
  ),
  toggleResourceSave: vi.fn(async (_resourceId: string, _userId: string, isSaved: boolean) => !isSaved),
  updateResource: vi.fn(async () => {}),
}));

vi.mock("@/features/resources/resourceService", () => service);

vi.mock("@/features/messages/ShareToMessageDialog", () => ({
  ShareToMessageDialog: ({ title, url, previewKind }: { title: string; url: string; previewKind: string }) => (
    <div role="dialog" aria-label="Share resource">{`${previewKind}: ${title} — ${url}`}</div>
  ),
}));

const mocks = vi.hoisted(() => ({
  note: null as ResourceNote | null,
  saves: [] as ResourceSave[],
}));

const resource: ResourceItem = {
  id: "resource-1",
  slug: "evidence-triage",
  title: "Evidence triage drill",
  category: "Research",
  description: "Sort cards fast under time pressure.",
  curatedBy: "Coach Lee",
  creatorId: "coach",
  saved: false,
  level: "Growth",
  tags: ["Research"],
};

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    currentUser: { id: "maya", displayName: "Maya", role: "student" },
    authReady: true,
    isDemoMode: false,
  }),
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: (collectionName: string) => ({
    data: collectionName === "resources" ? [resource] : mocks.saves,
    isLoading: false,
    error: null,
  }),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/app/resources/evidence-triage"]}>
      <Routes>
        <Route path="/app/resources/:resourceId" element={<ResourceDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("ResourceDetailPage", () => {
  beforeEach(() => {
    mocks.note = null;
    mocks.saves = [];
    Object.values(service).forEach((fn) => fn.mockClear());
  });

  it("saves the resource without reading back a document that does not exist yet", async () => {
    const user = userEvent.setup();
    renderPage();

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toHaveAttribute("aria-pressed", "false");
    expect(saveButton).toHaveClass("btn", "btn-toggle");

    await user.click(saveButton);

    expect(service.toggleResourceSave).toHaveBeenCalledWith("resource-1", "maya", false);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Saved" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("offers a direct rich resource share", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByRole("dialog", { name: "Share resource" })).toHaveTextContent(`resource: Evidence triage drill — ${window.location.origin}/app/resources/evidence-triage`);
  });

  it("shows the note already stored for this reader", () => {
    mocks.note = {
      id: "resource-1-maya",
      resourceId: "resource-1",
      userId: "maya",
      content: "Run this before every practice round.",
      updatedAt: "2026-09-01T10:00:00.000Z",
    };

    renderPage();

    expect(screen.getByRole("textbox", { name: "My Notes" })).toHaveValue(
      "Run this before every practice round.",
    );
  });

  it("autosaves an edited note", async () => {
    vi.useFakeTimers();
    try {
      renderPage();

      fireEvent.change(screen.getByRole("textbox", { name: "My Notes" }), {
        target: { value: "Two minutes per card." },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });

      expect(service.saveResourceNote).toHaveBeenCalledWith(
        "resource-1",
        "maya",
        "Two minutes per card.",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
