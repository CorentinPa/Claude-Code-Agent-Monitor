/**
 * @file Component tests for compact and detailed task-progress surfaces,
 * including accessible tooltip triggers and subagent ownership rendering.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionTodoSnapshot, SessionTodoSummary } from "../../lib/types";
import { TodoProgressIndicator } from "../TodoProgressIndicator";
import { TodoProgressPanel } from "../TodoProgressPanel";

const items = [
  {
    id: "task-1",
    text: "Inspect code",
    status: "completed" as const,
    sourceStatus: "completed",
    order: 0,
    agentId: "main-1",
    agentType: "main",
    description: null,
  },
  {
    id: "task-2",
    text: "Implement tracker",
    status: "in_progress" as const,
    sourceStatus: "in_progress",
    order: 1,
    agentId: "reviewer-1",
    agentType: "reviewer",
    description: "Build the two task progress surfaces",
  },
];

const summary: SessionTodoSummary = {
  total: 7,
  completed: 4,
  inProgress: 1,
  pending: 2,
  cancelled: 0,
  unknown: 0,
  percentComplete: 57,
  activeText: "Implement tracker",
  sourceTool: "TaskList",
  updatedAt: "2026-08-07T10:00:00.000Z",
  previewItems: items,
  overflowCount: 5,
  ownerBreakdown: [
    { agentId: "main-1", agentType: "main", completed: 3, total: 4 },
    { agentId: "reviewer-1", agentType: "reviewer", completed: 1, total: 3 },
  ],
};

const snapshot: SessionTodoSnapshot = {
  ...summary,
  provider: "claude",
  source: "mixed",
  sourceLine: 42,
  explanation: "Tracking implementation",
  confidence: "partial",
  items,
  includesSubagents: true,
};

describe("TodoProgressIndicator", () => {
  it("opens the detailed tooltip on hover and keyboard focus", () => {
    render(<TodoProgressIndicator progress={summary} />);

    const trigger = screen.getByRole("button", { name: "Task progress: 4 of 7 complete" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("4 / 7 complete · 57%");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Current: Implement tracker");
    expect(screen.getByRole("tooltip")).toHaveTextContent("reviewer");
    expect(screen.getByRole("tooltip")).toHaveTextContent("+5 more in Session Detail");

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Claude TaskList");
  });

  it("renders nothing for an empty task summary", () => {
    const { container } = render(
      <TodoProgressIndicator
        progress={{
          ...summary,
          total: 0,
          completed: 0,
          inProgress: 0,
          pending: 0,
          percentComplete: null,
          previewItems: [],
          overflowCount: 0,
        }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TodoProgressPanel", () => {
  it("renders progress, source confidence, tasks, and owner breakdown", () => {
    render(<TodoProgressPanel snapshot={snapshot} />);

    expect(screen.getByText("Task Progress")).toBeInTheDocument();
    expect(screen.getByText("Claude TaskList")).toBeInTheDocument();
    expect(screen.getByText("Includes subagents")).toBeInTheDocument();
    expect(screen.getByText("Derived from task lifecycle events")).toBeInTheDocument();
    expect(screen.getByText("Inspect code")).toBeInTheDocument();
    expect(screen.getByText("Implement tracker")).toBeInTheDocument();
    expect(screen.getAllByText("reviewer").length).toBeGreaterThan(0);
    expect(screen.getByText("4 / 7 complete")).toBeInTheDocument();
  });
});
