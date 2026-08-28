import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { MessagesPage } from "@/pages/app/MessagesPage";
import type { ChatMessage, ChatThread, UserProfile } from "@/types/models";

const mocks = vi.hoisted(() => ({
  sendChatMessage: vi.fn(),
  startDirectThread: vi.fn(),
  startGroupThread: vi.fn(),
}));

const preferences = {
  notifications: {
    speechFeedback: true,
    debateTurnReminders: true,
    communityReplies: true,
    tournamentReminders: true,
  },
  debateDefaults: {
    preferredFormat: "Public Forum" as const,
    preferredSide: "Either" as const,
    asyncResponseCadence: "24 hours" as const,
  },
  messaging: { whoCanMessage: "everyone" as const },
};

const currentUser: UserProfile = {
  id: "maya",
  displayName: "Maya Rivera",
  email: "maya@example.com",
  role: "student",
  bio: "",
  focusAreas: [],
  organizationTags: ["Mountain View Debate"],
  recommendationSlots: [],
  preferences,
  createdAt: "2026-08-01T10:00:00.000Z",
};

const james: UserProfile = {
  ...currentUser,
  id: "james",
  displayName: "James Kim",
  email: "james@example.com",
  organizationTags: ["Bay Area Policy"],
};

const mia: UserProfile = {
  ...currentUser,
  id: "mia",
  displayName: "Mia Thompson",
  email: "mia@example.com",
  organizationTags: ["LD Prep West Coast"],
};

const thread: ChatThread = {
  id: "dm-james--maya",
  type: "direct",
  createdBy: "maya",
  participantIds: ["james", "maya"],
  memberCount: 2,
  createdAt: "2026-08-27T10:00:00.000Z",
  updatedAt: "2026-08-27T10:05:00.000Z",
  lastMessageAt: "2026-08-27T10:05:00.000Z",
  lastMessageText: "Want to compare cases?",
};

const message: ChatMessage = {
  id: "message-1",
  threadId: thread.id,
  authorId: "james",
  authorName: "James Kim",
  content: "Want to compare cases?",
  createdAt: "2026-08-27T10:05:00.000Z",
};

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ currentUser, authReady: true, isDemoMode: false }),
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: () => ({ data: [currentUser, james, mia], isLoading: false, error: null }),
}));

vi.mock("@/features/messages/messageService", () => ({
  subscribeToThreads: (_userId: string, onThreads: (threads: ChatThread[]) => void) => {
    onThreads([thread]);
    return () => {};
  },
  subscribeToMessages: (_threadId: string, onMessages: (messages: ChatMessage[]) => void) => {
    onMessages([message]);
    return () => {};
  },
  sendChatMessage: mocks.sendChatMessage,
  startDirectThread: mocks.startDirectThread,
  startGroupThread: mocks.startGroupThread,
}));

describe("MessagesPage", () => {
  beforeEach(() => {
    mocks.sendChatMessage.mockReset().mockResolvedValue(undefined);
    mocks.startDirectThread.mockReset().mockResolvedValue(thread.id);
    mocks.startGroupThread.mockReset().mockResolvedValue("group-1");
  });

  it("shows a private conversation and sends a message", async () => {
    const user = userEvent.setup();
    render(<MessagesPage />);

    expect(screen.getByRole("heading", { name: "James Kim" })).toBeInTheDocument();
    expect(screen.getAllByText("Want to compare cases?")).toHaveLength(2);

    await user.type(screen.getByRole("textbox", { name: "Message James Kim" }), "I’m in!");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(mocks.sendChatMessage).toHaveBeenCalledWith(thread.id, currentUser, "I’m in!");
  });

  it("starts a new direct message from the people picker", async () => {
    const user = userEvent.setup();
    render(<MessagesPage />);

    await user.click(screen.getByRole("button", { name: "New message" }));
    const picker = screen.getByRole("region", { name: "Start a conversation" });
    await user.click(within(picker).getByRole("button", { name: /James Kim/ }));
    await user.click(screen.getByRole("button", { name: "Start conversation" }));

    expect(mocks.startDirectThread).toHaveBeenCalledWith(currentUser, james);
  });

  it("creates a named group chat with multiple people", async () => {
    const user = userEvent.setup();
    render(<MessagesPage />);

    await user.click(screen.getByRole("button", { name: "New message" }));
    const picker = screen.getByRole("region", { name: "Start a conversation" });
    await user.click(within(picker).getByRole("button", { name: /Group chat/ }));
    await user.type(within(picker).getByRole("textbox", { name: "Group name" }), "Nationals prep");
    await user.click(within(picker).getByRole("button", { name: /James Kim/ }));
    await user.click(within(picker).getByRole("button", { name: /Mia Thompson/ }));
    await user.click(within(picker).getByRole("button", { name: "Start conversation" }));

    expect(mocks.startGroupThread).toHaveBeenCalledWith(currentUser, "Nationals prep", [james, mia]);
  });
});
