/**
 * @file Unit tests for owner-attributed Claude and Codex task-progress
 * extraction from JSONL transcripts and Claude lifecycle event fallbacks.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { afterEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { extractSessionTaskProgress, clearTaskProgressCache } = require("../lib/task-progress");

const roots = [];

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ccam-task-progress-"));
  roots.push(root);
  return root;
}

function writeJsonl(filePath, entries) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

function claudeToolUse(timestamp, id, name, input) {
  return {
    type: "assistant",
    timestamp,
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name, input }],
    },
  };
}

function claudeToolResult(timestamp, id, output) {
  return {
    type: "user",
    timestamp,
    toolUseResult: output,
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: id, content: JSON.stringify(output) }],
    },
  };
}

afterEach(() => {
  clearTaskProgressCache();
  while (roots.length) {
    fs.rmSync(roots.pop(), { recursive: true, force: true });
  }
});

describe("task progress extraction", () => {
  it("uses the latest Codex update_plan call as the current full snapshot", () => {
    const root = tempRoot();
    const transcript = path.join(root, "rollout.jsonl");
    writeJsonl(transcript, [
      {
        type: "response_item",
        timestamp: "2026-08-07T10:00:00.000Z",
        payload: {
          type: "function_call",
          name: "update_plan",
          arguments: JSON.stringify({
            plan: [
              { step: "Inspect code", status: "in_progress" },
              { step: "Implement", status: "pending" },
            ],
          }),
        },
      },
      {
        type: "response_item",
        timestamp: "2026-08-07T10:05:00.000Z",
        payload: {
          type: "function_call",
          name: "update_plan",
          arguments: JSON.stringify({
            explanation: "Implementation started",
            plan: [
              { step: "Inspect code", status: "completed" },
              { step: "Implement", status: "in_progress" },
            ],
          }),
        },
      },
    ]);

    const result = extractSessionTaskProgress({
      session: { id: "codex-1", provider: "codex" },
      mainTranscriptPath: transcript,
      agents: [{ id: "codex-1-main", type: "main" }],
    });

    assert.equal(result.snapshot.total, 2);
    assert.equal(result.snapshot.completed, 1);
    assert.equal(result.snapshot.inProgress, 1);
    assert.equal(result.snapshot.percentComplete, 50);
    assert.equal(result.snapshot.activeText, "Implement");
    assert.equal(result.snapshot.explanation, "Implementation started");
    assert.equal(result.summary.previewItems[0].status, "in_progress");
  });

  it("parses the latest legacy Claude TodoWrite snapshot", () => {
    const root = tempRoot();
    const transcript = path.join(root, "claude-legacy.jsonl");
    writeJsonl(transcript, [
      claudeToolUse("2026-08-07T10:00:00.000Z", "todo-1", "TodoWrite", {
        todos: [
          { content: "Inspect code", status: "in_progress" },
          { content: "Implement", status: "pending" },
        ],
      }),
      claudeToolUse("2026-08-07T10:05:00.000Z", "todo-2", "TodoWrite", {
        todos: [
          { content: "Inspect code", status: "completed" },
          { content: "Implement", status: "completed" },
        ],
      }),
    ]);

    const result = extractSessionTaskProgress({
      session: { id: "claude-1", provider: "claude" },
      mainTranscriptPath: transcript,
      agents: [{ id: "claude-1-main", type: "main" }],
    });

    assert.equal(result.snapshot.total, 2);
    assert.equal(result.snapshot.completed, 2);
    assert.equal(result.snapshot.percentComplete, 100);
    assert.equal(result.snapshot.sourceTool, "TodoWrite");
  });

  it("reduces current Claude TaskCreate, TaskUpdate, and TaskList calls", () => {
    const root = tempRoot();
    const transcript = path.join(root, "claude-current.jsonl");
    writeJsonl(transcript, [
      claudeToolUse("2026-08-07T10:00:00.000Z", "create-1", "TaskCreate", {
        subject: "Inspect code",
        description: "Find relevant files",
      }),
      claudeToolResult("2026-08-07T10:00:01.000Z", "create-1", {
        task: { id: "task-1", subject: "Inspect code", status: "pending" },
      }),
      claudeToolUse("2026-08-07T10:01:00.000Z", "update-1", "TaskUpdate", {
        task_id: "task-1",
        status: "in_progress",
      }),
      claudeToolResult("2026-08-07T10:01:01.000Z", "update-1", {
        task: { id: "task-1", subject: "Inspect code", status: "in_progress" },
      }),
      claudeToolUse("2026-08-07T10:02:00.000Z", "list-1", "TaskList", {}),
      claudeToolResult("2026-08-07T10:02:01.000Z", "list-1", {
        tasks: [
          { id: "task-1", subject: "Inspect code", status: "completed" },
          { id: "task-2", subject: "Implement tracker", status: "in_progress" },
        ],
      }),
    ]);

    const result = extractSessionTaskProgress({
      session: { id: "claude-2", provider: "claude" },
      mainTranscriptPath: transcript,
      agents: [{ id: "claude-2-main", type: "main" }],
    });

    assert.equal(result.snapshot.sourceTool, "TaskList");
    assert.equal(result.snapshot.total, 2);
    assert.equal(result.snapshot.completed, 1);
    assert.equal(result.snapshot.activeText, "Implement tracker");
    assert.equal(result.snapshot.confidence, "full");
  });

  it("labels mutation-only Claude task state as partial", () => {
    const root = tempRoot();
    const transcript = path.join(root, "claude-mutations.jsonl");
    writeJsonl(transcript, [
      claudeToolUse("2026-08-07T10:00:00.000Z", "create-1", "TaskCreate", {
        subject: "Inspect code",
      }),
      claudeToolResult("2026-08-07T10:00:01.000Z", "create-1", {
        task: { id: "task-1", subject: "Inspect code", status: "in_progress" },
      }),
    ]);

    const result = extractSessionTaskProgress({
      session: { id: "claude-mutations", provider: "claude" },
      mainTranscriptPath: transcript,
      agents: [{ id: "claude-mutations-main", type: "main" }],
    });

    assert.equal(result.snapshot.total, 1);
    assert.equal(result.snapshot.confidence, "partial");
  });

  it("derives partial task state from lifecycle events when no transcript snapshot exists", () => {
    const result = extractSessionTaskProgress({
      session: { id: "claude-events", provider: "claude" },
      agents: [{ id: "claude-events-main", type: "main", subagent_type: null }],
      events: [
        {
          event_type: "TaskCreated",
          agent_id: "claude-events-main",
          created_at: "2026-08-07T10:00:00.000Z",
          data: JSON.stringify({
            task_id: "task-1",
            task_subject: "Implement tracker",
          }),
        },
        {
          event_type: "TaskCompleted",
          agent_id: "claude-events-main",
          created_at: "2026-08-07T10:05:00.000Z",
          data: JSON.stringify({
            task_id: "task-1",
            task_subject: "Implement tracker",
          }),
        },
      ],
    });

    assert.equal(result.snapshot.total, 1);
    assert.equal(result.snapshot.completed, 1);
    assert.equal(result.snapshot.confidence, "partial");
    assert.equal(result.snapshot.includesSubagents, false);
  });

  it("keeps subagent task ownership separate in the session aggregate", () => {
    const root = tempRoot();
    const sessionId = "claude-subagents";
    const transcript = path.join(root, `${sessionId}.jsonl`);
    const subagentTranscript = path.join(root, sessionId, "subagents", "agent-reviewer-1.jsonl");
    writeJsonl(transcript, [
      claudeToolUse("2026-08-07T10:00:00.000Z", "main-todo", "TodoWrite", {
        todos: [{ content: "Implement tracker", status: "in_progress" }],
      }),
    ]);
    writeJsonl(subagentTranscript, [
      claudeToolUse("2026-08-07T10:01:00.000Z", "sub-todo", "TodoWrite", {
        todos: [{ content: "Review tracker", status: "completed" }],
      }),
    ]);
    fs.writeFileSync(
      subagentTranscript.replace(".jsonl", ".meta.json"),
      JSON.stringify({ agentType: "reviewer" })
    );

    const result = extractSessionTaskProgress({
      session: { id: sessionId, provider: "claude" },
      mainTranscriptPath: transcript,
      agents: [
        { id: `${sessionId}-main`, type: "main", started_at: "2026-08-07T09:59:00.000Z" },
        {
          id: "reviewer-db-id",
          type: "subagent",
          subagent_type: "reviewer",
          started_at: "2026-08-07T10:00:30.000Z",
        },
      ],
    });

    assert.equal(result.snapshot.total, 2);
    assert.equal(result.snapshot.includesSubagents, true);
    const subagentItem = result.snapshot.items.find((item) => item.text === "Review tracker");
    assert.equal(subagentItem.agentId, "reviewer-db-id");
    assert.equal(subagentItem.agentType, "reviewer");
    assert.deepEqual(result.snapshot.ownerBreakdown.map((owner) => owner.agentType).sort(), [
      "main",
      "reviewer",
    ]);
  });

  it("invalidates the stat cache when a transcript grows", () => {
    const root = tempRoot();
    const transcript = path.join(root, "growing.jsonl");
    writeJsonl(transcript, [
      claudeToolUse("2026-08-07T10:00:00.000Z", "todo-1", "TodoWrite", {
        todos: [{ content: "Inspect", status: "in_progress" }],
      }),
    ]);
    const first = extractSessionTaskProgress({
      session: { id: "growing", provider: "claude" },
      mainTranscriptPath: transcript,
    });
    assert.equal(first.snapshot.completed, 0);

    fs.appendFileSync(
      transcript,
      `${JSON.stringify(
        claudeToolUse("2026-08-07T10:01:00.000Z", "todo-2", "TodoWrite", {
          todos: [{ content: "Inspect", status: "completed" }],
        })
      )}\n`
    );

    const second = extractSessionTaskProgress({
      session: { id: "growing", provider: "claude" },
      mainTranscriptPath: transcript,
    });
    assert.equal(second.snapshot.completed, 1);
  });
});
