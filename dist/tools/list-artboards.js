"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listArtboards = listArtboards;
const fetch_xd_1 = require("../utils/fetch-xd");
const xd_parser_1 = require("../parser/xd-parser");
async function listArtboards(input) {
    const { xd_source } = input;
    const buffer = await (0, fetch_xd_1.fetchXDFile)(xd_source);
    const parser = new xd_parser_1.XDParser(buffer);
    const artboards = parser.listArtboards();
    if (artboards.length === 0) {
        return 'No artboards found in this XD file.';
    }
    const lines = [
        `Found ${artboards.length} artboard(s) in the XD file:`,
        '',
        ...artboards.map((a, i) => `${i + 1}. ${a.name}`),
        '',
        'Use `get_artboard_specs` with any of these names to extract styling details.',
    ];
    return lines.join('\n');
}
//# sourceMappingURL=list-artboards.js.map