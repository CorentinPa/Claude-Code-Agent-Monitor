/**
 * @file OpenAPI fragments for the safe, read-only Codex configuration
 * explorer at `/api/codex-config`. The feature reports only metadata and
 * redacted file contents from CODEX_HOME; it never edits live Codex files.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const tags = [
  {
    name: "CodexConfig",
    description:
      "Read-only Codex CLI configuration discovery: defaults, model cache, profiles, MCP servers, projects, skills, rules, hooks, plugins, and instruction files.",
  },
];

const schemas = {
  CodexConfigOverview: {
    type: "object",
    description:
      "Safe metadata discovered beneath the configured CODEX_HOME. Values of secret-like TOML/JSON keys are redacted before the response is sent.",
    required: [
      "home",
      "config",
      "defaults",
      "counts",
      "models",
      "profiles",
      "mcp",
      "projects",
      "skills",
      "hooks",
      "rules",
      "plugins",
      "instructions",
    ],
    properties: {
      home: {
        type: "string",
        description: "Resolved Codex home directory.",
        example: "/Users/dev/.codex",
      },
      config: {
        type: "object",
        properties: {
          path: { type: "string" },
          exists: { type: "boolean" },
          text: { type: "string", description: "Redacted config.toml preview." },
          truncated: { type: "boolean" },
        },
      },
      defaults: {
        type: "object",
        properties: {
          model: { type: "string", nullable: true },
          reasoningEffort: { type: "string", nullable: true },
          personality: { type: "string", nullable: true },
        },
      },
      counts: { type: "object", additionalProperties: { type: "integer" } },
      models: { type: "object", additionalProperties: true },
      profiles: { type: "array", items: { type: "object", additionalProperties: true } },
      mcp: { type: "array", items: { type: "object", additionalProperties: true } },
      projects: { type: "array", items: { type: "object", additionalProperties: true } },
      skills: { type: "array", items: { type: "object", additionalProperties: true } },
      hooks: { type: "object", additionalProperties: true },
      rules: { type: "array", items: { type: "object", additionalProperties: true } },
      plugins: { type: "array", items: { type: "object", additionalProperties: true } },
      instructions: { type: "array", items: { type: "object", additionalProperties: true } },
    },
  },
  CodexConfigFile: {
    type: "object",
    required: ["path", "text", "size", "mtime", "truncated"],
    properties: {
      path: { type: "string" },
      text: {
        type: "string",
        description: "Contents, redacted where applicable and capped at 256 KiB.",
      },
      size: { type: "integer" },
      mtime: { type: "number" },
      truncated: { type: "boolean" },
    },
  },
};

const paths = {
  "/api/codex-config/overview": {
    get: {
      tags: ["CodexConfig"],
      summary: "Read safe Codex configuration metadata",
      description:
        "Returns the current Codex defaults, available model cache, profiles, configured MCP servers/projects, skills, rules, hooks, plugins, and instruction-file metadata. This endpoint only reads local files and redacts secret-like values.",
      operationId: "codexConfigOverview",
      responses: {
        200: {
          description: "Read-only Codex configuration overview.",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CodexConfigOverview" } },
          },
        },
      },
    },
  },
  "/api/codex-config/file": {
    get: {
      tags: ["CodexConfig"],
      summary: "Read one safe Codex configuration file",
      description:
        "Reads one file contained by CODEX_HOME, or this repository's AGENTS.md. TOML and JSON secret-like values are redacted; files are capped at 256 KiB. Paths outside those roots are refused.",
      operationId: "codexConfigFile",
      parameters: [
        {
          name: "path",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Absolute path under CODEX_HOME or to this project's AGENTS.md.",
        },
      ],
      responses: {
        200: {
          description: "Redacted file content.",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CodexConfigFile" } },
          },
        },
        400: {
          description:
            "READ_DENIED — the requested file is outside the allowed roots or unreadable.",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
          },
        },
      },
    },
  },
};

module.exports = { tags, schemas, paths };
