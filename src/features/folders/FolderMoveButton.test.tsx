import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FolderMoveButton } from "@/features/folders/FolderMoveButton";
import type { ContentFolder } from "@/types/models";

const mocks = vi.hoisted(() => ({ moveContentFolder: vi.fn(() => Promise.resolve()) }));

vi.mock("@/features/folders/folderService", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/folders/folderService")>(),
  moveContentFolder: mocks.moveContentFolder,
}));

const makeFolder = (id: string, overrides: Partial<ContentFolder> = {}): ContentFolder => ({
  id,
  userId: "owner",
  name: id,
  visibility: "private",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const renderButton = async (folder: ContentFolder, ownedFolders: ContentFolder[]) => {
  render(<MemoryRouter><FolderMoveButton folder={folder} ownedFolders={ownedFolders} /></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Add to folder" }));
};

const optionLabels = () => screen.getAllByRole("option").map((option) => option.textContent);

describe("FolderMoveButton", () => {
  beforeEach(() => mocks.moveContentFolder.mockClear());

  it("never offers the folder itself or anything nested inside it", async () => {
    const folder = makeFolder("Prep");
    await renderButton(folder, [
      folder,
      makeFolder("Child", { parentFolderId: "Prep" }),
      makeFolder("Grandchild", { parentFolderId: "Child" }),
      makeFolder("Archive"),
    ]);
    expect(optionLabels()).toEqual(["Archive"]);
  });

  it("does not offer public folders for a private folder", async () => {
    const folder = makeFolder("Prep");
    await renderButton(folder, [folder, makeFolder("Public", { visibility: "public" }), makeFolder("Archive")]);
    expect(optionLabels()).toEqual(["Archive"]);
  });

  it("shows where nested destinations live", async () => {
    const folder = makeFolder("Prep");
    await renderButton(folder, [
      folder,
      makeFolder("Season", { tournamentName: "State" }),
      makeFolder("Evidence", { parentFolderId: "Season" }),
    ]);
    expect(optionLabels()).toEqual(["Season · State", "Season / Evidence"]);
  });

  it("warns before a public folder becomes private and adds it to the destination", async () => {
    const folder = makeFolder("Prep", { visibility: "public" });
    await renderButton(folder, [folder, makeFolder("Archive")]);
    expect(screen.getByText(/will become private to match “Archive”/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Add to folder" })[1]);
    expect(mocks.moveContentFolder).toHaveBeenCalledWith("Prep", "Archive");
    expect(await screen.findByRole("status")).toHaveTextContent("Added to folder.");
  });

  it("moves a nested folder back to the top level from its current parent", async () => {
    const folder = makeFolder("Prep", { parentFolderId: "Archive" });
    await renderButton(folder, [folder, makeFolder("Other"), makeFolder("Archive")]);
    expect(screen.getByRole("combobox")).toHaveValue("Archive");
    await userEvent.click(screen.getByRole("button", { name: "In folder · Remove" }));
    expect(mocks.moveContentFolder).toHaveBeenCalledWith("Prep", null);
  });

  it("explains when no folder can hold this one", async () => {
    const folder = makeFolder("Prep");
    await renderButton(folder, [folder]);
    expect(screen.getByText(/No compatible folders yet/)).toBeInTheDocument();
  });

  it("shows the reason when a move is rejected", async () => {
    mocks.moveContentFolder.mockRejectedValueOnce(new Error("A folder can't go inside itself or one of its subfolders."));
    const folder = makeFolder("Prep");
    await renderButton(folder, [folder, makeFolder("Archive")]);
    await userEvent.click(screen.getAllByRole("button", { name: "Add to folder" })[1]);
    expect(await screen.findByRole("status")).toHaveTextContent("can't go inside itself");
  });
});
