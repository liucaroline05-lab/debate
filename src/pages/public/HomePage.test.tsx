import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "@/pages/public/HomePage";

describe("HomePage", () => {
  it("renders the core marketing promise and navigation calls to action", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: /build calm confidence, sharper cases, and better rounds/i,
      }),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /start free/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /explore coaching/i }),
    ).toBeInTheDocument();
  });
});
