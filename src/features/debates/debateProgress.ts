export const getDebateTurnProgress = (
  submittedTurnCount: number,
  totalTurns: number,
) => {
  const normalizedTotalTurns = Math.max(1, Math.floor(totalTurns));
  const isCompleted = submittedTurnCount >= normalizedTotalTurns;

  return {
    isCompleted,
    currentRound: isCompleted
      ? normalizedTotalTurns
      : Math.min(normalizedTotalTurns, submittedTurnCount + 1),
  };
};
