import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FoldersPage } from "@/pages/app/FoldersPage";
import type { ContentFolder } from "@/types/models";

const makeFolder = (id: string, overrides: Partial<ContentFolder> = {}): ContentFolder => ({
  id,
  userId: "maya",
  name: id,
  visibility: "private",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const folders = [
  makeFolder("Season"),
  makeFolder("Evidence", { parentFolderId: "Season" }),
  makeFolder("Briefs", { parentFolderId: "Evidence" }),
];

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ currentUser: { id: "maya", displayName: "Maya Rivera" } }),
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: (collectionName: string) => ({
    data: collectionName === "folders" ? folders : [],
    isLoading: false,
    error: null,
  }),
}));

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/app/folders" element={<FoldersPage />} />
      <Route path="/app/folders/:folderId" element={<FoldersPage />} />
    </Routes>
  </MemoryRouter>,
);

describe("FoldersPage nested folders", () => {
  it("lists nested folders as their own entries on the main screen", () => {
    renderAt("/app/folders");
    const yourFolders = screen.getByRole("heading", { name: "Your folders" }).closest("article")!;
    for (const name of ["Season", "Evidence", "Briefs"]) {
      expect(within(yourFolders).getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("still shows only direct children on a folder's board", () => {
    renderAt("/app/folders/Season");
    const board = screen.getByRole("heading", { name: "Board" }).closest("section")!;
    expect(within(board).getByText("Evidence")).toBeInTheDocument();
    expect(within(board).queryByText("Briefs")).not.toBeInTheDocument();
  });
});
