import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { listArtboards } from './tools/list-artboards';
import { getArtboardSpecs } from './tools/get-artboard-specs';
import { extractTokens } from './tools/extract-tokens';

const server = new Server(
  {
    name: 'adobe-xd-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ─── Tool Definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_artboards',
      description:
        'Lists all artboard names in an Adobe XD file. Use this first to discover what artboards/screens are available before requesting specs.',
      inputSchema: {
        type: 'object',
        properties: {
          xd_source: {
            type: 'string',
            description:
              'URL or local file path to the .xd file. Example: "https://example.com/design.xd" or "/path/to/design.xd"',
          },
        },
        required: ['xd_source'],
      },
    },
    {
      name: 'get_artboard_specs',
      description:
        'Extracts detailed styling specifications from a named artboard in an XD file. Returns colors (hex + rgba), typography (font family, size, weight, line-height, letter-spacing), borders, border-radius, shadows, layout dimensions, and a ready-to-use SCSS variable snippet. Use this when updating existing component styles to match the XD design.',
      inputSchema: {
        type: 'object',
        properties: {
          xd_source: {
            type: 'string',
            description: 'URL or local file path to the .xd file.',
          },
          artboard_name: {
            type: 'string',
            description:
              'Name of the artboard as shown in the XD panel. Case-insensitive. Example: "Search Bar", "Breadcrumb & HR", "Dropdowns".',
          },
        },
        required: ['xd_source', 'artboard_name'],
      },
    },
    {
      name: 'extract_tokens',
      description:
        'Extracts global design tokens (color palette, typography scale, spacing, shadows) from the entire XD file across all artboards. Optionally diffs the extracted tokens against an existing SCSS variables file to show what has changed, been added, or removed. Can write an updated SCSS variables file to disk.',
      inputSchema: {
        type: 'object',
        properties: {
          xd_source: {
            type: 'string',
            description: 'URL or local file path to the .xd file.',
          },
          existing_scss_path: {
            type: 'string',
            description:
              'Optional. Absolute or relative path to your existing SCSS variables file (e.g. "_variables.scss"). If provided, the tool will diff the XD tokens against this file and report changes.',
          },
          output_scss_path: {
            type: 'string',
            description:
              'Optional. If provided along with existing_scss_path, writes the merged/updated SCSS variables file to this path.',
          },
        },
        required: ['xd_source'],
      },
    },
  ],
}));

// ─── Tool Handlers ────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;

    switch (name) {
      case 'list_artboards':
        result = await listArtboards({
          xd_source: args?.xd_source as string,
        });
        break;

      case 'get_artboard_specs':
        result = await getArtboardSpecs({
          xd_source: args?.xd_source as string,
          artboard_name: args?.artboard_name as string,
        });
        break;

      case 'extract_tokens':
        result = await extractTokens({
          xd_source: args?.xd_source as string,
          existing_scss_path: args?.existing_scss_path as string | undefined,
          output_scss_path: args?.output_scss_path as string | undefined,
        });
        break;

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof McpError) throw error;

    throw new McpError(
      ErrorCode.InternalError,
      `Tool "${name}" failed: ${message}`
    );
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Adobe XD MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
