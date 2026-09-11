import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type {
  ChatMessage,
  ChatThread,
  MessagingPermission,
  UserProfile,
} from "@/types/models";

const maxMessageLength = 4_000;
const maxGroupMembers = 20;

const requireFirestore = () => {
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  return firestore;
};

const getMessagingPermission = (profile: UserProfile): MessagingPermission =>
  profile.preferences?.messaging?.whoCanMessage ?? "everyone";

export const directThreadId = (senderId: string, recipientId: string) =>
  `dm-${[senderId, recipientId].sort().join("--")}`;

export const canStartConversation = async (
  senderId: string,
  recipient: UserProfile,
) => {
  if (senderId === recipient.id) return false;

  const permission = getMessagingPermission(recipient);
  if (permission === "everyone") return true;
  if (permission === "nobody") return false;

  const database = requireFirestore();
  const follow = await getDoc(doc(database, "follows", `${recipient.id}-${senderId}`));
  return follow.exists();
};

const sortThreads = (threads: ChatThread[]) =>
  [...threads].sort((left, right) => {
    const leftTime = left.lastMessageAt ?? left.updatedAt ?? left.createdAt ?? "";
    const rightTime = right.lastMessageAt ?? right.updatedAt ?? right.createdAt ?? "";
    return rightTime.localeCompare(leftTime);
  });

export const subscribeToThreads = (
  userId: string,
  onThreads: (threads: ChatThread[]) => void,
  onError: (message: string) => void,
) => {
  const database = requireFirestore();
  const threadsQuery = query(
    collection(database, "chatThreads"),
    where("participantIds", "array-contains", userId),
  );

  return onSnapshot(
    threadsQuery,
    (snapshot) => {
      onThreads(
        sortThreads(
          snapshot.docs.map((thread) => ({ id: thread.id, ...thread.data() }) as ChatThread),
        ),
      );
    },
    (error) => onError(error.message),
  );
};

export const subscribeToMessages = (
  threadId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError: (message: string) => void,
) => {
  const database = requireFirestore();
  const messagesQuery = query(
    collection(database, "chatMessages"),
    where("threadId", "==", threadId),
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const messages = snapshot.docs
        .map((message) => ({ id: message.id, ...message.data() }) as ChatMessage)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      onMessages(messages);
    },
    (error) => onError(error.message),
  );
};

// A direct thread has a deterministic id, but reading it by id would be denied
// (rather than reported as missing) when it does not exist yet, so look it up
// through the same participant query the inbox uses.
const findExistingDirectThread = async (senderId: string, recipientId: string) => {
  const database = requireFirestore();
  const snapshot = await getDocs(
    query(
      collection(database, "chatThreads"),
      where("participantIds", "array-contains", senderId),
    ),
  );

  return (
    snapshot.docs
      .map((thread) => ({ id: thread.id, ...thread.data() }) as ChatThread)
      .find(
        (thread) =>
          thread.type === "direct" &&
          thread.participantIds.length === 2 &&
          thread.participantIds.includes(recipientId),
      ) ?? null
  );
};

export const startDirectThread = async (
  sender: UserProfile,
  recipient: UserProfile,
) => {
  const database = requireFirestore();
  const existingThread = await findExistingDirectThread(sender.id, recipient.id);
  if (existingThread) return existingThread.id;

  if (!(await canStartConversation(sender.id, recipient))) {
    throw new Error(`${recipient.displayName} is not accepting new messages from you.`);
  }

  const participantIds = [sender.id, recipient.id].sort();
  const threadId = directThreadId(sender.id, recipient.id);
  const createdAt = new Date().toISOString();

  await setDoc(doc(database, "chatThreads", threadId), {
    type: "direct",
    createdBy: sender.id,
    participantIds,
    memberCount: 2,
    createdAt,
    updatedAt: createdAt,
  } satisfies Omit<ChatThread, "id">);

  return threadId;
};

export const startGroupThread = async (
  creator: UserProfile,
  name: string,
  recipients: UserProfile[],
) => {
  const database = requireFirestore();
  const trimmedName = name.trim();
  const uniqueRecipients = Array.from(
    new Map(recipients.filter((user) => user.id !== creator.id).map((user) => [user.id, user])).values(),
  );

  if (!trimmedName) throw new Error("Add a group name before creating the chat.");
  if (uniqueRecipients.length < 2) throw new Error("Choose at least two people for a group chat.");
  if (uniqueRecipients.length + 1 > maxGroupMembers) {
    throw new Error(`Group chats can include up to ${maxGroupMembers} people.`);
  }

  const permissionChecks = await Promise.all(
    uniqueRecipients.map(async (recipient) => ({
      recipient,
      allowed: await canStartConversation(creator.id, recipient),
    })),
  );
  const blocked = permissionChecks.filter((result) => !result.allowed);
  if (blocked.length > 0) {
    throw new Error(
      `${blocked.map(({ recipient }) => recipient.displayName).join(", ")} cannot be added because of their messaging settings.`,
    );
  }

  const createdAt = new Date().toISOString();
  const threadRef = await addDoc(collection(database, "chatThreads"), {
    type: "group",
    name: trimmedName.slice(0, 60),
    createdBy: creator.id,
    participantIds: [creator.id],
    memberCount: 1,
    createdAt,
    updatedAt: createdAt,
  } satisfies Omit<ChatThread, "id">);

  for (const [index, recipient] of uniqueRecipients.entries()) {
    await updateDoc(threadRef, {
      participantIds: arrayUnion(recipient.id),
      memberCount: index + 2,
      updatedAt: new Date().toISOString(),
    });
  }

  return threadRef.id;
};

export const sendChatMessage = async (
  thread: ChatThread,
  author: UserProfile,
  content: string,
) => {
  const database = requireFirestore();
  const normalizedContent = content.trim();
  if (!normalizedContent) throw new Error("Write a message before sending.");
  if (normalizedContent.length > maxMessageLength) {
    throw new Error(`Messages must be ${maxMessageLength.toLocaleString()} characters or fewer.`);
  }

  const createdAt = new Date().toISOString();
  // `participantIds` is denormalized onto every message so the read rule can
  // authorize a message from the message itself. Resolving it through the
  // parent thread instead costs one cross-document get() per returned
  // document, which exceeds the 10-access-call budget Firestore allows a
  // single query and makes the whole conversation fail to load.
  await addDoc(collection(database, "chatMessages"), {
    threadId: thread.id,
    participantIds: thread.participantIds,
    authorId: author.id,
    authorName: author.displayName,
    content: normalizedContent,
    createdAt,
  } satisfies Omit<ChatMessage, "id">);

  await updateDoc(doc(database, "chatThreads", thread.id), {
    lastMessageText: normalizedContent.slice(0, 160),
    lastMessageAt: createdAt,
    lastMessageSenderId: author.id,
    updatedAt: createdAt,
  });
};
