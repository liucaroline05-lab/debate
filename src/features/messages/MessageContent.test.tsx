import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MessageContent } from "@/features/messages/MessageContent";

describe("MessageContent", () => {
  it("renders resource shares as rich internal cards", () => {
    const url = `${window.location.origin}/app/resources/quick-read`;
    render(<MemoryRouter><MessageContent content={`Quick read — ${url}`} sharedPreview={{ kind: "resource", title: "Quick read", url, media: [{ kind: "image", url: "https://example.com/cover.jpg", name: "Cover" }] }} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Quick read/ })).toHaveAttribute("href", "/app/resources/quick-read");
    expect(screen.getByRole("img", { name: "Cover" })).toBeInTheDocument();
  });
  it("renders older shared post links as clickable title cards", () => {
    const url = `${window.location.origin}/app/community?post=post-1`;
    render(<MemoryRouter><MessageContent content={`Read this — ${url}`} /></MemoryRouter>);

    expect(screen.getByRole("link", { name: /Read this/ })).toHaveAttribute(
      "href",
      "/app/community?post=post-1",
    );
    expect(screen.queryByText(url)).not.toBeInTheDocument();
  });

  it("renders a shared post with an image and video thumbnail without showing the URL", () => {
    const url = `${window.location.origin}/app/community?post=post-2`;
    render(
      <MemoryRouter>
        <MessageContent
          content={`Thought you would like this\n\nDebate photos — ${url}`}
          sharedPreview={{
            kind: "post",
            title: "Debate photos",
            url,
            media: [
              { kind: "image", name: "Round photo", url: "https://example.com/photo.jpg" },
              { kind: "video", name: "Round clip", url: "https://example.com/clip.mp4" },
            ],
            mediaCount: 2,
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Thought you would like this")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Debate photos/ })).toHaveAttribute("href", "/app/community?post=post-2");
    expect(screen.getByRole("img", { name: "Round photo" })).toHaveAttribute("src", "https://example.com/photo.jpg");
    expect(screen.getByLabelText("Round clip")).toHaveAttribute("src", "https://example.com/clip.mp4#t=0.1");
    expect(screen.queryByText(url)).not.toBeInTheDocument();
  });

  it("links external URLs safely and keeps trailing punctuation outside the link", () => {
    render(<MemoryRouter><MessageContent content="See https://example.com/speech.pdf." /></MemoryRouter>);

    const link = screen.getByRole("link", { name: "https://example.com/speech.pdf" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/\.$/)).toBeInTheDocument();
  });
});
