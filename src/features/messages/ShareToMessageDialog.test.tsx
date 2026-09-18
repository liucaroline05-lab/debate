import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareToMessageDialog } from "@/features/messages/ShareToMessageDialog";
import type { ChatThread, UserProfile } from "@/types/models";

const service = vi.hoisted(() => ({
  sendChatMessage: vi.fn(async () => {}),
  startDirectThread: vi.fn(async () => "dm-maya--noah"),
  subscribeToThreads: vi.fn(
    (_userId: string, onThreads: (threads: ChatThread[]) => void) => {
      onThreads(mocks.threads);
      return () => {};
    },
  ),
}));

vi.mock("@/features/messages/messageService", () => service);

const mocks = vi.hoisted(() => ({
  threads: [] as ChatThread[],
}));

const currentUser = {
  id: "maya",
  displayName: "Maya Rivera",
  role: "student",
} as UserProfile;

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ currentUser, authReady: true, isDemoMode: false }),
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: () => ({
    data: [
      currentUser,
      { id: "james", displayName: "James Kim", role: "student" },
      { id: "noah", displayName: "Noah Diaz", role: "student" },
    ],
    isLoading: false,
    error: null,
  }),
}));

const groupThread: ChatThread = {
  id: "group-1",
  type: "group",
  name: "Nationals prep",
  createdBy: "maya",
  participantIds: ["maya", "james"],
  memberCount: 2,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const renderDialog = () =>
  render(
    <MemoryRouter>
      <ShareToMessageDialog
        title="How do you weigh probability?"
        url="https://example.com/app/community#post-1"
        onClose={vi.fn()}
      />
    </MemoryRouter>,
  );

describe("ShareToMessageDialog", () => {
  beforeEach(() => {
    mocks.threads = [groupThread];
    Object.values(service).forEach((fn) => fn.mockClear());
    service.startDirectThread.mockResolvedValue("dm-maya--noah");
  });

  it("sends the link to an existing conversation", async () => {
    const user = userEvent.setup();
    renderDialog();

    const row = screen.getByText("Nationals prep").closest(".share-target-row");
    await user.click(row!.querySelector("button")!);

    expect(service.startDirectThread).not.toHaveBeenCalled();
    expect(service.sendChatMessage).toHaveBeenCalledWith(
      groupThread,
      currentUser,
      "How do you weigh probability? — https://example.com/app/community#post-1",
    );
  });

  it("includes the note the sender typed", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByRole("textbox", { name: /Add a note/ }),
      "Useful framing here",
    );
    const row = screen.getByText("Nationals prep").closest(".share-target-row");
    await user.click(row!.querySelector("button")!);

    expect(service.sendChatMessage).toHaveBeenCalledWith(
      groupThread,
      currentUser,
      "Useful framing here\n\nHow do you weigh probability? — https://example.com/app/community#post-1",
    );
  });

  it("opens a direct thread first for someone not yet messaged", async () => {
    const user = userEvent.setup();
    renderDialog();

    const row = screen.getByText("Noah Diaz").closest(".share-target-row");
    await user.click(row!.querySelector("button")!);

    expect(service.startDirectThread).toHaveBeenCalledWith(
      currentUser,
      expect.objectContaining({ id: "noah" }),
    );
    expect(service.sendChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "dm-maya--noah",
        participantIds: ["maya", "noah"],
      }),
      currentUser,
      expect.stringContaining("https://example.com/app/community#post-1"),
    );
  });

  it("grants selected recipients access before sending a private link", async () => {
    const user = userEvent.setup();
    const grant = vi.fn(async () => {});
    render(
      <MemoryRouter>
        <ShareToMessageDialog
          title="Private speech"
          url="https://example.com/app/speeches/speech-1"
          allowCopyLink={false}
          onBeforeSend={grant}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
    const row = screen.getByText("Nationals prep").closest(".share-target-row");
    await user.click(row!.querySelector("button")!);

    expect(grant).toHaveBeenCalledWith(["james"]);
    expect(service.sendChatMessage).toHaveBeenCalled();
    expect(grant.mock.invocationCallOrder[0]).toBeLessThan(
      service.sendChatMessage.mock.invocationCallOrder[0],
    );
  });
});
