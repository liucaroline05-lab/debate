import { randomUUID } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

type VoteSide = "Aff" | "Neg";

interface DebateVoteData {
  status?: unknown;
  visibility?: unknown;
  participantIds?: unknown;
  affirmative?: unknown;
  negative?: unknown;
  communityVoteCounts?: {
    aff?: unknown;
    neg?: unknown;
  };
}

const participantUserId = (value: unknown) => {
  if (!value || typeof value !== "object") return "";
  const userId = (value as { userId?: unknown }).userId;
  return typeof userId === "string" ? userId : "";
};

const toCount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

export const castDebateWinnerVote = onCall(
  { region: "us-central1" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) throw new HttpsError("unauthenticated", "Sign in to vote on this debate.");

    const debateId = request.data?.debateId;
    const requestedUserId = request.data?.userId;
    const side = request.data?.side;
    const reason = typeof request.data?.reason === "string" ? request.data.reason.trim() : "";
    if (typeof debateId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(debateId)) {
      throw new HttpsError("invalid-argument", "A valid debate ID is required.");
    }
    if (requestedUserId !== userId) {
      throw new HttpsError("permission-denied", "The signed-in user does not match this vote.");
    }
    if (side !== "Aff" && side !== "Neg") {
      throw new HttpsError("invalid-argument", "Choose Affirmative or Negative.");
    }
    if (reason.length < 8 || reason.length > 1000) {
      throw new HttpsError("invalid-argument", "Add a reason between 8 and 1,000 characters.");
    }

    const db = getFirestore();
    const debateRef = db.doc(`debates/${debateId}`);
    const voteRef = db.doc(`debateWinnerVotes/${debateId}-${userId}`);

    await db.runTransaction(async (transaction) => {
      const debateSnapshot = await transaction.get(debateRef);
      const voteSnapshot = await transaction.get(voteRef);
      if (!debateSnapshot.exists) throw new HttpsError("not-found", "This debate is no longer available.");

      const debate = debateSnapshot.data() as DebateVoteData;
      const participantIds = Array.isArray(debate.participantIds)
        ? debate.participantIds.filter((id): id is string => typeof id === "string")
        : [];
      const isParticipant = participantIds.includes(userId)
        || participantUserId(debate.affirmative) === userId
        || participantUserId(debate.negative) === userId;
      if (debate.status !== "Completed" || debate.visibility !== "public" || isParticipant) {
        throw new HttpsError("permission-denied", "Only spectators can vote on completed public debates.");
      }

      const previousVote = voteSnapshot.data();
      const previousSide = previousVote?.side === "Aff" || previousVote?.side === "Neg"
        ? previousVote.side as VoteSide
        : undefined;
      const feedbackId = typeof previousVote?.feedbackId === "string"
        ? previousVote.feedbackId
        : randomUUID();
      const feedbackRef = db.doc(`debateWinnerVoteFeedback/${feedbackId}`);
      const currentCounts = debate.communityVoteCounts ?? {};
      const nextCounts = {
        aff: Math.max(0, toCount(currentCounts.aff) + Number(side === "Aff") - Number(previousSide === "Aff")),
        neg: Math.max(0, toCount(currentCounts.neg) + Number(side === "Neg") - Number(previousSide === "Neg")),
      };
      const now = new Date().toISOString();

      transaction.set(voteRef, {
        debateId,
        userId,
        side,
        reason,
        feedbackId,
        createdAt: previousVote?.createdAt ?? now,
        updatedAt: now,
      });
      transaction.set(feedbackRef, {
        debateId,
        side,
        reason,
        createdAt: previousVote?.createdAt ?? now,
        updatedAt: now,
      });
      transaction.update(debateRef, {
        communityVoteCounts: nextCounts,
        updatedAt: now,
      });
    });

    return { saved: true };
  },
);
