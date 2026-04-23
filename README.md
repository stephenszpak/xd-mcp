# xd-mcp

A custom MCP server for extracting styling specifications and design tokens from Adobe XD files — built for use in Cursor to keep existing component styles in sync with your XD designs.

## What it does

This MCP exposes three tools to Cursor's AI:

| Tool | What it does |
|---|---|
| `list_artboards` | Lists all artboards in the XD file by name |
| `get_artboard_specs` | Returns full styling details for a named artboard (colors, typography, borders, shadows, spacing) |
| `extract_tokens` | Extracts global design tokens across all artboards, with optional diff against your existing SCSS variables file |

## Setup

### 1. Clone and build

```bash
git clone <your-repo-url> xd-mcp
cd xd-mcp
npm install
npm run build
```

### 2. Add to Cursor

Open Cursor settings → MCP → Add server, or edit your `~/.cursor/mcp.json` directly:

```json
{
  "mcpServers": {
    "adobe-xd": {
      "command": "node",
      "args": ["/absolute/path/to/xd-mcp/dist/index.js"]
    }
  }
}
```

Restart Cursor after saving.

## Usage in Cursor

### List artboards
Ask Cursor:
> "List all artboards in the XD file at https://example.com/design.xd"

### Get specs for a specific component
> "Get the styling specs for the Search Bar artboard from https://example.com/design.xd"

Returns:
- All colors (hex + rgba) used in the artboard, grouped by fill / text / stroke
- Typography: font family, size, weight, line-height, letter-spacing for every text element
- Borders and border-radius values
- Box shadows as ready-to-use CSS values
- Element dimensions and positions
- A ready-to-paste SCSS variables snippet

### Update existing component styles
> "Update the SearchBar component SCSS to match the XD specs for the Search Bar artboard from https://example.com/design.xd"

Cursor will use `get_artboard_specs` and apply the changes to your existing `.scss` file.

### Sync design tokens with your SCSS variables file
> "Extract design tokens from https://example.com/design.xd and diff them against src/styles/_variables.scss"

Returns a diff showing:
- Variables that have changed (with old and new values)
- New tokens in XD not yet in your SCSS
- SCSS variables not found in XD (candidates for removal)

With an output path:
> "Extract tokens from the XD file and write the updated variables to src/styles/_variables.scss"

## XD File Sources

Both URL and local file paths are supported:

```
https://sharepoint.example.com/design.xd
/Users/you/projects/design-system/design.xd
./design.xd
```

## Project Structure

```
src/
├── index.ts                  # MCP server entry point + tool definitions
├── tools/
│   ├── list-artboards.ts     # list_artboards tool
│   ├── get-artboard-specs.ts # get_artboard_specs tool
│   └── extract-tokens.ts     # extract_tokens tool
├── parser/
│   ├── xd-parser.ts          # Core XD ZIP parser
│   └── types.ts              # Shared TypeScript types
└── utils/
    ├── fetch-xd.ts           # URL + local file fetching
    └── scss-diff.ts          # SCSS variable diffing logic
```

## Development

```bash
npm run dev   # watch mode
npm run build # production build
```

## Notes

- XD files are ZIP archives. This parser reads the internal JSON directly — no Adobe XD application required.
- Artboard name matching is case-insensitive with a fuzzy fallback (partial match).
- The SCSS diff compares `$variable-name: value;` declarations. It handles `!default` flags.
