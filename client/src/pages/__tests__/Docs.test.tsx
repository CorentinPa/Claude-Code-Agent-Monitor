/**
 * @file Docs.test.tsx
 * @description Unit tests for the Documentation page: the table of contents
 * mirrors the manual, a document's Markdown renders, a cross-document link
 * switches documents in place, a repository path outside the manual renders as
 * inert text rather than a dead link, and a build without docs/ shows the empty
 * state.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Docs } from "../Docs";
import { api } from "../../lib/api";
import i18n from "../../i18n";

vi.mock("../../lib/api", () => ({
  api: {
    manual: {
      list: vi.fn(),
      get: vi.fn(),
    },
  },
}));

// Mermaid is loaded dynamically by MermaidDiagram; stub it so the test does not
// pull the real renderer (and its DOM measurement) into jsdom.
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: "<svg data-testid='diagram'></svg>" }),
  },
}));

const DOCUMENTS = [
  { slug: "api", title: "API Reference", bytes: 100 },
  { slug: "hooks", title: "Hook System Integration Guide", bytes: 200 },
];

const BODIES: Record<string, string> = {
  api: "# API Reference\n\nSee [the hooks guide](./HOOKS.md) and [setup](../SETUP.md).\n",
  hooks: "# Hook System Integration Guide\n\nHooks are non-blocking.\n",
};

function renderDocs() {
  return render(
    <MemoryRouter>
      <Docs />
    </MemoryRouter>
  );
}

describe("Docs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.mocked(api.manual.list).mockResolvedValue({ documents: DOCUMENTS });
    vi.mocked(api.manual.get).mockImplementation((slug: string) =>
      Promise.resolve({
        slug,
        title: DOCUMENTS.find((d) => d.slug === slug)!.title,
        markdown: BODIES[slug] as string,
      })
    );
  });

  it("lists the manual and renders the first document", async () => {
    renderDocs();

    expect(await screen.findByRole("button", { name: /API Reference/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Hook System Integration Guide/ })
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "API Reference" })).toBeInTheDocument();
  });

  it("follows a cross-document link without leaving the page", async () => {
    const user = userEvent.setup();
    renderDocs();

    await user.click(await screen.findByRole("button", { name: "the hooks guide" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Hook System Integration Guide" })
      ).toBeInTheDocument()
    );
  });

  it("renders a repository path outside the manual as inert text", async () => {
    renderDocs();

    const outside = await screen.findByTitle("../SETUP.md");
    expect(outside.tagName).toBe("SPAN");
    expect(screen.queryByRole("link", { name: "setup" })).not.toBeInTheDocument();
  });

  it("shows the empty state when no documentation shipped", async () => {
    vi.mocked(api.manual.list).mockResolvedValue({ documents: [] });
    renderDocs();

    expect(
      await screen.findByText("No documentation was shipped with this build.")
    ).toBeInTheDocument();
  });
});
