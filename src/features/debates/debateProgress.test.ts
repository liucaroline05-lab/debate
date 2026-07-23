import { describe, expect, it } from "vitest";
import { getDebateTurnProgress } from "@/features/debates/debateProgress";

describe("getDebateTurnProgress", () => {
  it("completes a debate when its final configured speech is submitted", () => {
    expect(getDebateTurnProgress(5, 5)).toEqual({
      isCompleted: true,
      currentRound: 5,
    });
  });

  it("advances one speech at a time before the final turn", () => {
    expect(getDebateTurnProgress(4, 5)).toEqual({
      isCompleted: false,
      currentRound: 5,
    });
  });
});
