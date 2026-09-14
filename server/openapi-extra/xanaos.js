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
      config_dir: {
        type: "string",
        nullable: true,
        description:
          "Absolute path to the assistant's Claude config dir, null when deployed is false.",
        example: "/home/corentin/.Xanaos/Xana",
      },
      deployed: {
        type: "boolean",
        description:
          "Whether the assistant's config dir exists at all. False means it has never been run.",
      },
      up: {
        type: "boolean",
        description:
          "Whether at least one of the assistant's sessions is backed by a verified live process.",
      },
      busy: {
        type: "boolean",
        description: "Whether at least one verified live session is currently busy.",
      },
      remote_control: {
        type: "boolean",
        description: "Whether at least one verified live session exposes a Remote Control bridge.",
      },
    },
  },
  XanaosRecentSession: {
    type: "object",
    required: ["session_id", "modified_at", "known"],
    description:
      "One session read from the assistant's transcript tree, decorated with what this dashboard's database knows about it when the row exists.",
    properties: {
      session_id: { type: "string", description: "The transcript's file name, without extension." },
      modified_at: { type: "string", format: "date-time" },
      name: { type: "string", nullable: true },
      status: { type: "string", nullable: true },
      started_at: { type: "string", format: "date-time", nullable: true },
      ended_at: { type: "string", format: "date-time", nullable: true },
      known: {
        type: "boolean",
        description: "Whether a matching row exists in this dashboard's database.",
      },
    },
  },
  XanaosRecentEvent: {
    type: "object",
    properties: {
      session_id: { type: "string" },
      event_type: { type: "string" },
      tool_name: { type: "string", nullable: true },
      summary: { type: "string", nullable: true },
      created_at: { type: "string", format: "date-time" },
    },
  },
  XanaosAssistantDetail: {
    allOf: [
      { $ref: "#/components/schemas/XanaosAssistant" },
      {
        type: "object",
        required: ["recent_sessions", "recent_events"],
        properties: {
          recent_sessions: {
            type: "array",
            items: { $ref: "#/components/schemas/XanaosRecentSession" },
          },
          recent_events: {
            type: "array",
            items: { $ref: "#/components/schemas/XanaosRecentEvent" },
          },
        },
      },
    ],
  },
  XanaosAssistantsResponse: {
    type: "object",
    required: [
      "assistants_dir",
      "assistants_dir_source",
      "assistants_dir_exists",
      "config_root",
      "totals",
      "assistants",
    ],
    properties: {
      assistants_dir: { type: "string", nullable: true },
      assistants_dir_source: { type: "string", enum: ["configured", "auto", "none"] },
      assistants_dir_exists: { type: "boolean" },
      config_root: {
        type: "string",
        description:
          "Root under which each assistant's Claude config dir is expected, e.g. ~/.Xanaos.",
      },
      totals: {
        type: "object",
        required: ["discovered", "up", "remote_control"],
        properties: {
          discovered: { type: "integer" },
          up: { type: "integer" },
          remote_control: { type: "integer" },
        },
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

  "/api/xanaos/assistants/{firstName}": {
    get: {
      tags: ["XanaOS"],
      operationId: "getXanaosAssistant",
      summary: "One assistant's detail: identity, recent sessions, recent events",
      description:
        "Everything a 'see more' detail view needs to pilot and analyze one assistant: its card, its recent sessions read from its transcript tree (so history predating the cockpit's hooks still shows) decorated with what this dashboard's database knows about them, and the most recent recorded events across those sessions. Read-only; nothing is cached.",
      parameters: [
        {
          name: "firstName",
          in: "path",
          required: true,
          description: "The assistant's first name, as parsed from its directory name.",
          schema: { type: "string" },
          example: "Xana",
        },
      ],
      responses: {
        200: {
          description: "The assistant's card, recent sessions, and recent events.",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/XanaosAssistantDetail" } },
          },
        },
        404: {
          description: "No assistant matches this first name",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              example: { error: { code: "ENOTFOUND", message: "Unknown assistant: Nobody" } },
            },
          },
        },
      },
    },
  },
};

module.exports = { tags, schemas, paths };
