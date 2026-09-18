import { describe, expect, it } from "vitest";
import { canClaimSpeechSummary, STALE_PROCESSING_MS } from "../../../functions/src/speechAiClaim";

const now = Date.parse("2026-09-17T20:00:00.000Z");

describe("speech summary claim", () => {
  it("claims an upload that was initialized as processing without an event ID", () => {
    expect(canClaimSpeechSummary({ summaryStatus: "processing" }, "storage-event", false, now)).toBe(true);
  });

  it("does not run a second job while another event is active", () => {
    const speech = {
      summaryStatus: "processing",
      summaryProcessingEventId: "first-event",
      uploadedAt: new Date(now - 60_000).toISOString(),
    };
    expect(canClaimSpeechSummary(speech, "second-event", false, now)).toBe(false);
    expect(canClaimSpeechSummary(speech, "first-event", false, now)).toBe(true);
    expect(canClaimSpeechSummary(speech, "manual-retry", true, now)).toBe(false);
  });

  it("allows a manual retry to take over a stale job but never a completed one", () => {
    const stale = {
      summaryStatus: "processing",
      summaryProcessingEventId: "lost-event",
      uploadedAt: new Date(now - STALE_PROCESSING_MS - 1).toISOString(),
    };
    expect(canClaimSpeechSummary(stale, "manual-retry", true, now)).toBe(true);
    expect(canClaimSpeechSummary(stale, "new-storage-event", false, now)).toBe(false);
    expect(canClaimSpeechSummary({ summaryStatus: "completed" }, "manual-retry", true, now)).toBe(false);
  });
});
