import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MessageContent } from "@/features/messages/MessageContent";

describe("MessageContent", () => {
  it("makes a shared post URL an internal clickable link", () => {
    const url = `${window.location.origin}/app/community?post=post-1`;
    render(<MemoryRouter><MessageContent content={`Read this — ${url}`} /></MemoryRouter>);

    expect(screen.getByRole("link", { name: url })).toHaveAttribute(
      "href",
      "/app/community?post=post-1",
    );
  });

  it("links external URLs safely and keeps trailing punctuation outside the link", () => {
    render(<MemoryRouter><MessageContent content="See https://example.com/speech.pdf." /></MemoryRouter>);

    const link = screen.getByRole("link", { name: "https://example.com/speech.pdf" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/\.$/)).toBeInTheDocument();
  });
});
