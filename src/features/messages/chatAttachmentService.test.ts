import { describe, expect, it } from "vitest";
import { validateChatAttachment } from "./chatAttachmentService";

describe("validateChatAttachment", () => {
  it("accepts supported images, audio, and documents", () => {
    expect(() => validateChatAttachment(new File(["a"], "image.png", { type: "image/png" }))).not.toThrow();
    expect(() => validateChatAttachment(new File(["a"], "voice.webm", { type: "audio/webm" }))).not.toThrow();
    expect(() => validateChatAttachment(new File(["a"], "notes.pdf", { type: "application/pdf" }))).not.toThrow();
  });

  it("rejects video and oversized files before upload", () => {
    expect(() => validateChatAttachment(new File(["a"], "clip.mp4", { type: "video/mp4" }))).toThrow(/Video is not yet supported/);
    expect(() => validateChatAttachment(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.txt", { type: "text/plain" }))).toThrow(/smaller than 4 MB/);
  });
});
