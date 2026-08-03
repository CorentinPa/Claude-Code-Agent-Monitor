/**
 * @file SessionCard.test.tsx
 * @description Regression tests for the compact Kanban session card, including
 * preserving a Codex session's meaningful title, human task context, and no
 * redundant ID badge.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SessionCard } from "../SessionCard";
import type { Session } from "../../lib/types";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "019fbe8f-b608-7c80-afec-ee65e2ebbe1c",
    name: "Ship real-time session discovery",
    status: "active",
    cwd: "/Users/dev/project",
    model: "gpt-5.6-terra",
    started_at: "2026-08-02T00:00:00.000Z",
    ended_at: null,
    metadata: null,
    agent_count: 1,
    cost: 54.85,
    provider: "codex",
    ...overrides,
  };
}

describe("SessionCard", () => {
  it("keeps a named Codex session title clean without a duplicate provider ID badge", () => {
    render(
      <MemoryRouter>
        <SessionCard session={makeSession()} />
      </MemoryRouter>
    );

    expect(screen.getByText("Ship real-time session discovery")).toBeInTheDocument();
    expect(screen.getByText("019fbe8f-b60")).toBeInTheDocument();
    expect(screen.queryByText("Codex · 019fbe8f")).not.toBeInTheDocument();
  });

  it("shows a renamed Codex session's latest prompt below its native title", () => {
    render(
      <MemoryRouter>
        <SessionCard
          session={makeSession({
            name: "hehe",
            prompt_preview: "Add live card context for renamed Codex sessions.",
          })}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("hehe")).toBeInTheDocument();
    expect(
      screen.getByText("Add live card context for renamed Codex sessions.")
    ).toBeInTheDocument();
  });
});
