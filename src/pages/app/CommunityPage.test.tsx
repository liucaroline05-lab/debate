import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityPage } from "@/pages/app/CommunityPage";
import type {
  CommunityPost,
  PostComment,
  PostCommentReaction,
  UserProfile,
} from "@/types/models";

const service = vi.hoisted(() => ({
  addCommentToPost: vi.fn(async () => {}),
  createPracticeGroup: vi.fn(async () => ({ id: "c", inviteCode: undefined })),
  createPost: vi.fn(async () => {}),
  deletePostById: vi.fn(async () => {}),
  incrementPostShareCount: vi.fn(async () => {}),
  joinPracticeGroupByCode: vi.fn(async () => "Group"),
  reportPostById: vi.fn(async () => {}),
  toggleCommentReaction: vi.fn(async () => {}),
  togglePostReaction: vi.fn(async () => {}),
  updatePostContent: vi.fn(async () => {}),
}));

vi.mock("@/features/community/communityService", () => service);

const mocks = vi.hoisted(() => ({
  comments: [] as PostComment[],
  commentReactions: [] as PostCommentReaction[],
  blocks: [] as Array<{ id: string; blockerId: string; blockedId: string; createdAt: string }>,
}));

const author: UserProfile = {
  id: "maya",
  displayName: "Maya Rivera",
  email: "maya@example.com",
  role: "student",
  bio: "",
  focusAreas: [],
  organizationTags: [],
  recommendationSlots: [],
  preferences: {
    notifications: {
      speechFeedback: true,
      debateTurnReminders: true,
      communityReplies: true,
      tournamentReminders: true,
    },
    debateDefaults: {
      preferredFormat: "Public Forum",
      preferredSide: "Either",
      asyncResponseCadence: "24 hours",
    },
    messaging: { whoCanMessage: "everyone" },
  },
  createdAt: "2026-08-01T10:00:00.000Z",
};

const post: CommunityPost = {
  id: "post-1",
  channelId: "channel-community",
  authorId: "james",
  author: "James Kim",
  category: "Question",
  title: "How do you weigh probability against magnitude?",
  content: "Looking for a clean framework explanation.",
  createdAt: "2026-09-01T10:00:00.000Z",
  replyCount: 2,
  reported: false,
};

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ currentUser: author, authReady: true, isDemoMode: false }),
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: (collectionName: string) => {
    const byCollection: Record<string, unknown[]> = {
      users: [author],
      channels: [],
      posts: [post],
      postComments: mocks.comments,
      follows: [],
      userBlocks: mocks.blocks,
      postReactions: [],
      postCommentReactions: mocks.commentReactions,
    };
    return { data: byCollection[collectionName] ?? [], isLoading: false, error: null };
  },
}));

const comment = (overrides: Partial<PostComment> = {}): PostComment => ({
  id: "comment-1",
  postId: post.id,
  authorId: "james",
  authorName: "James Kim",
  content: "Start by comparing the warrants.",
  createdAt: "2026-09-01T11:00:00.000Z",
  likeCount: 0,
  dislikeCount: 0,
  ...overrides,
});

const openComments = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Toggle comments" }));

describe("CommunityPage comments", () => {
  beforeEach(() => {
    mocks.comments = [comment()];
    mocks.commentReactions = [];
    mocks.blocks = [];
    Object.values(service).forEach((fn) => fn.mockClear());
  });

  it("votes on an individual comment", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommunityPage /></MemoryRouter>);

    await openComments(user);
    await user.click(screen.getByRole("button", { name: "Like comment by James Kim" }));

    expect(service.toggleCommentReaction).toHaveBeenCalledWith(
      "comment-1",
      "post-1",
      "maya",
      "like",
    );
  });

  it("hides posts from blocked accounts", () => {
    mocks.blocks = [{ id: "maya-james", blockerId: "maya", blockedId: "james", createdAt: "2026-09-01" }];
    render(<MemoryRouter><CommunityPage /></MemoryRouter>);
    expect(screen.queryByText(post.title ?? "")).not.toBeInTheDocument();
  });

  it("posts a reply against its parent comment", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><CommunityPage /></MemoryRouter>);

    await openComments(user);
    await user.click(screen.getByRole("button", { name: "Reply to James Kim" }));
    await user.type(
      screen.getByRole("textbox", { name: "Reply to James Kim" }),
      "Weigh the link first.",
    );
    await user.click(screen.getByRole("button", { name: "Post reply to James Kim" }));

    expect(service.addCommentToPost).toHaveBeenCalledWith(
      "post-1",
      "maya",
      "Maya Rivera",
      "Weigh the link first.",
      "comment-1",
    );
  });

  it("nests a reply under the comment it answers", async () => {
    mocks.comments = [
      comment(),
      comment({
        id: "comment-2",
        parentCommentId: "comment-1",
        authorId: "maya",
        authorName: "Maya Rivera",
        content: "That helped, thanks.",
        createdAt: "2026-09-01T12:00:00.000Z",
      }),
    ];

    const user = userEvent.setup();
    render(<MemoryRouter><CommunityPage /></MemoryRouter>);
    await openComments(user);

    const reply = screen.getByText("That helped, thanks.");
    expect(reply.closest(".forum-comment-replies")).not.toBeNull();

    const root = screen.getByText("Start by comparing the warrants.");
    expect(root.closest(".forum-comment-replies")).toBeNull();
  });
});
