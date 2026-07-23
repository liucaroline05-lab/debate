import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DebatesPage } from "@/pages/app/DebatesPage";
import type {
  DebateComment,
  DebateMatchRequest,
  DebateMessage,
  DebateThread,
} from "@/types/models";

const mocks = vi.hoisted(() => ({
  collections: {} as Record<string, unknown[]>,
}));

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    currentUser: { id: "me", displayName: "Me", role: "student" },
    authReady: true,
    isDemoMode: false,
  }),
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: (collectionName: string) => ({
    data: mocks.collections[collectionName] ?? [],
    isLoading: false,
    error: null,
  }),
}));

const service = vi.hoisted(() => ({
  acceptOpenChallenge: vi.fn(),
  addDebateComment: vi.fn(),
  addDebateMessage: vi.fn(),
  createOpenChallenge: vi.fn(),
  createPrivateDebate: vi.fn(async () => ({ id: "new", inviteCode: "ABC123" })),
  finalizeDebateIfComplete: vi.fn(async () => true),
  incrementDebateShareCount: vi.fn(),
  joinDebateByInviteCode: vi.fn(),
  markDebateChatRead: vi.fn(),
  submitDebateTurn: vi.fn(async () => ({
    speechUrl: "https://example.com/speech.webm",
    completed: false,
  })),
  toggleDebateReaction: vi.fn(),
}));

vi.mock("@/features/debates/debateService", () => service);

const baseDebate = (overrides: Partial<DebateThread>): DebateThread => ({
  id: "debate",
  topic: "Resolved: test topic",
  format: "Lincoln-Douglas",
  status: "Active",
  visibility: "public",
  commentsEnabled: true,
  commentCount: 0,
  nextDeadline: "2026-05-01T00:00:00.000Z",
  affirmative: { name: "Me", side: "Aff", label: "Affirmative", userId: "me" },
  negative: { name: "Opponent", side: "Neg", label: "Negative", userId: "opp" },
  currentRound: 1,
  totalRounds: 4,
  spectators: 5,
  participantIds: ["me", "opp"],
  turns: [],
  ...overrides,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <DebatesPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.collections = {
    debates: [],
    matchRequests: [],
    debateMessages: [],
    debateComments: [],
    debateReactions: [],
  };
  Object.values(service).forEach((fn) => fn.mockClear());
});

describe("DebatesPage — My Debates", () => {
  it("moves to Completed after the final speech finishes the debate", async () => {
    mocks.collections.debates = [
      baseDebate({
        totalRounds: 1,
        currentTurnUserId: "me",
      }),
    ];
    service.submitDebateTurn.mockResolvedValueOnce({
      speechUrl: "https://example.com/final.webm",
      completed: true,
    });

    renderPage();

    const uploadLabel = screen.getByText(/record \/ upload/i).closest("label");
    const uploadInput = uploadLabel?.querySelector("input[type='file']");
    expect(uploadInput).not.toBeNull();

    await act(async () => {
      fireEvent.change(uploadInput as HTMLInputElement, {
        target: {
          files: [new File(["audio"], "final.webm", { type: "audio/webm" })],
        },
      });
    });

    expect(screen.getByRole("tab", { name: /^completed$/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /final speech submitted.*now complete/i,
    );
  });

  it("shows an active your-turn debate above a waiting debate with the right actions", () => {
    mocks.collections.debates = [
      baseDebate({
        id: "waiting",
        topic: "Waiting debate",
        currentTurnUserId: "opp",
        participantIds: ["me", "opp"],
      }),
      baseDebate({
        id: "yourturn",
        topic: "Your turn debate",
        currentTurnUserId: "me",
        participantIds: ["me", "opp"],
      }),
    ];

    renderPage();

    // Your-turn action controls.
    expect(screen.getByText(/your turn — reply/i)).toBeInTheDocument();
    expect(screen.getByText(/record \/ upload/i)).toBeInTheDocument();
    expect(screen.getAllByText(/unlocks after the previous speech/i)).toHaveLength(6);

    // Waiting action controls.
    expect(screen.getByText(/waiting on opponent/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /chat/i })).toHaveLength(2);

    // Your-turn debate is ordered before the waiting debate.
    const topics = screen
      .getAllByRole("heading", { level: 2 })
      .map((node) => node.textContent);
    expect(topics.indexOf("Your turn debate")).toBeLessThan(
      topics.indexOf("Waiting debate"),
    );
  });

  it("shows an empty state with navigation when the user has no debates", () => {
    mocks.collections.debates = [
      baseDebate({ id: "other", participantIds: ["someone", "else"] }),
    ];
    mocks.collections.matchRequests = [
      {
        id: "m1",
        topic: "Open challenge topic",
        format: "Public Forum",
        skillLevel: "Intermediate",
        requestedBy: "Rival",
        creatorId: "rival",
        preferredSide: "Aff",
        status: "Open",
        createdAt: "2026-04-01T00:00:00.000Z",
      } satisfies DebateMatchRequest,
    ];

    renderPage();

    expect(screen.getByText(/you have no debates yet/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /browse open challenges/i }));

    expect(screen.getByText("Open challenge topic")).toBeInTheDocument();
  });

  it("opens the chat drawer and renders persisted messages", () => {
    mocks.collections.debates = [
      baseDebate({ id: "d1", currentTurnUserId: "opp", participantIds: ["me", "opp"] }),
    ];
    mocks.collections.debateMessages = [
      {
        id: "msg-1",
        debateId: "d1",
        authorId: "opp",
        authorName: "Opponent",
        content: "Ready when you are.",
        createdAt: "2026-04-02T10:00:00.000Z",
      } satisfies DebateMessage,
    ];

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /chat/i }));

    const dialog = screen.getByRole("dialog", { name: /debate chat/i });
    expect(within(dialog).getByText("Ready when you are.")).toBeInTheDocument();
  });
});

describe("DebatesPage — Completed", () => {
  it("separates the current user's completed debates from public community debates", () => {
    mocks.collections.debates = [
      baseDebate({
        id: "mine-complete",
        topic: "My finished round",
        status: "Completed",
        participantIds: ["me", "opp"],
      }),
      baseDebate({
        id: "public-complete",
        topic: "Public finished round",
        status: "Completed",
        participantIds: ["other-a", "other-b"],
      }),
    ];

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /^completed$/i }));

    const myColumn = screen
      .getByRole("heading", { name: "My completed debates" })
      .closest(".completed-debates-column");
    const publicColumn = screen
      .getByRole("heading", { name: "Public completed debates" })
      .closest(".completed-debates-column");

    expect(myColumn).not.toBeNull();
    expect(publicColumn).not.toBeNull();
    expect(within(myColumn as HTMLElement).getByText("My finished round")).toBeInTheDocument();
    expect(within(myColumn as HTMLElement).queryByText("Public finished round")).not.toBeInTheDocument();
    expect(within(publicColumn as HTMLElement).getByText("Public finished round")).toBeInTheDocument();
    expect(within(publicColumn as HTMLElement).queryByText("My finished round")).not.toBeInTheDocument();
  });
});

describe("DebatesPage — inline debate composer", () => {
  it("defaults comments on and persists comments off when toggled", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /\+ new debate/i }));

    const commentsOn = screen.getByRole("button", { name: /comments on/i });
    const commentsOff = screen.getByRole("button", { name: /comments off/i });
    expect(commentsOn).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText(/^topic$/i), {
      target: { value: "Resolved: toggled off" },
    });
    fireEvent.click(commentsOff);
    // Wrap in act so the async create's trailing state updates settle.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /create debate/i }));
    });

    expect(service.createOpenChallenge).toHaveBeenCalledTimes(1);
    expect(service.createOpenChallenge.mock.calls[0][0]).toMatchObject({
      commentsEnabled: false,
      topic: "Resolved: toggled off",
    });
  });
});

describe("DebatesPage — spectator comments", () => {
  it("moves completed participant debates out of My Debates and exposes both review actions", () => {
    mocks.collections.debates = [
      baseDebate({
        id: "done-participant",
        topic: "Completed participant debate",
        status: "Completed",
        participantIds: ["me", "opp"],
      }),
    ];

    renderPage();

    expect(screen.queryByText("Completed participant debate")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^completed$/i }));

    expect(screen.getByText("Completed participant debate")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^view debate$/i })).toHaveAttribute(
      "href",
      "/app/debates/done-participant",
    );
    expect(screen.getByRole("link", { name: /^view summary$/i })).toHaveAttribute(
      "href",
      "/app/debates/done-participant?view=summary",
    );
  });

  it("repairs debates left active by the old doubled turn count", () => {
    mocks.collections.debates = [
      baseDebate({
        id: "stale-complete",
        topic: "Stale completed debate",
        status: "Active",
        totalRounds: 1,
        turns: [{
          id: "final-turn",
          author: "Me",
          authorId: "me",
          side: "Aff",
          summary: "Final speech",
          status: "submitted",
        }],
      }),
    ];

    renderPage();

    expect(screen.queryByText("Stale completed debate")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /^completed$/i }));
    expect(screen.getByText("Stale completed debate")).toBeInTheDocument();
    expect(service.finalizeDebateIfComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "stale-complete" }),
    );
  });

  it("labels the comment entry differently for active vs completed debates", () => {
    mocks.collections.debates = [
      baseDebate({
        id: "active-pub",
        topic: "Active public",
        status: "Active",
        participantIds: ["a", "b"],
      }),
    ];

    renderPage();
    // Exact match avoids the empty-state "Spectate Debates" button.
    fireEvent.click(screen.getByRole("tab", { name: "Spectate" }));
    fireEvent.click(screen.getByRole("button", { name: /toggle comments/i }));
    expect(screen.getByLabelText(/add a spectator comment/i)).toBeInTheDocument();
  });

  it("lets anyone comment on completed debates and hides entry when comments are off", () => {
    mocks.collections.debates = [
      baseDebate({
        id: "done-on",
        topic: "Completed with comments",
        status: "Completed",
        winner: "Aff",
        participantIds: ["a", "b"],
        commentsEnabled: true,
      }),
      baseDebate({
        id: "done-off",
        topic: "Completed no comments",
        status: "Completed",
        winner: "Neg",
        participantIds: ["a", "b"],
        commentsEnabled: false,
      }),
    ];

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /^completed$/i }));

    // Comments-off debate exposes a disabled indicator, not a toggle.
    expect(screen.getByText(/comments off/i)).toBeInTheDocument();

    // Comments-on completed debate lets anyone add a comment.
    fireEvent.click(screen.getByRole("button", { name: /toggle comments/i }));
    expect(screen.getByLabelText(/^add a comment$/i)).toBeInTheDocument();
  });

  it("sorts comments newest first", () => {
    mocks.collections.debates = [
      baseDebate({
        id: "sorted",
        topic: "Sorted debate",
        status: "Completed",
        winner: "Aff",
        participantIds: ["a", "b"],
        commentsEnabled: true,
      }),
    ];
    mocks.collections.debateComments = [
      {
        id: "c-old",
        debateId: "sorted",
        authorId: "x",
        authorName: "Older",
        content: "First comment",
        createdAt: "2026-04-01T00:00:00.000Z",
      } satisfies DebateComment,
      {
        id: "c-new",
        debateId: "sorted",
        authorId: "y",
        authorName: "Newer",
        content: "Second comment",
        createdAt: "2026-04-05T00:00:00.000Z",
      } satisfies DebateComment,
    ];

    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /^completed$/i }));
    fireEvent.click(screen.getByRole("button", { name: /toggle comments/i }));

    const rendered = screen.getAllByText(/comment$/i).map((node) => node.textContent);
    expect(rendered.indexOf("Second comment")).toBeLessThan(
      rendered.indexOf("First comment"),
    );
  });
});
