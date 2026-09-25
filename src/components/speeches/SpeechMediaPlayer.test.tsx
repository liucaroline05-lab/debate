import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpeechMediaPlayer } from "./SpeechMediaPlayer";

describe("SpeechMediaPlayer errors", () => {
  it("does not show a late browser error after audio has played", () => {
    const { container } = render(<SpeechMediaPlayer src="blob:recording" fileName="recording.webm" contentType="audio/webm" />);
    const audio = container.querySelector("audio")!;
    Object.defineProperty(audio, "error", { configurable: true, value: { code: 3 } });
    fireEvent.play(audio);
    fireEvent.ended(audio);
    fireEvent.error(audio);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a genuine failure before playback starts", () => {
    const { container } = render(<SpeechMediaPlayer src="blob:broken" fileName="broken.webm" contentType="audio/webm" />);
    const audio = container.querySelector("audio")!;
    Object.defineProperty(audio, "error", { configurable: true, value: { code: 4 } });
    fireEvent.error(audio);
    expect(screen.getByRole("alert")).toHaveTextContent("This recording could not be played");
  });
});
