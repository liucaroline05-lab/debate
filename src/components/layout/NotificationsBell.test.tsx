import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsBell } from "@/components/layout/NotificationsBell";
import type { ChatMessage, DebateThread, UserBlock } from "@/types/models";

const collectionState = vi.hoisted(() => ({
  messages: [] as ChatMessage[],
  debates: [] as DebateThread[],
  blocks: [] as UserBlock[],
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: (collectionName: string) => ({
    data: collectionName === "chatMessages"
      ? collectionState.messages
      : collectionName === "debates"
        ? collectionState.debates
        : collectionName === "userBlocks"
          ? collectionState.blocks
          : [],
    isLoading: false,
    error: null,
  }),
}));

const recentAt = new Date(Date.now() - 60_000).toISOString();
const incomingMessage: ChatMessage = {
  id: "message-1",
  threadId: "thread-1",
  participantIds: ["partner", "current-user"],
  authorId: "partner",
  authorName: "Partner",
  content: "Ready to debate?",
  createdAt: recentAt,
};

describe("NotificationsBell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    collectionState.messages = [incomingMessage];
    collectionState.debates = [];
    collectionState.blocks = [];
  });

  it("keeps unread items visible on open, then retains them as read", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationsBell userId="current-user" />
      </MemoryRouter>,
    );

    const bell = screen.getByRole("button", { name: "Notifications, 1 unread" });
    expect(within(bell).getByText("1")).toBeInTheDocument();

    await user.click(bell);

    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
    expect(within(panel).getByText("1 total")).toBeInTheDocument();
    expect(within(panel).getByText("Ready to debate?")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Unread")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /New message/ })).toHaveAttribute(
      "href",
      "/app/messages?thread=thread-1",
    );

    await user.click(within(panel).getByRole("button", { name: "Mark all as read" }));
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(within(panel).getByText("Ready to debate?")).toBeInTheDocument();
    expect(within(panel).queryByLabelText("Unread")).not.toBeInTheDocument();
  });

  it("shows an already-seen message without restoring the unread badge", async () => {
    window.localStorage.setItem(
      "debate-studio:notifications-seen:current-user",
      new Date().toISOString(),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationsBell userId="current-user" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(screen.getByText("Ready to debate?")).toBeInTheDocument();
    expect(screen.getByText("1 total")).toBeInTheDocument();
  });

  it("does not show notifications from accounts the viewer blocked", async () => {
    collectionState.blocks = [{ id: "current-user-partner", blockerId: "current-user", blockedId: "partner", createdAt: recentAt }];
    render(<MemoryRouter><NotificationsBell userId="current-user" /></MemoryRouter>);

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.queryByText("Ready to debate?")).not.toBeInTheDocument();
    expect(screen.getByText("0 total")).toBeInTheDocument();
  });

  it("shows all notifications within the chosen history and puts unread ones first", async () => {
    const oldAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const readAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const readMessage = { ...incomingMessage, id: "read-message", createdAt: readAt, content: "Already read" };
    collectionState.messages = [
      readMessage,
      ...Array.from({ length: 11 }, (_, index) => ({
        ...incomingMessage,
        id: `recent-${index}`,
        content: `Recent ${index}`,
      })),
      { ...incomingMessage, id: "old-message", createdAt: oldAt, content: "Too old" },
    ];
    window.localStorage.setItem(
      "debate-studio:notifications-read:current-user",
      JSON.stringify({ "message-read-message": readAt }),
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationsBell userId="current-user" historyDays={7} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Notifications, 11 unread" }));

    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByText("12 total")).toBeInTheDocument();
    expect(within(panel).queryByText("Too old")).not.toBeInTheDocument();
    const items = within(panel).getAllByRole("link", { name: /New message/ });
    expect(items).toHaveLength(12);
    expect(items.at(-1)).toHaveTextContent("Already read");
  });

  it("keeps a past debate-turn notification after the debate is completed", async () => {
    collectionState.messages = [];
    collectionState.debates = [{
      id: "debate-1",
      topic: "Resolved: Debate history matters",
      format: "Public Forum",
      status: "Completed",
      nextDeadline: recentAt,
      affirmative: { name: "Partner", side: "Aff", label: "Affirmative", userId: "partner" },
      negative: { name: "Me", side: "Neg", label: "Negative", userId: "current-user" },
      currentRound: 2,
      totalRounds: 3,
      spectators: 0,
      participantIds: ["partner", "current-user"],
      turns: [{
        id: "turn-1",
        author: "Partner",
        authorId: "partner",
        side: "Aff",
        submittedAt: recentAt,
        summary: "Opening speech",
        status: "submitted",
      }],
    }];

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationsBell userId="current-user" />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));

    expect(screen.getByRole("link", { name: /Your debate turn/ })).toHaveAttribute(
      "href",
      "/app/debates/debate-1",
    );
  });
});
