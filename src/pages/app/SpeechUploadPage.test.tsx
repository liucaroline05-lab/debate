import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechUploadPage } from "@/pages/app/SpeechUploadPage";
import type { SpeechRecord } from "@/types/models";

const mocks = vi.hoisted(() => ({
  createSpeechRecord: vi.fn(),
  own: [] as SpeechRecord[],
  public: [] as SpeechRecord[],
}));

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ currentUser: { id: "me", displayName: "Avery" } }),
}));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: (
    _collection: string,
    _seeds: unknown[],
    _constraints: unknown[],
    _enabled: boolean,
    cacheKey: string,
  ) => ({
    data: cacheKey === "speeches:public" ? mocks.public : mocks.own,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/features/speeches/speechService", () => ({
  createSpeechRecord: mocks.createSpeechRecord,
}));

const speech = (id: string, overrides: Partial<SpeechRecord> = {}): SpeechRecord => ({
  id,
  creatorId: "me",
  title: "Education case",
  eventName: "Practice",
  format: "Public Forum",
  topicCategory: "Education",
  visibility: "public",
  status: "Uploaded",
  speakerName: "Avery",
  coachNotes: "",
  uploadedAt: "2026-09-01T12:00:00.000Z",
  transcriptStatus: "Pending",
  tags: [],
  organizationTags: [],
  ...overrides,
});

const renderPage = () => render(<MemoryRouter><SpeechUploadPage /></MemoryRouter>);

describe("SpeechUploadPage", () => {
  beforeEach(() => {
    mocks.createSpeechRecord.mockReset().mockImplementation(async (input) => ({
      id: "new-speech",
      title: input.title,
    }));
    mocks.own = [speech("mine")];
    mocks.public = [
      speech("mine"),
      speech("theirs", {
        creatorId: "other",
        speakerName: "Taylor",
        title: "Climate rebuttal",
        format: "Lincoln-Douglas",
        topicCategory: "Environment",
      }),
    ];
  });

  it("shows separate searchable speech sections and filters without opening upload", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole("heading", { name: "Upload a speech" })).not.toBeInTheDocument();
    const mySection = screen.getByRole("heading", { name: "Your speeches" }).closest("article")!;
    const communitySection = screen.getByRole("heading", { name: "Community speeches" }).closest("article")!;
    expect(within(mySection).getByText("Education case")).toBeInTheDocument();
    expect(within(communitySection).getByText("Climate rebuttal")).toBeInTheDocument();

    await user.click(screen.getByText("Filters"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Topic category" }), "Environment");
    expect(within(mySection).queryByText("Education case")).not.toBeInTheDocument();
    expect(within(communitySection).getByText("Climate rebuttal")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "no match");
    expect(within(communitySection).queryByText("Climate rebuttal")).not.toBeInTheDocument();
  });

  it("opens upload on demand and uses inline validation instead of native popups", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(screen.getByRole("button", { name: "Upload Speech" }));
    expect(screen.getByRole("heading", { name: "Upload a speech" })).toBeInTheDocument();
    expect(container.querySelector("form")).toHaveAttribute("novalidate");

    await user.click(screen.getByRole("button", { name: "Save speech" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add a speech title before saving.");
    await user.type(screen.getByRole("textbox", { name: "Speech title" }), "New practice speech");
    await user.click(screen.getByRole("button", { name: "Save speech" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add an event or practice name before saving.");

    await user.type(screen.getByRole("textbox", { name: "Event / practice" }), "Team practice");
    await user.click(screen.getByRole("button", { name: "Save speech" }));
    expect(mocks.createSpeechRecord).toHaveBeenCalledWith(expect.objectContaining({
      title: "New practice speech",
      eventName: "Team practice",
      topicCategory: "Other",
    }));
    expect(await screen.findByText(/Saved "New practice speech"/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Upload a speech" })).not.toBeInTheDocument();
  });
});
