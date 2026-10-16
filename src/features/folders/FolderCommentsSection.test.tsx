import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FolderCommentsSection } from "@/features/folders/FolderCommentsSection";
import type { ContentFolder, ContentFolderComment, ContentFolderCommentReaction } from "@/types/models";

const mocks = vi.hoisted(() => ({
  comments: [] as ContentFolderComment[],
  reactions: [] as ContentFolderCommentReaction[],
  toggleReaction: vi.fn(() => Promise.resolve({ like: true, dislike: false })),
}));

vi.mock("@/features/folders/folderService", () => ({
  addContentFolderComment: vi.fn(),
  deleteContentFolderComment: vi.fn(),
  toggleContentFolderCommentReaction: mocks.toggleReaction,
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: (collectionName: string) => ({
    data: collectionName === "folderComments" ? mocks.comments : mocks.reactions,
    isLoading: false,
    error: null,
  }),
}));

const folder: ContentFolder = {
  id: "folder-1",
  userId: "owner",
  name: "State prep",
  visibility: "public",
  commentCount: 1,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const comment: ContentFolderComment = {
  id: "comment-1",
  folderId: "folder-1",
  userId: "someone",
  authorName: "Jordan",
  content: "Great cards",
  visibility: "public",
  likeCount: 2,
  dislikeCount: 1,
  createdAt: "2026-10-02T00:00:00.000Z",
};

const renderSection = (isOpen: boolean) => render(
  <FolderCommentsSection
    folder={folder}
    currentUser={{ id: "viewer", displayName: "Viewer" }}
    canModerate={false}
    isOpen={isOpen}
    onClose={() => undefined}
  />,
);

describe("FolderCommentsSection", () => {
  beforeEach(() => {
    mocks.comments = [comment];
    mocks.reactions = [];
    mocks.toggleReaction.mockClear();
  });

  it("stays collapsed and inert until opened", () => {
    const { container, rerender } = renderSection(false);
    const reveal = container.querySelector(".folder-comments-reveal");
    expect(reveal).not.toHaveClass("is-open");
    expect(reveal).toHaveAttribute("inert");

    rerender(
      <FolderCommentsSection
        folder={folder}
        currentUser={{ id: "viewer", displayName: "Viewer" }}
        canModerate={false}
        isOpen
        onClose={() => undefined}
      />,
    );
    expect(reveal).toHaveClass("is-open");
    expect(reveal).not.toHaveAttribute("inert");
  });

  it("shows comment reaction counts and toggles a like", async () => {
    mocks.reactions = [{
      id: "comment-1-viewer",
      commentId: "comment-1",
      folderId: "folder-1",
      userId: "viewer",
      like: false,
      dislike: true,
      createdAt: "2026-10-02T00:00:00.000Z",
    }];
    renderSection(true);

    const like = screen.getByRole("button", { name: "Like comment from Jordan" });
    const dislike = screen.getByRole("button", { name: "Dislike comment from Jordan" });
    expect(like).toHaveTextContent("2");
    expect(like).toHaveAttribute("aria-pressed", "false");
    expect(dislike).toHaveTextContent("1");
    expect(dislike).toHaveClass("is-dislike");

    await userEvent.click(like);
    expect(mocks.toggleReaction).toHaveBeenCalledWith(comment, "viewer", "like");
  });
});
