export const STALE_PROCESSING_MS = 10 * 60 * 1000;

interface SpeechClaimState {
  summaryStatus?: unknown;
  summaryProcessingEventId?: unknown;
  summaryProcessingStartedAt?: unknown;
  uploadedAt?: unknown;
}

export const processingAgeMs = (speech: SpeechClaimState, now = Date.now()) => {
  const startedAt = speech.summaryProcessingStartedAt;
  const timestamp = startedAt && typeof startedAt === "object" && "toMillis" in startedAt
    && typeof startedAt.toMillis === "function"
    ? startedAt.toMillis()
    : new Date(typeof speech.uploadedAt === "string" ? speech.uploadedAt : "").getTime();
  return Number.isFinite(timestamp) ? now - timestamp : 0;
};

export const canClaimSpeechSummary = (
  speech: SpeechClaimState,
  sourceEventId: string,
  allowStaleTakeover = false,
  now = Date.now(),
) => {
  if (speech.summaryStatus === "completed") return false;
  if (speech.summaryStatus !== "processing") return true;

  const activeEventId = typeof speech.summaryProcessingEventId === "string"
    ? speech.summaryProcessingEventId
    : "";
  if (!activeEventId || activeEventId === sourceEventId) return true;
  return allowStaleTakeover && processingAgeMs(speech, now) >= STALE_PROCESSING_MS;
};
