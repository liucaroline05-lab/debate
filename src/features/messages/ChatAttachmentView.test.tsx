import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatAttachmentView } from "./ChatAttachmentView";
import { loadChatAttachmentTranscript } from "./chatAttachmentService";
import type { ChatMessage } from "@/types/models";

vi.mock("./chatAttachmentService", () => ({
  loadChatAttachment: vi.fn().mockResolvedValue("blob:chat-attachment"),
  loadChatAttachmentTranscript: vi.fn().mockResolvedValue("Previously recorded speech."),
}));

const message: ChatMessage = {
  id: "attachment-message",
  threadId: "thread-1",
  participantIds: ["sender", "recipient"],
  authorId: "sender",
  authorName: "Sender",
  content: "Shared image: photo.png",
  createdAt: "2026-09-24T12:00:00.000Z",
  attachment: {
    kind: "image",
    name: "photo.png",
    contentType: "image/png",
    size: 123,
    storagePath: "chatAttachments/thread-1/file",
  },
};

describe("ChatAttachmentView downloads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the external download control only to recipients and remembers a click", async () => {
    const view = render(<ChatAttachmentView message={message} viewerId="recipient" />);
    const download = await screen.findByRole("link", { name: "Download photo.png" });
    expect(download.parentElement).toHaveClass("message-attachment-shell");
    expect(download.previousElementSibling).toHaveClass("message-attachment");
    expect(download).not.toHaveClass("is-downloaded");

    download.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(download);
    expect(download).toHaveClass("is-downloaded");
    view.unmount();

    render(<ChatAttachmentView message={message} viewerId="recipient" />);
    expect(await screen.findByRole("link", { name: "Download photo.png" })).toHaveClass("is-downloaded");
  });

  it("does not show a download control to the sender", async () => {
    render(<ChatAttachmentView message={message} viewerId="sender" />);
    expect(await screen.findByRole("img", { name: "photo.png" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download photo.png" })).not.toBeInTheDocument();
  });

  it("shows an inline PDF preview with the download control beside its card", async () => {
    const pdfMessage: ChatMessage = {
      ...message,
      attachment: { ...message.attachment!, kind: "document", name: "case.pdf", contentType: "application/pdf" },
    };
    render(<ChatAttachmentView message={pdfMessage} viewerId="recipient" />);
    const preview = await screen.findByTitle("Preview of case.pdf");
    expect(preview).toHaveAttribute("src", expect.stringContaining("blob:chat-attachment#"));
    expect(screen.getByText("case.pdf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download case.pdf" }).previousElementSibling).toHaveClass("message-attachment");
  });

  it("shows saved text previews for Word documents", async () => {
    const wordMessage: ChatMessage = {
      ...message,
      attachment: { ...message.attachment!, kind: "document", name: "brief.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", previewText: "Opening claim and evidence." },
    };
    render(<ChatAttachmentView message={wordMessage} viewerId="recipient" />);
    expect(screen.getByText("Opening claim and evidence.")).toHaveClass("message-document-preview");
    expect(screen.getByText("brief.docx")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Download brief.docx" })).toBeInTheDocument();
  });

  it("reads a preview from older text attachments without saved preview metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ text: async () => "First line of practice notes" }));
    const textMessage: ChatMessage = {
      ...message,
      attachment: { ...message.attachment!, kind: "document", name: "notes.txt", contentType: "text/plain" },
    };
    render(<ChatAttachmentView message={textMessage} viewerId="recipient" />);
    expect(await screen.findByText("First line of practice notes")).toHaveClass("message-document-preview");
  });

  it("uses the site player and expands a long audio transcript", async () => {
    const transcript = "This is the start of a long spoken message. ".repeat(8).trim();
    const audioMessage: ChatMessage = {
      ...message,
      attachment: { ...message.attachment!, kind: "audio", name: "recording.webm", contentType: "audio/webm", transcript },
    };
    render(<ChatAttachmentView message={audioMessage} viewerId="recipient" />);
    expect(await screen.findByRole("button", { name: "Play recording" })).toBeInTheDocument();
    expect(screen.queryByText(transcript)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show full transcript" }));
    expect(screen.getByText(transcript)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText(transcript)).not.toBeInTheDocument();
    expect(loadChatAttachmentTranscript).not.toHaveBeenCalled();
  });

  it("loads a transcript for an older audio message", async () => {
    const audioMessage: ChatMessage = {
      ...message,
      attachment: { ...message.attachment!, kind: "audio", name: "older.webm", contentType: "audio/webm" },
    };
    render(<ChatAttachmentView message={audioMessage} viewerId="recipient" />);
    expect(await screen.findByText("Previously recorded speech.")).toBeInTheDocument();
    expect(loadChatAttachmentTranscript).toHaveBeenCalledWith("thread-1", "attachment-message");
  });
});
