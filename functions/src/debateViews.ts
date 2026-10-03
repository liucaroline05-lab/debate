import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

interface DebateViewData {
  status?: unknown;
  visibility?: unknown;
  participantIds?: unknown;
  affirmative?: unknown;
  negative?: unknown;
  spectators?: unknown;
  liveSpectators?: unknown;
  viewCount?: unknown;
}

interface ViewSessionData {
  active?: unknown;
  sequence?: unknown;
}

const participantUserId = (value: unknown) => {
  if (!value || typeof value !== "object") return "";
  const userId = (value as { userId?: unknown }).userId;
  return typeof userId === "string" ? userId : "";
};

const toCount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/**
 * Counts each public debate page visit once, while maintaining an active
 * spectator count for debates that are still running. Sequence numbers make
 * quick enter/leave transitions (including React StrictMode remounts) safe
 * when callable requests arrive out of order.
 */
export const recordDebateView = onCall(
  { region: "us-central1" },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) throw new HttpsError("unauthenticated", "Sign in to view debates.");

    const debateId = request.data?.debateId;
    const viewId = request.data?.viewId;
    const action = request.data?.action;
    const sequence = request.data?.sequence;
    if (typeof debateId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(debateId)) {
      throw new HttpsError("invalid-argument", "A valid debate ID is required.");
    }
    if (typeof viewId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(viewId)) {
      throw new HttpsError("invalid-argument", "A valid debate view ID is required.");
    }
    if (action !== "enter" && action !== "leave") {
      throw new HttpsError("invalid-argument", "A valid debate view action is required.");
    }
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
      throw new HttpsError("invalid-argument", "A valid debate view sequence is required.");
    }

    const db = getFirestore();
    const debateRef = db.doc(`debates/${debateId}`);
    const viewRef = db.doc(`debateViewSessions/${userId}-${debateId}-${viewId}`);

    return db.runTransaction(async (transaction) => {
      const viewSnapshot = await transaction.get(viewRef);
      const debateSnapshot = await transaction.get(debateRef);
      if (!debateSnapshot.exists) {
        throw new HttpsError("not-found", "This debate is no longer available.");
      }

      const debate = debateSnapshot.data() as DebateViewData;
      const liveSpectators = toCount(debate.liveSpectators);
      const viewCount = toCount(
        typeof debate.viewCount === "number" ? debate.viewCount : debate.spectators,
      );
      const participantIds = Array.isArray(debate.participantIds)
        ? debate.participantIds.filter((id): id is string => typeof id === "string")
        : [];
      const isParticipant = participantIds.includes(userId)
        || participantUserId(debate.affirmative) === userId
        || participantUserId(debate.negative) === userId;
      const isPublic = debate.visibility === "public";
      const shouldBeLive = action === "enter"
        && debate.status === "Active"
        && isPublic
        && !isParticipant;

      if (!viewSnapshot.exists) {
        if (!isPublic) return { counted: false, liveSpectators, viewCount };

        const nextViewCount = viewCount + 1;
        const nextLiveSpectators = liveSpectators + (shouldBeLive ? 1 : 0);
        transaction.create(viewRef, {
          debateId,
          viewedBy: userId,
          viewedAt: new Date().toISOString(),
          active: shouldBeLive,
          sequence,
          updatedAt: new Date().toISOString(),
        });
        // Keep spectators as a cumulative legacy alias for older clients.
        transaction.update(debateRef, {
          viewCount: nextViewCount,
          spectators: nextViewCount,
          liveSpectators: nextLiveSpectators,
        });
        return { counted: true, liveSpectators: nextLiveSpectators, viewCount: nextViewCount };
      }

      const session = viewSnapshot.data() as ViewSessionData;
      const previousSequence = toCount(session.sequence);
      if (sequence <= previousSequence) {
        return { counted: false, liveSpectators, viewCount };
      }

      const wasLive = session.active === true;
      const nextLiveSpectators = Math.max(
        0,
        liveSpectators + (shouldBeLive ? 1 : 0) - (wasLive ? 1 : 0),
      );
      transaction.update(viewRef, {
        active: shouldBeLive,
        sequence,
        updatedAt: new Date().toISOString(),
      });
      if (nextLiveSpectators !== liveSpectators) {
        transaction.update(debateRef, { liveSpectators: nextLiveSpectators });
      }
      return { counted: false, liveSpectators: nextLiveSpectators, viewCount };
    });
  },
);
