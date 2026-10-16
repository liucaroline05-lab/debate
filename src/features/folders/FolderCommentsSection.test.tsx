import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FolderCommentsSection } from "@/features/folders/FolderCommentsSection";
import type { ContentFolder, ContentFolderComment, ContentFolderCommentReaction } from "@/types/models";

const mocks = vi.hoisted(() => ({
  comments: [] as ContentFolderComment[],
  reactions: [] as ContentFolderCommentReaction[],
  toggleReaction: vi.fn(() => Promise.resolve({ like: true, dislike: false })),
  updateComment: vi.fn(() => Promise.resolve()),
  deleteComment: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/features/folders/folderService", () => ({
  addContentFolderComment: vi.fn(),
  deleteContentFolderComment: mocks.deleteComment,
  toggleContentFolderCommentReaction: mocks.toggleReaction,
  updateContentFolderComment: mocks.updateComment,
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

const section = (props: { isOpen: boolean; viewerId?: string; canModerate?: boolean }) => (
  <FolderCommentsSection
    folder={folder}
    currentUser={{ id: props.viewerId ?? "viewer", displayName: "Viewer" }}
    canModerate={props.canModerate ?? false}
    isOpen={props.isOpen}
    onClose={() => undefined}
  />
);

const setScrollY = (value: number) => Object.defineProperty(window, "scrollY", { value, configurable: true });

describe("FolderCommentsSection", () => {
  beforeEach(() => {
    mocks.comments = [comment];
    mocks.reactions = [];
    mocks.toggleReaction.mockClear();
    mocks.updateComment.mockClear();
    mocks.deleteComment.mockClear();
    // Reduced motion makes the reveal scroll land in a single step.
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    setScrollY(0);
  });

  it("stays collapsed and inert until opened", () => {
    const { container, rerender } = render(section({ isOpen: false }));
    const reveal = container.querySelector(".folder-comments-reveal");
    expect(reveal).not.toHaveClass("is-open");
    expect(reveal).toHaveAttribute("inert");
    expect(window.scrollTo).not.toHaveBeenCalled();

    rerender(section({ isOpen: true }));
    expect(reveal).toHaveClass("is-open");
    expect(reveal).not.toHaveAttribute("inert");
  });

  it("scrolls down to the comments when opened and back up when closed", () => {
    setScrollY(300);
    const { rerender } = render(section({ isOpen: false }));

    rerender(section({ isOpen: true }));
    expect(window.scrollTo).toHaveBeenCalledTimes(1);

    setScrollY(900);
    rerender(section({ isOpen: false }));
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 300);
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
    render(section({ isOpen: true }));

    const like = screen.getByRole("button", { name: "Like comment from Jordan" });
    const dislike = screen.getByRole("button", { name: "Dislike comment from Jordan" });
    expect(like).toHaveTextContent("2");
    expect(like).toHaveAttribute("aria-pressed", "false");
    expect(dislike).toHaveTextContent("1");
    expect(dislike).toHaveClass("is-dislike");

    await userEvent.click(like);
    expect(mocks.toggleReaction).toHaveBeenCalledWith(comment, "viewer", "like");
  });

  it("lets the author edit their comment from the options menu", async () => {
    const user = userEvent.setup();
    render(section({ isOpen: true, viewerId: "someone" }));

    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Options for comment from Jordan" }));
    expect(screen.getByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /edit/i }));

    const editor = screen.getByLabelText("Edit your comment");
    await user.clear(editor);
    await user.type(editor, "Even better cards");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.updateComment).toHaveBeenCalledWith(comment, "Even better cards");
  });

  it("gives folder owners delete but not edit, and hides the menu from others", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { unmount } = render(section({ isOpen: true, viewerId: "owner", canModerate: true }));

    await user.click(screen.getByRole("button", { name: "Options for comment from Jordan" }));
    expect(screen.queryByRole("menuitem", { name: /edit/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /delete/i }));
    expect(mocks.deleteComment).toHaveBeenCalledWith(comment);
    unmount();

    render(section({ isOpen: true }));
    expect(screen.queryByRole("button", { name: "Options for comment from Jordan" })).not.toBeInTheDocument();
  });
});
