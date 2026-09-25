import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { MessagesPage } from "@/pages/app/MessagesPage";
import { normalizeUserProfile } from "@/features/users/defaultProfile";
import type { ChatMessage, ChatThread, UserProfile } from "@/types/models";

const mocks = vi.hoisted(() => ({
  sendChatMessage: vi.fn(),
  sendChatAttachment: vi.fn(),
  editChatMessage: vi.fn(),
  deleteChatMessage: vi.fn(),
  startDirectThread: vi.fn(),
  startGroupThread: vi.fn(),
  extraUsers: [] as unknown[],
  threads: [] as ChatThread[],
  messages: [] as ChatMessage[],
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
  participantIds: thread.participantIds,
  authorId: "james",
  authorName: "James Kim",
  content: "Want to compare cases?",
  createdAt: "2026-08-27T10:05:00.000Z",
};

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ currentUser, authReady: true, isDemoMode: false }),
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: () => ({
    data: [currentUser, james, mia, ...mocks.extraUsers],
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/features/messages/messageService", () => ({
  subscribeToThreads: (_userId: string, onThreads: (threads: ChatThread[]) => void) => {
    onThreads(mocks.threads);
    return () => {};
  },
  subscribeToMessages: (_threadId: string, onMessages: (messages: ChatMessage[]) => void) => {
    onMessages(mocks.messages);
    return () => {};
  },
  sendChatMessage: mocks.sendChatMessage,
  editChatMessage: mocks.editChatMessage,
  deleteChatMessage: mocks.deleteChatMessage,
  startDirectThread: mocks.startDirectThread,
  startGroupThread: mocks.startGroupThread,
}));

vi.mock("@/features/messages/chatAttachmentService", () => ({
  sendChatAttachment: mocks.sendChatAttachment,
  validateChatAttachment: vi.fn(),
}));

const renderMessages = (initialEntry = "/app/messages") => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <MessagesPage />
  </MemoryRouter>,
);

describe("MessagesPage", () => {
  beforeEach(() => {
    mocks.extraUsers = [];
    mocks.threads = [thread];
    mocks.messages = [message];
    mocks.sendChatMessage.mockReset().mockResolvedValue(undefined);
    mocks.sendChatAttachment.mockReset().mockResolvedValue(undefined);
    mocks.editChatMessage.mockReset().mockResolvedValue(undefined);
    mocks.deleteChatMessage.mockReset().mockResolvedValue(undefined);
    mocks.startDirectThread.mockReset().mockResolvedValue(thread.id);
    mocks.startGroupThread.mockReset().mockResolvedValue("group-1");
  });

  it("shows a private conversation and sends a message", async () => {
    const user = userEvent.setup();
    renderMessages();

    expect(screen.getByRole("heading", { name: "James Kim" })).toBeInTheDocument();
    expect(screen.getAllByText("Want to compare cases?")).toHaveLength(2);

    await user.type(screen.getByRole("textbox", { name: "Message James Kim" }), "I’m in!");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(mocks.sendChatMessage).toHaveBeenCalledWith(thread, currentUser, "I’m in!");
  });

  it("sends an attached file through the moderated path", async () => {
    const user = userEvent.setup();
    renderMessages();
    const file = new File(["Practice notes"], "notes.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText("Attach a file"), file);
    expect(screen.getByText(/Attached: notes.txt/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(mocks.sendChatAttachment).toHaveBeenCalledWith(thread.id, file, "");
    expect(mocks.sendChatMessage).not.toHaveBeenCalled();
  });

  it("opens the conversation named in a notification link", async () => {
    mocks.threads = [
      thread,
      { ...thread, id: "dm-mia--maya", participantIds: ["mia", "maya"] },
    ];
    renderMessages("/app/messages?thread=dm-mia--maya");

    expect(await screen.findByRole("heading", { name: "Mia Thompson" })).toBeInTheDocument();
  });

  it("still renders when a user document is missing optional profile fields", async () => {
    // Accounts created before organizationTags/displayName existed used to
    // throw while rendering, which the router showed as "page not found".
    mocks.extraUsers = [{ id: "legacy" }];
    const user = userEvent.setup();
    renderMessages();

    expect(screen.getByRole("heading", { name: /Keep the conversation going/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New message" }));
    const picker = screen.getByRole("region", { name: "Start a conversation" });
    expect(within(picker).getByText("DebateSpace Member")).toBeInTheDocument();
  });

  it("starts a new direct message from the people picker", async () => {
    const user = userEvent.setup();
    renderMessages();

    await user.click(screen.getByRole("button", { name: "New message" }));
    const picker = screen.getByRole("region", { name: "Start a conversation" });
    await user.click(within(picker).getByRole("button", { name: /James Kim/ }));
    await user.click(screen.getByRole("button", { name: "Start conversation" }));

    // The page hands over a normalized profile, so missing optional fields on a
    // raw Firestore document cannot reach the service.
    expect(mocks.startDirectThread).toHaveBeenCalledWith(
      currentUser,
      normalizeUserProfile(james),
    );
  });

  it("creates a named group chat with multiple people", async () => {
    const user = userEvent.setup();
    renderMessages();

    await user.click(screen.getByRole("button", { name: "New message" }));
    const picker = screen.getByRole("region", { name: "Start a conversation" });
    await user.click(within(picker).getByRole("button", { name: /Group chat/ }));
    await user.type(within(picker).getByRole("textbox", { name: "Group name" }), "Nationals prep");
    await user.click(within(picker).getByRole("button", { name: /James Kim/ }));
    await user.click(within(picker).getByRole("button", { name: /Mia Thompson/ }));
    await user.click(within(picker).getByRole("button", { name: "Start conversation" }));

    expect(mocks.startGroupThread).toHaveBeenCalledWith(
      currentUser,
      "Nationals prep",
      [normalizeUserProfile(james), normalizeUserProfile(mia)],
    );
  });

  it("lets the sender edit a plain text message", async () => {
    const ownMessage = { ...message, id: "own-1", authorId: "maya", authorName: "Maya", content: "Original text" };
    mocks.messages = [ownMessage];
    const user = userEvent.setup();
    renderMessages();
    await user.click(await screen.findByRole("button", { name: "Actions for message own-1" }));
    await user.click(screen.getByRole("button", { name: "Edit message" }));
    const field = screen.getByRole("textbox", { name: "Edit message text" });
    await user.clear(field);
    await user.type(field, "Updated text");
    await user.click(screen.getByRole("button", { name: "Save edit" }));
    expect(mocks.editChatMessage).toHaveBeenCalledWith(ownMessage, "maya", "Updated text");
  });

  it("opens message actions upward when the message is near the bottom of the chat", async () => {
    mocks.messages = [{ ...message, id: "own-bottom", authorId: "maya", authorName: "Maya", content: "Hi" }];
    renderMessages();
    const button = await screen.findByRole("button", { name: "Actions for message own-bottom" });
    const scrollRegion = button.closest(".messages-scroll-region");
    expect(scrollRegion).not.toBeNull();
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ top: 500, bottom: 540, left: 800, right: 838 } as DOMRect);
    vi.spyOn(scrollRegion!, "getBoundingClientRect").mockReturnValue({ top: 100, bottom: 600, left: 100, right: 950 } as DOMRect);

    await userEvent.click(button);
    expect(screen.getByRole("button", { name: "Delete message" }).parentElement).toHaveClass("opens-up");
  });

  it("confirms deletion and renders edited and deleted markers", async () => {
    const ownMessage = { ...message, id: "own-2", authorId: "maya", authorName: "Maya", content: "Delete me" };
    mocks.messages = [ownMessage];
    const user = userEvent.setup();
    const view = renderMessages();
    await user.click(await screen.findByRole("button", { name: "Actions for message own-2" }));
    await user.click(screen.getByRole("button", { name: "Delete message" }));
    expect(screen.getByRole("dialog", { name: "Delete message?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete message" }));
    expect(mocks.deleteChatMessage).toHaveBeenCalledWith(ownMessage, "maya");

    view.unmount();
    mocks.messages = [
      { ...ownMessage, id: "edited-1", content: "Revised", editedAt: "2026-09-25T12:00:00.000Z" },
      { ...ownMessage, id: "deleted-1", content: "message deleted", deletedAt: "2026-09-25T12:00:00.000Z" },
    ];
    renderMessages();
    expect(await screen.findByText("edited")).toBeInTheDocument();
    expect(screen.getByText("message deleted")).toHaveClass("is-deleted");
    expect(screen.queryByRole("button", { name: "Actions for message deleted-1" })).not.toBeInTheDocument();
  });
});
