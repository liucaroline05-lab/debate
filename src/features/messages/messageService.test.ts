import { describe, expect, it, vi } from "vitest";
import { canStartConversation, sendChatMessage, subscribeToMessages } from "@/features/messages/messageService";
import type { UserProfile } from "@/types/models";

const mocks = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
  error: null as { code: string; message: string } | null,
  blocks: new Set<string>(),
  blockLookupDenied: false,
}));

vi.mock("@/lib/firebase", () => ({ firestore: {} }));

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  doc: (_db: unknown, _collection: string, id: string) => ({ id }),
  getDoc: async (reference: { id: string }) => {
    if (mocks.blockLookupDenied) throw { code: "permission-denied" };
    return { exists: () => mocks.blocks.has(reference.id) };
  },
  onSnapshot: (
    _query: unknown,
    onNext: (snapshot: { docs: typeof mocks.docs }) => void,
    onError: (error: { code: string; message: string }) => void,
  ) => {
    if (mocks.error) {
      onError(mocks.error);
    } else {
      onNext({ docs: mocks.docs });
    }
    return () => {};
  },
}));

const doc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
});

describe("blocked direct messages", () => {
  const recipient = { id: "recipient", displayName: "Recipient", preferences: { messaging: { whoCanMessage: "everyone" } } } as UserProfile;

  it("does not start or send a direct message between blocked accounts", async () => {
    mocks.blocks.add("recipient-sender");
    expect(await canStartConversation("sender", recipient)).toBe(false);
    await expect(sendChatMessage(
      { id: "dm-1", type: "direct", participantIds: ["sender", "recipient"], memberCount: 2, createdBy: "sender", createdAt: "", updatedAt: "" },
      { id: "sender", displayName: "Sender" } as UserProfile,
      "Hello",
    )).rejects.toThrow("Messages are unavailable");
    mocks.blocks.clear();
  });

  it("keeps DMs working while older rules do not expose the new block collection", async () => {
    mocks.blockLookupDenied = true;
    expect(await canStartConversation("sender", recipient)).toBe(true);
    mocks.blockLookupDenied = false;
  });
});

describe("subscribeToMessages", () => {
  it("still delivers messages when a document is missing createdAt", () => {
    // A throw in the snapshot handler is not routed to the error callback, so
    // this used to leave the chat pane blank with nothing reported at all.
    mocks.error = null;
    mocks.docs = [
      doc("b", { threadId: "t1", authorId: "x", content: "second", createdAt: "2026-09-10T20:30:00.000Z" }),
      doc("a", { threadId: "t1", authorId: "x", content: "no timestamp" }),
    ];

    const onMessages = vi.fn();
    const onError = vi.fn();
    subscribeToMessages("t1", onMessages, onError);

    expect(onError).not.toHaveBeenCalled();
    expect(onMessages).toHaveBeenCalledTimes(1);
    const delivered = onMessages.mock.calls[0][0];
    expect(delivered).toHaveLength(2);
    expect(delivered.map((message: { content: string }) => message.content)).toEqual([
      "no timestamp",
      "second",
    ]);
  });

  it("fills in defaults for fields a document does not carry", () => {
    mocks.error = null;
    mocks.docs = [doc("a", { content: "hi", createdAt: "2026-09-10T20:30:00.000Z" })];

    const onMessages = vi.fn();
    subscribeToMessages("t1", onMessages, vi.fn());

    expect(onMessages.mock.calls[0][0][0]).toMatchObject({
      id: "a",
      threadId: "t1",
      participantIds: [],
      authorName: "Unknown",
    });
  });

  it("explains a permission failure instead of showing an empty conversation", () => {
    mocks.error = { code: "permission-denied", message: "Missing or insufficient permissions." };

    const onMessages = vi.fn();
    const onError = vi.fn();
    subscribeToMessages("t1", onMessages, onError);

    expect(onMessages).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining("do not have permission"),
    );
  });
});
