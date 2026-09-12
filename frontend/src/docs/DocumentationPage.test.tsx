import { render, screen } from "@testing-library/react";
import { DocumentationPage } from "./DocumentationPage";

describe("DocumentationPage", () => {
  /** Verifies the page links to the served guide files. */
  it("shows links to the user guide", () => {
    render(<DocumentationPage />);
    const pdf = screen.getByText(/user guide \(pdf\)/i);
    expect(pdf).toHaveAttribute("href", "/docs/user-guide.pdf");
    expect(pdf).toHaveAttribute("target", "_blank");
    const md = screen.getByText(/user guide \(markdown\)/i);
    expect(md).toHaveAttribute("href", "/docs/user-guide.md");
  });
});