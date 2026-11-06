import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

interface DebateSeat {
  userId?: unknown;
  name?: unknown;
}

const readInviteCode = (value: unknown) => {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{4,16}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Enter a valid invite code.");
  }
  return code;
};

const readSeatName = async (uid: string) => {
  const profile = await getFirestore().doc(`users/${uid}`).get();
  const displayName = profile.data()?.displayName;
  return typeof displayName === "string" && displayName.trim()
    ? displayName.trim()
    : "DebateSpace Member";
};

/**
 * Private debates are readable only by their participants, so someone holding
 * an invite code can't look the debate up themselves. Seats are assigned in a
 * transaction, so two people using one code can't both get in.
 */
export const joinDebateByInviteCode = onCall({ region: "us-central1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to join this debate.");
  const code = readInviteCode(request.data?.inviteCode);

  const db = getFirestore();
  const matches = await db.collection("debates").where("inviteCode", "==", code).limit(1).get();
  const debateRef = matches.docs[0]?.ref;
  if (!debateRef) throw new HttpsError("not-found", "No debate found for that invite code.");
  const name = await readSeatName(uid);

  const participantIds = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(debateRef);
    const debate = snapshot.data();
    if (!debate) throw new HttpsError("not-found", "No debate found for that invite code.");

    const current = Array.isArray(debate.participantIds) ? debate.participantIds as string[] : [];
    if (current.includes(uid)) {
      throw new HttpsError("already-exists", "You are already a participant in this debate.");
    }
    if (debate.status !== "Awaiting Opponent") {
      throw new HttpsError("failed-precondition", "This debate has already started.");
    }

    const affirmativeSeat = debate.affirmative as DebateSeat | undefined;
    const negativeSeat = debate.negative as DebateSeat | undefined;
    const openSide = affirmativeSeat?.userId ? "Neg" : "Aff";
    const affirmative = openSide === "Aff" ? { ...affirmativeSeat, name, userId: uid } : affirmativeSeat;
    const negative = openSide === "Neg" ? { ...negativeSeat, name, userId: uid } : negativeSeat;
    const next = [...current, uid];
    transaction.update(debateRef, {
      affirmative,
      negative,
      participantIds: next,
      status: "Active",
      // Affirmative speaks first.
      currentTurnUserId: affirmative?.userId ?? null,
      updatedAt: new Date().toISOString(),
    });
    return next;
  });

  // Anything written while the creator was waiting should be visible to the
  // new participant too. These lists copy the debate's participants.
  const [messages, comments] = await Promise.all([
    db.collection("debateMessages").where("debateId", "==", debateRef.id).get(),
    db.collection("debateComments").where("debateId", "==", debateRef.id).get(),
  ]);
  const earlierWrites = [...messages.docs, ...comments.docs];
  for (let offset = 0; offset < earlierWrites.length; offset += 400) {
    const batch = db.batch();
    earlierWrites.slice(offset, offset + 400).forEach((entry) => batch.update(entry.ref, { participantIds }));
    await batch.commit();
  }

  return { debateId: debateRef.id };
});

/**
 * Memberships are readable by other members, so the code can't be stored on
 * one as proof of being invited. The function checks it and writes the
 * membership instead.
 */
export const joinChannelByInviteCode = onCall({ region: "us-central1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to join this channel.");
  const code = readInviteCode(request.data?.inviteCode);
  const expectedChannelId = typeof request.data?.channelId === "string" ? request.data.channelId : "";

  const db = getFirestore();
  const invitation = await db.doc(`channelInvites/${code}`).get();
  const invitedChannelId = invitation.data()?.channelId;
  // Channels made before codes moved to channelInvites still hold their own.
  const legacyChannel = typeof invitedChannelId === "string"
    ? null
    : (await db.collection("channels").where("inviteCode", "==", code).limit(1).get()).docs[0];
  const channelId = typeof invitedChannelId === "string" ? invitedChannelId : legacyChannel?.id;
  if (!channelId || (expectedChannelId && expectedChannelId !== channelId)) {
    throw new HttpsError("not-found", "No private community uses that invite code.");
  }

  const channel = await db.doc(`channels/${channelId}`).get();
  if (!channel.exists) throw new HttpsError("not-found", "That channel could not be found.");

  const membershipRef = db.doc(`channelMemberships/${channelId}-${uid}`);
  const membership = await membershipRef.get();
  if (!membership.exists) {
    await membershipRef.set({
      channelId,
      userId: uid,
      role: "Member",
      lastActiveAt: new Date().toISOString(),
    });
  }
  const name = channel.data()?.name;
  return { channelId, channelName: typeof name === "string" ? name : "channel" };
});
