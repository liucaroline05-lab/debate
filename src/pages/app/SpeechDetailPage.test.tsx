import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechDetailPage } from "@/pages/app/SpeechDetailPage";
import type { SpeechRecord } from "@/types/models";

const mocks = vi.hoisted(() => ({
  speech: null as SpeechRecord | null,
  reportSpeechRecord: vi.fn(),
  currentUserId: "owner" as string,
}));

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    currentUser: { id: mocks.currentUserId, displayName: "Avery", role: "student" },
    authReady: true,
    isDemoMode: false,
  }),
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock("@/features/speeches/speechService", () => ({
  addSpeechComment: vi.fn(),
  deleteSpeechRecord: vi.fn(),
  reportSpeechRecord: mocks.reportSpeechRecord,
  updateSpeechRecord: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ firestore: {} }));

vi.mock("firebase/firestore", () => ({
  doc: () => ({}),
  onSnapshot: (
    _reference: unknown,
    onNext: (snapshot: {
      exists: () => boolean;
      id: string;
      data: () => Record<string, unknown>;
    }) => void,
  ) => {
    onNext({
      exists: () => mocks.speech !== null,
      id: mocks.speech?.id ?? "speech-1",
      data: () => ({ ...(mocks.speech ?? {}) }),
    });
    return () => {};
  },
}));

const baseSpeech = (overrides: Partial<SpeechRecord> = {}): SpeechRecord => ({
  id: "speech-1",
  creatorId: "owner",
  title: "Neg rebuttal drill",
  eventName: "Districts practice",
  format: "Public Forum",
  visibility: "private",
  status: "Uploaded",
  speakerName: "Avery",
  coachNotes: "",
  uploadedAt: "2026-09-01T15:00:00.000Z",
  transcriptStatus: "Pending",
  tags: [],
  organizationTags: [],
  mediaPath: "https://example.com/speech.webm",
  commentsEnabled: false,
  ...overrides,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/app/speeches/speech-1"]}>
      <Routes>
        <Route path="/app/speeches/:speechId" element={<SpeechDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("SpeechDetailPage", () => {
  beforeEach(() => {
    mocks.speech = baseSpeech();
    mocks.currentUserId = "owner";
    mocks.reportSpeechRecord.mockReset().mockResolvedValue(true);
  });

  it("renders app-styled playback controls instead of browser-native controls", () => {
    const { container } = renderPage();

    const players = container.querySelectorAll("audio");
    expect(players).toHaveLength(1);
    expect(players[0]).not.toHaveAttribute("controls");
    expect(players[0]).toHaveAttribute("src", "https://example.com/speech.webm");
    expect(screen.getByRole("button", { name: "Play recording" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Seek recording" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download/ })).toBeInTheDocument();
  });

  it("opens a report form and submits a private report for another user's speech", async () => {
    mocks.currentUserId = "viewer";
    mocks.speech = baseSpeech({ creatorId: "owner", visibility: "public" });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Actions for Neg rebuttal drill" }));
    await user.click(screen.getByRole("button", { name: "Report" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Reason" }), "Spam");
    await user.type(screen.getByRole("textbox", { name: "Details (optional)" }), "Repeated ads");
    await user.click(screen.getByRole("button", { name: "Submit report" }));

    expect(mocks.reportSpeechRecord).toHaveBeenCalledWith("speech-1", "viewer", "Spam", "Repeated ads");
    expect(await screen.findByText("Report submitted. Thank you.")).toBeInTheDocument();
  });

  it("shows the AI summary once processing has finished", () => {
    mocks.speech = baseSpeech({
      summaryStatus: "completed",
      summary: "A focused rebuttal that collapses the round to one impact.",
      aiSummary: {
        overview: "A focused rebuttal that collapses the round to one impact.",
        mainClaims: ["Framework favors magnitude over probability."],
        evidenceMentioned: [
          { description: "A 2024 transit ridership figure", sourceAsStated: "" },
        ],
        structure: [{ section: "Overview", description: "Frames the round." }],
        deliveryNotes: ["Signposts each response clearly."],
        suggestions: ["Weigh the turn against the case impact."],
      },
    });

    renderPage();

    expect(screen.getByRole("heading", { name: /AI summary/ })).toBeInTheDocument();
    expect(
      screen.getByText("Framework favors magnitude over probability."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A 2024 transit ridership figure/),
    ).toBeInTheDocument();
    expect(screen.getByText(/no source named in the recording/)).toBeInTheDocument();
    expect(screen.getByText("Weigh the turn against the case impact.")).toBeInTheDocument();
  });

  it("explains that a summary is still being prepared", () => {
    mocks.speech = baseSpeech({ summaryStatus: "processing" });

    renderPage();

    expect(
      screen.getByText(/being transcribed and summarized/),
    ).toBeInTheDocument();
  });
});
