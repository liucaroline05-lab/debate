import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DebateWatchPage } from "@/pages/app/DebateWatchPage";
import type { DebateThread, DebateWinnerVote } from "@/types/models";

const mocks = vi.hoisted(() => ({
  debates: [] as DebateThread[],
  winnerVotes: [] as DebateWinnerVote[],
  currentUser: { id: "viewer", displayName: "Viewer", role: "student" },
}));

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    currentUser: mocks.currentUser,
    authReady: true,
    isDemoMode: false,
  }),
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: (collectionName: string) => ({
    data: collectionName === "debates" ? mocks.debates : mocks.winnerVotes,
    isLoading: false,
    error: null,
  }),
}));

const service = vi.hoisted(() => ({
  voteForDebateWinner: vi.fn(async () => {}),
}));

vi.mock("@/features/debates/debateService", () => service);

const completedDebate = (overrides: Partial<DebateThread> = {}): DebateThread => ({
  id: "complete",
  topic: "Resolved: public transit should be fare-free",
  format: "Public Forum",
  status: "Completed",
  visibility: "public",
  nextDeadline: "2026-07-20T00:00:00.000Z",
  affirmative: { name: "Avery", side: "Aff", label: "Affirmative", userId: "aff" },
  negative: { name: "Noah", side: "Neg", label: "Negative", userId: "neg" },
  currentRound: 2,
  totalRounds: 2,
  spectators: 3,
  participantIds: ["aff", "neg"],
  turns: [
    {
      id: "turn-aff",
      author: "Avery",
      side: "Aff",
      summary: "Affirmative speech submitted.",
      status: "submitted",
      speechUrl: "https://example.com/affirmative.webm",
    },
    {
      id: "turn-neg",
      author: "Noah",
      side: "Neg",
      summary: "Negative speech submitted.",
      status: "submitted",
      speechUrl: "https://example.com/negative.webm",
    },
  ],
  ...overrides,
});

const renderPage = (entry = "/app/debates/complete?view=summary") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/app/debates/:debateId" element={<DebateWatchPage />} />
      </Routes>
    </MemoryRouter>,
  );

const renderSummary = () => renderPage();

beforeEach(() => {
  mocks.debates = [];
  mocks.winnerVotes = [];
  mocks.currentUser = { id: "viewer", displayName: "Viewer", role: "student" };
  service.voteForDebateWinner.mockClear();
});

describe("DebateWatchPage debate view", () => {
  it("keeps the overview cards and renders the completed debate widget below them", () => {
    mocks.debates = [completedDebate()];

    renderPage("/app/debates/complete");

    expect(screen.getByRole("heading", { name: "Matchup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Round summary" })).toBeInTheDocument();

    const debateWidget = screen.getByRole("article", {
      name: "Completed debate round",
    });
    expect(within(debateWidget).getByText("A1")).toBeInTheDocument();
    expect(within(debateWidget).getByText("N1")).toBeInTheDocument();
    expect(within(debateWidget).getAllByText("Submitted")).toHaveLength(2);
    expect(
      within(debateWidget).getByRole("link", {
        name: "Play Affirmative Constructive",
      }),
    ).toHaveAttribute("href", "https://example.com/affirmative.webm");
    expect(
      within(debateWidget).getByRole("link", { name: "View Summary" }),
    ).toHaveAttribute("href", "/app/debates/complete?view=summary");
  });

  it("lets a spectator vote for either speaker and persists one winner choice", async () => {
    mocks.debates = [
      completedDebate({
        communityVoteCounts: { aff: 2, neg: 4 },
      }),
    ];

    renderPage("/app/debates/complete");

    const affirmativeVote = screen.getByRole("button", { name: /vote avery/i });
    const negativeVote = screen.getByRole("button", { name: /vote noah/i });
    expect(affirmativeVote).toHaveAttribute("aria-pressed", "false");
    expect(negativeVote).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(affirmativeVote);

    await waitFor(() => {
      expect(service.voteForDebateWinner).toHaveBeenCalledWith(
        "complete",
        "viewer",
        "Aff",
      );
    });
    expect(affirmativeVote).toHaveAttribute("aria-pressed", "true");
  });

  it("does not offer winner voting to either debate participant", () => {
    mocks.currentUser = { id: "aff", displayName: "Avery", role: "student" };
    mocks.debates = [completedDebate()];

    renderPage("/app/debates/complete");

    expect(screen.queryByRole("button", { name: /vote avery/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /vote noah/i })).not.toBeInTheDocument();
  });
});

describe("DebateWatchPage summary", () => {
  it("renders the persisted structured summary and transcript-grounded highlights", () => {
    mocks.debates = [
      completedDebate({
        summaryStatus: "completed",
        aiSummary: {
          resolution: "Resolved: public transit should be fare-free",
          affirmative: {
            claims: [{ text: "Fare-free transit increases access.", turnIds: ["turn-aff"] }],
            evidence: [{
              description: "A ridership increase was cited.",
              sourceAsStated: "City report",
              turnIds: ["turn-aff"],
            }],
            rebuttals: [],
          },
          negative: {
            claims: [{ text: "The policy has an unfunded cost.", turnIds: ["turn-neg"] }],
            evidence: [],
            rebuttals: [{
              text: "Ridership alone does not prove service quality.",
              turnIds: ["turn-neg"],
            }],
          },
          clashes: [{
            topic: "Access versus funding",
            affirmativePosition: "Removing fares expands access.",
            negativePosition: "Lost revenue may reduce service.",
            neutralAssessment: "Neither transcript fully resolves the budget effect.",
            turnIds: ["turn-aff", "turn-neg"],
          }],
          neutralOutcome: {
            summary: "Both sides developed a clear but unresolved funding clash.",
            reasoning: "The affirmative established access benefits while the negative identified a budget gap.",
            unresolvedQuestions: ["What funding source replaces fare revenue?"],
          },
          speechHighlights: [
            {
              turnId: "turn-aff",
              speaker: "Avery",
              side: "Aff",
              highlight: "Connected fare removal to access.",
            },
            {
              turnId: "turn-neg",
              speaker: "Noah",
              side: "Neg",
              highlight: "Focused the debate on replacement funding.",
            },
          ],
        },
      }),
    ];

    renderSummary();

    expect(screen.getByRole("heading", { name: "Affirmative case" })).toBeInTheDocument();
    expect(screen.getByText("Fare-free transit increases access.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Central clashes" })).toBeInTheDocument();
    expect(screen.getByText("Access versus funding")).toBeInTheDocument();
    expect(screen.getByText("Connected fare removal to access.")).toBeInTheDocument();
  });

  it("shows a clear processing state while transcripts are pending", () => {
    mocks.debates = [
      completedDebate({
        summaryStatus: "waiting_for_transcripts",
      }),
    ];

    renderSummary();

    expect(
      screen.getAllByText(/recordings are still being transcribed/i).length,
    ).toBeGreaterThan(0);
  });
});
