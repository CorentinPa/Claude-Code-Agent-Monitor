/**
 * @file Supplementary OpenAPI 3.0 fragments for the in-app manual routes mounted
 * at `/api/manual` (see server/routes/manual.js). Exports `{ tags, schemas,
 * paths }` for merging into the base spec by `createOpenApiSpec()` via
 * server/openapi-extra.js. Schemas are prefixed `Manual` to avoid collisions
 * with the base component schemas; error bodies reference the base
 * `ErrorResponse` schema (`{ error: { code, message } }`).
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const tags = [
  {
    name: "Manual",
    description:
      "Read-only access to the repository's Markdown manual (docs/*.md), rendered in-app by the dashboard's Documentation page",
  },
];

const schemas = {
  ManualDocumentSummary: {
    type: "object",
    required: ["slug", "title", "bytes"],
    description: "One document in the manual, without its body.",
    properties: {
      slug: {
        type: "string",
        description: "The file name without its `.md` extension, lowercased.",
        example: "hooks",
      },
      title: {
        type: "string",
        description:
          "The document's first Markdown H1, with code-span backticks stripped; the file name when the document has no H1.",
        example: "Hook System Integration Guide",
      },
      bytes: {
        type: "integer",
        description: "Size of the Markdown source in bytes, for a reading-length hint.",
        example: 38299,
      },
    },
  },
  ManualListResponse: {
    type: "object",
    required: ["documents"],
    description:
      "Every top-level Markdown file under `docs/`, alphabetically. Empty when the directory is absent, which is how a packaged build that did not ship `docs/` reports itself.",
    properties: {
      documents: {
        type: "array",
        items: { $ref: "#/components/schemas/ManualDocumentSummary" },
      },
    },
  },
  ManualDocumentResponse: {
    type: "object",
    required: ["slug", "title", "markdown"],
    description: "One document with its raw Markdown source, unrendered.",
    properties: {
      slug: { type: "string", example: "hooks" },
      title: { type: "string", example: "Hook System Integration Guide" },
      markdown: {
        type: "string",
        description: "The file's Markdown source, byte-for-byte as it sits in the repository.",
        example: "# Hook System Integration Guide\n\nComprehensive guide...",
      },
    },
  },
};

const paths = {
  "/api/manual": {
    get: {
      tags: ["Manual"],
      summary: "List the manual's documents",
      description:
        "Lists the top-level Markdown files under `docs/` with their titles and sizes, so the Documentation page can render a table of contents. Subdirectories (screenshots, plan archives) are ignored. Nothing is cached: a document added to the repository appears on the next request.",
      operationId: "manualList",
      responses: {
        200: {
          description: "The manual's documents",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ManualListResponse" },
              example: {
                documents: [
                  { slug: "api", title: "API Reference", bytes: 63502 },
                  { slug: "hooks", title: "Hook System Integration Guide", bytes: 38299 },
                ],
              },
            },
          },
        },
      },
    },
  },

  "/api/manual/{slug}": {
    get: {
      tags: ["Manual"],
      summary: "Get one document's Markdown",
      description:
        "Returns the raw Markdown source of a single document. The slug is matched against the directory listing rather than joined onto a filesystem path, so an unknown or traversing slug returns 404 instead of reaching the filesystem.",
      operationId: "manualGetDocument",
      parameters: [
        {
          name: "slug",
          in: "path",
          required: true,
          description: "The file name without its `.md` extension, case-insensitive.",
          schema: { type: "string" },
          example: "hooks",
        },
      ],
      responses: {
        200: {
          description: "The document",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ManualDocumentResponse" },
            },
          },
        },
        404: {
          description: "No document matches this slug",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              example: {
                error: { code: "ENOTFOUND", message: "Unknown manual document: nope" },
              },
            },
          },
        },
      },
    },
  },
};

module.exports = { tags, schemas, paths };
