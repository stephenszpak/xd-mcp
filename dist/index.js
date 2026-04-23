"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const list_artboards_1 = require("./tools/list-artboards");
const get_artboard_specs_1 = require("./tools/get-artboard-specs");
const extract_tokens_1 = require("./tools/extract-tokens");
const fetch_from_xd_share_1 = require("./tools/fetch-from-xd-share");
const get_specs_1 = require("./tools/get-specs");
const server = new index_js_1.Server({
    name: 'xd-mcp',
    version: '1.0.0',
}, {
    capabilities: {
        tools: {},
    },
});
// ─── Tool Definitions ─────────────────────────────────────────────────────────
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'get_specs',
            description: 'PRIMARY TOOL — use this whenever a user asks about XD design specs, styles, or component styling. Accepts any XD source (share URL, direct file URL, or local file path) and an optional artboard name. Automatically routes to the right fetcher: Adobe XD share links (https://xd.adobe.com/view/...) are fetched via the viewer API; other URLs and local .xd file paths are read directly. If artboard_name is omitted, returns the list of artboards so you can pick the right one. If artboard_name is provided, returns full specs: colors (hex + rgba), typography, borders, border-radius, shadows, spacing, and a ready-to-use SCSS snippet.',
            inputSchema: {
                type: 'object',
                properties: {
                    xd_source: {
                        type: 'string',
                        description: 'Any XD source: a share URL (https://xd.adobe.com/view/<id>/grid), a direct .xd file URL (https://example.com/design.xd), or a local file path (/path/to/design.xd or C:\\designs\\file.xd).',
                    },
                    artboard_name: {
                        type: 'string',
                        description: 'Optional. Name of the artboard to extract specs for. Case-insensitive. If omitted, returns the list of available artboards.',
                    },
                },
                required: ['xd_source'],
            },
        },
        {
            name: 'list_artboards',
            description: 'Lists all artboard names in an Adobe XD file. Prefer get_specs (without artboard_name) instead — it handles all source types. Use this only when you specifically have a direct .xd file URL or local path and want an explicit list.',
            inputSchema: {
                type: 'object',
                properties: {
                    xd_source: {
                        type: 'string',
                        description: 'URL or local file path to the .xd file. Example: "https://example.com/design.xd" or "/path/to/design.xd"',
                    },
                },
                required: ['xd_source'],
            },
        },
        {
            name: 'get_artboard_specs',
            description: 'Extracts detailed styling specifications from a named artboard in a local or remotely-hosted .xd file. Prefer get_specs instead — it routes automatically. Use this only when you have a direct .xd file URL or local path and already know the artboard name.',
            inputSchema: {
                type: 'object',
                properties: {
                    xd_source: {
                        type: 'string',
                        description: 'URL or local file path to the .xd file.',
                    },
                    artboard_name: {
                        type: 'string',
                        description: 'Name of the artboard as shown in the XD panel. Case-insensitive. Example: "Search Bar", "Breadcrumb & HR", "Dropdowns".',
                    },
                },
                required: ['xd_source', 'artboard_name'],
            },
        },
        {
            name: 'extract_tokens',
            description: 'Extracts global design tokens (color palette, typography scale, spacing, shadows) from the entire XD file across all artboards. Optionally diffs the extracted tokens against an existing SCSS variables file to show what has changed, been added, or removed. Can write an updated SCSS variables file to disk.',
            inputSchema: {
                type: 'object',
                properties: {
                    xd_source: {
                        type: 'string',
                        description: 'URL or local file path to the .xd file.',
                    },
                    existing_scss_path: {
                        type: 'string',
                        description: 'Optional. Absolute or relative path to your existing SCSS variables file (e.g. "_variables.scss"). If provided, the tool will diff the XD tokens against this file and report changes.',
                    },
                    output_scss_path: {
                        type: 'string',
                        description: 'Optional. If provided along with existing_scss_path, writes the merged/updated SCSS variables file to this path.',
                    },
                },
                required: ['xd_source'],
            },
        },
        {
            name: 'fetch_from_xd_share',
            description: 'Extracts design specs from an Adobe XD share URL via the internal viewer API. Prefer get_specs instead — it routes automatically. Use this only when you specifically have an xd.adobe.com share link and want to call the share API directly.',
            inputSchema: {
                type: 'object',
                properties: {
                    xd_share_url: {
                        type: 'string',
                        description: 'The Adobe XD share URL. Example: "https://xd.adobe.com/view/abc123/grid"',
                    },
                    artboard_name: {
                        type: 'string',
                        description: 'Optional. Name of the artboard to extract specs for. Case-insensitive. If omitted, returns the list of all artboards in the share.',
                    },
                },
                required: ['xd_share_url'],
            },
        },
    ],
}));
// ─── Tool Handlers ────────────────────────────────────────────────────────────
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        let result;
        switch (name) {
            case 'get_specs':
                result = await (0, get_specs_1.getSpecs)({
                    xd_source: args?.xd_source,
                    artboard_name: args?.artboard_name,
                });
                break;
            case 'list_artboards':
                result = await (0, list_artboards_1.listArtboards)({
                    xd_source: args?.xd_source,
                });
                break;
            case 'get_artboard_specs':
                result = await (0, get_artboard_specs_1.getArtboardSpecs)({
                    xd_source: args?.xd_source,
                    artboard_name: args?.artboard_name,
                });
                break;
            case 'extract_tokens':
                result = await (0, extract_tokens_1.extractTokens)({
                    xd_source: args?.xd_source,
                    existing_scss_path: args?.existing_scss_path,
                    output_scss_path: args?.output_scss_path,
                });
                break;
            case 'fetch_from_xd_share':
                result = await (0, fetch_from_xd_share_1.fetchFromXDShare)({
                    xd_share_url: args?.xd_share_url,
                    artboard_name: args?.artboard_name,
                });
                break;
            default:
                throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
        return {
            content: [{ type: 'text', text: result }],
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof types_js_1.McpError)
            throw error;
        throw new types_js_1.McpError(types_js_1.ErrorCode.InternalError, `Tool "${name}" failed: ${message}`);
    }
});
// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error('Adobe XD MCP server running on stdio');
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map