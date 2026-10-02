import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

interface DebateViewData {
  status?: unknown;
  visibility?: unknown;
  participantIds?: unknown;
  affirmative?: unknown;
  negative?: unknown;
  spectators?: unknown;
}

const participantUserId = (value: unknown) => {
  if (!value || typeof value !== "object") return "";
  const userId = (value as { userId?: unknown }).userId;
  return typeof userId === "string" ? userId : "";
};

const toCount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/** Records one idempotent view of a public debate by a non-participant. */
export const recordDebateView = onCall(
  { region: "us-central1" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) throw new HttpsError("unauthenticated", "Sign in to spectate debates.");

    const debateId = request.data?.debateId;
    const viewId = request.data?.viewId;
    if (typeof debateId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(debateId)) {
      throw new HttpsError("invalid-argument", "A valid debate ID is required.");
    }
    if (typeof viewId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(viewId)) {
      throw new HttpsError("invalid-argument", "A valid debate view ID is required.");
    }

    const db = getFirestore();
    const debateRef = db.doc(`debates/${debateId}`);
    const viewRef = db.doc(`debateViewEvents/${userId}-${debateId}-${viewId}`);

    return db.runTransaction(async (transaction) => {
      const viewSnapshot = await transaction.get(viewRef);
      const debateSnapshot = await transaction.get(debateRef);
      if (!debateSnapshot.exists) {
        throw new HttpsError("not-found", "This debate is no longer available.");
      }

      const debate = debateSnapshot.data() as DebateViewData;
      const spectators = toCount(debate.spectators);
      if (viewSnapshot.exists) return { counted: false, spectators };

      const participantIds = Array.isArray(debate.participantIds)
        ? debate.participantIds.filter((id): id is string => typeof id === "string")
        : [];
      const isParticipant = participantIds.includes(userId)
        || participantUserId(debate.affirmative) === userId
        || participantUserId(debate.negative) === userId;
      const canSpectate = debate.status === "Active" || debate.status === "Completed";
      if (!canSpectate || debate.visibility !== "public" || isParticipant) {
        return { counted: false, spectators };
      }

      const nextCount = spectators + 1;
      transaction.create(viewRef, {
        debateId,
        viewedBy: userId,
        viewedAt: new Date().toISOString(),
      });
      transaction.update(debateRef, { spectators: nextCount });
      return { counted: true, spectators: nextCount };
    });
  },
);
