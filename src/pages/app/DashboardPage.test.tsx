import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "@/pages/app/DashboardPage";

describe("DashboardPage", () => {
  it("shows the main dashboard sections", () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /your debate week at a glance/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/recent speeches/i)).toBeInTheDocument();
    expect(screen.getByText(/resource library/i)).toBeInTheDocument();
    expect(screen.getByText(/channels/i)).toBeInTheDocument();
  });
});
