"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSpecs = getSpecs;
const fetch_from_xd_share_1 = require("./fetch-from-xd-share");
const get_artboard_specs_1 = require("./get-artboard-specs");
const list_artboards_1 = require("./list-artboards");
function detectSourceType(xd_source) {
    if (xd_source.startsWith('https://xd.adobe.com/view/'))
        return 'xd-share';
    if (xd_source.startsWith('http://') || xd_source.startsWith('https://'))
        return 'remote-file';
    return 'local-file'; // handles /, ./, C:\, relative paths
}
async function getSpecs(input) {
    const { xd_source, artboard_name } = input;
    const sourceType = detectSourceType(xd_source);
    if (sourceType === 'xd-share') {
        // fetchFromXDShare handles both list mode (no artboard_name) and spec mode
        return (0, fetch_from_xd_share_1.fetchFromXDShare)({ xd_share_url: xd_source, artboard_name });
    }
    // Remote file URL or local file path — use the .xd ZIP parser
    if (!artboard_name) {
        return (0, list_artboards_1.listArtboards)({ xd_source });
    }
    return (0, get_artboard_specs_1.getArtboardSpecs)({ xd_source, artboard_name });
}
//# sourceMappingURL=get-specs.js.map