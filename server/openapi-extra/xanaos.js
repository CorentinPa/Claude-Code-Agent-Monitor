/**
 * @file Supplementary OpenAPI 3.0 fragment for the XanaOS assistants route
 * mounted at `/api/xanaos` (see server/routes/xanaos.js). Exports `{ tags,
 * schemas, paths }` for merging into the base spec by `createOpenApiSpec()`
 * via server/openapi-extra.js. Schemas are prefixed `Xanaos` to avoid
 * collisions with the base component schemas.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const tags = [
  {
    name: "XanaOS",
    description:
      "Read-only discovery of XanaOS assistants from the repository's spec layer (OS/assistantes), rendered in-app by the dashboard's Assistants page",
  },
];

const schemas = {
  XanaosAssistant: {
    type: "object",
    required: ["first_name", "role", "dir_name", "path", "sub_agents", "has_runtime"],
    description: "One assistant discovered under the assistants directory.",
    properties: {
      first_name: { type: "string", example: "Xana" },
      role: { type: "string", example: "Orchestration" },
      dir_name: { type: "string", example: "Xana-IA-Orchestration" },
      path: {
        type: "string",
        example: "/mnt/DATA2/Second_Cerveau/OS/assistantes/Xana-IA-Orchestration",
      },
      description: {
        type: "string",
        nullable: true,
        description:
          "First non-heading, non-quote paragraph of the assistant's README, truncated to 240 characters.",
      },
      sub_agents: {
        type: "array",
        items: { type: "string" },
        description:
          "Names of the assistant's sub-agent spec files (subAgents/*.md), without extension.",
      },
      has_runtime: {
        type: "boolean",
        description: "Whether a distilled runtime/CLAUDE.md exists.",
      },
      distilled_at: {
        type: "string",
        format: "date-time",
        nullable: true,
        description: "Modification time of runtime/CLAUDE.md, null when has_runtime is false.",
      },
    },
  },
  XanaosAssistantsResponse: {
    type: "object",
    required: [
      "assistants_dir",
      "assistants_dir_source",
      "assistants_dir_exists",
      "totals",
      "assistants",
    ],
    properties: {
      assistants_dir: { type: "string", nullable: true },
      assistants_dir_source: { type: "string", enum: ["configured", "auto", "none"] },
      assistants_dir_exists: { type: "boolean" },
      totals: {
        type: "object",
        required: ["discovered"],
        properties: { discovered: { type: "integer" } },
      },
      assistants: {
        type: "array",
        items: { $ref: "#/components/schemas/XanaosAssistant" },
      },
    },
  },
};

const paths = {
  "/api/xanaos/assistants": {
    get: {
      tags: ["XanaOS"],
      operationId: "listXanaosAssistants",
      summary: "Discover XanaOS assistants",
      description:
        "Scans the resolved assistants directory (OS/assistantes by convention) for assistant cards: identity, README description, sub-agents, and whether a distilled runtime exists. Read-only; nothing is cached, so a newly distilled assistant appears on the next request.",
      responses: {
        200: {
          description: "The resolved assistants directory and its discovered assistants.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/XanaosAssistantsResponse" },
            },
          },
        },
      },
    },
  },
};

module.exports = { tags, schemas, paths };
