"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchFromXDShare = fetchFromXDShare;
const node_fetch_1 = __importDefault(require("node-fetch"));
const xd_parser_1 = require("../parser/xd-parser");
// ─── URL parsing ──────────────────────────────────────────────────────────────
function extractShareId(url) {
    // Handles:
    //   https://xd.adobe.com/view/<id>/
    //   https://xd.adobe.com/view/<id>/grid
    //   https://xd.adobe.com/view/<id>/screen/<screenId>
    const match = url.match(/xd\.adobe\.com\/view\/([a-zA-Z0-9_-]+)/);
    if (!match) {
        throw new Error(`Could not extract share ID from URL: "${url}". ` +
            'Expected format: https://xd.adobe.com/view/<id>/grid');
    }
    return match[1];
}
// ─── API fetch with header spoofing ──────────────────────────────────────────
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://xd.adobe.com/',
    Origin: 'https://xd.adobe.com',
};
async function tryEndpoint(url) {
    try {
        const res = await (0, node_fetch_1.default)(url, { headers: BROWSER_HEADERS });
        if (!res.ok)
            return null;
        const text = await res.text();
        if (!text.trim().startsWith('{') && !text.trim().startsWith('['))
            return null;
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
async function fetchShareData(shareId) {
    // Try known Adobe XD share API endpoint patterns in order.
    const candidates = [
        `https://xd.adobe.com/api/share/${shareId}`,
        `https://xd.adobe.com/api/share/${shareId}/artboards`,
        `https://xd.adobe.com/api/view/${shareId}`,
        `https://xd.adobe.com/api/view/${shareId}/artboards`,
        `https://xd.adobe.com/api/v1/share/${shareId}`,
        `https://xd.adobe.com/api/v2/share/${shareId}`,
    ];
    for (const url of candidates) {
        const data = await tryEndpoint(url);
        if (data !== null)
            return data;
    }
    throw new Error(`Could not reach any Adobe XD share API endpoint for share ID "${shareId}". ` +
        'The share link may be private, expired, or Adobe may have changed their internal API. ' +
        'Try using get_artboard_specs with a direct .xd file URL instead.');
}
function extractArtboardList(data) {
    const d = data;
    // Shape 1: { artboards: [...] }
    if (Array.isArray(d['artboards'])) {
        return d['artboards'].map(normaliseArtboardMeta);
    }
    // Shape 2: { screens: [...] }
    if (Array.isArray(d['screens'])) {
        return d['screens'].map(normaliseArtboardMeta);
    }
    // Shape 3: { data: { artboards: [...] } }
    const nested = d['data'];
    if (nested && Array.isArray(nested['artboards'])) {
        return nested['artboards'].map(normaliseArtboardMeta);
    }
    // Shape 4: top-level array
    if (Array.isArray(data)) {
        return data.map(normaliseArtboardMeta);
    }
    // Shape 5: single artboard object
    if (d['id'] || d['name']) {
        return [normaliseArtboardMeta(data)];
    }
    return [];
}
function normaliseArtboardMeta(raw) {
    const r = raw;
    const size = r['size'];
    const viewportSize = r['viewportSize'];
    return {
        id: (r['id'] ?? r['uid'] ?? r['artboardId'] ?? ''),
        name: (r['name'] ?? r['title'] ?? 'Untitled'),
        width: (size?.['width'] ?? viewportSize?.['width'] ?? r['width'] ?? 0),
        height: (size?.['height'] ?? viewportSize?.['height'] ?? r['height'] ?? 0),
        nodes: r['nodes'] ??
            r['children'] ??
            r['elements'] ??
            [],
    };
}
// ─── Node → XDElement adapters ────────────────────────────────────────────────
function normaliseColor(raw) {
    if (!raw || typeof raw !== 'object')
        return { r: 0, g: 0, b: 0, a: 1 };
    const c = raw;
    // Packed 0xAARRGGBB integer
    if (typeof c['value'] === 'number') {
        const val = c['value'];
        return {
            r: (val >> 16) & 0xff,
            g: (val >> 8) & 0xff,
            b: val & 0xff,
            a: ((val >> 24) & 0xff) / 255,
        };
    }
    // Hex string "#rrggbb" or "#rrggbbaa"
    if (typeof c['hex'] === 'string') {
        const hex = c['hex'].replace('#', '');
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
        };
    }
    // { r, g, b, a } — values may be 0-1 or 0-255
    const r = c['r'] ?? 0;
    const g = c['g'] ?? 0;
    const b = c['b'] ?? 0;
    const a = c['a'] ?? 1;
    // Heuristic: if all channels ≤ 1 treat as 0-1 floats
    if (r <= 1 && g <= 1 && b <= 1) {
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a };
    }
    return { r, g, b, a };
}
function normaliseNode(raw) {
    const r = raw;
    // Position
    const pos = r['position'];
    const transform = r['transform'];
    const x = (pos?.['x'] ?? transform?.['e'] ?? r['x'] ?? 0);
    const y = (pos?.['y'] ?? transform?.['f'] ?? r['y'] ?? 0);
    // Size
    const size = r['size'];
    const shape = r['shape'];
    const bounds = r['bounds'];
    const width = (size?.['width'] ?? shape?.['width'] ?? bounds?.['width'] ?? r['width'] ?? 0);
    const height = (size?.['height'] ?? shape?.['height'] ?? bounds?.['height'] ?? r['height'] ?? 0);
    // Styles block (various key names)
    const styles = (r['styles'] ?? r['style'] ?? {});
    // Fills
    const fills = [];
    const rawFill = styles['fill'] ?? r['fill'];
    if (rawFill && typeof rawFill === 'object') {
        const f = rawFill;
        const type = f['type']?.toLowerCase();
        if (type === 'solid' || f['color']) {
            fills.push({ type: 'solid', color: normaliseColor(f['color'] ?? f) });
        }
    }
    // fills array style
    if (Array.isArray(r['fills'])) {
        for (const f of r['fills']) {
            const fi = f;
            if (fi['color'])
                fills.push({ type: 'solid', color: normaliseColor(fi['color']) });
        }
    }
    // Strokes
    const strokes = [];
    const rawStroke = styles['stroke'] ?? r['stroke'];
    if (rawStroke && typeof rawStroke === 'object') {
        const s = rawStroke;
        strokes.push({
            color: normaliseColor(s['color'] ?? s),
            width: (s['width'] ?? 1),
            position: (s['position'] ?? s['align'] ?? 'center'),
        });
    }
    // Shadows
    const shadows = [];
    const rawShadow = styles['shadow'] ?? r['shadow'];
    if (rawShadow) {
        const arr = Array.isArray(rawShadow) ? rawShadow : [rawShadow];
        for (const s of arr) {
            const sh = s;
            shadows.push({
                color: normaliseColor(sh['color']),
                x: (sh['x'] ?? sh['offsetX'] ?? 0),
                y: (sh['y'] ?? sh['offsetY'] ?? 0),
                blur: (sh['blur'] ?? sh['blurRadius'] ?? 0),
                spread: sh['spread'],
            });
        }
    }
    // Border radius
    let borderRadius;
    const rawR = shape?.['r'] ?? r['cornerRadius'] ?? r['borderRadius'] ?? styles['borderRadius'];
    if (rawR !== undefined) {
        borderRadius = rawR;
    }
    // Text style
    let textStyle;
    const rawText = r['text'] ?? r['textContent'];
    const rawTypo = r['typography'] ?? styles['typography'] ?? styles['text'];
    if (rawText || rawTypo) {
        const src = (rawTypo ?? rawText);
        const para = Array.isArray(src['paragraphs'])
            ? src['paragraphs'][0]
            : undefined;
        const paraObj = para;
        const line = Array.isArray(paraObj?.['lines'])
            ? paraObj['lines'][0]?.[0]
            : undefined;
        const fontFamily = (src['fontFamily'] ?? src['font'] ?? line?.['fontFamily'] ?? line?.['postscriptName'] ?? 'inherit');
        const fontSize = (src['fontSize'] ?? line?.['fontSize'] ?? 16);
        const fontWeight = (src['fontWeight'] ?? line?.['fontStyle'] ?? 400);
        const lineHeight = (src['lineHeight'] ?? line?.['lineHeight']);
        const charSpacing = (src['charSpacing'] ?? line?.['charSpacing']);
        const textAlign = (src['textAlign'] ?? src['align'] ?? paraObj?.['align']);
        const colorRaw = src['color'] ?? line?.['color'];
        textStyle = {
            fontFamily,
            fontSize,
            fontWeight,
            lineHeight,
            letterSpacing: charSpacing !== undefined ? charSpacing / 1000 : undefined,
            textAlign,
            color: colorRaw ? normaliseColor(colorRaw) : undefined,
        };
    }
    // Children
    const rawChildren = r['nodes'] ??
        r['children'] ??
        r['elements'] ??
        [];
    return {
        id: (r['id'] ?? r['uid'] ?? ''),
        name: (r['name'] ?? r['title'] ?? 'unnamed'),
        type: (r['type'] ?? r['nodeType'] ?? 'unknown'),
        visible: r['visible'] !== false && r['hidden'] !== true,
        x,
        y,
        width,
        height,
        fills,
        strokes,
        shadows,
        borderRadius,
        opacity: (r['opacity'] ?? styles['opacity'] ?? 1),
        textStyle,
        children: rawChildren.map(normaliseNode),
    };
}
// ─── Spec builder (mirrors get-artboard-specs.ts logic) ──────────────────────
function buildSpecsFromNodes(artboardName, width, height, nodes) {
    const colors = [];
    const typography = [];
    const spacing = [];
    const borders = [];
    const shadows = [];
    const elements = [];
    collectFromNodes(nodes, colors, typography, spacing, borders, shadows, elements);
    const seenColors = new Set();
    const uniqueColors = colors.filter((c) => {
        const key = `${c.hex}-${c.role}-${c.elementName}`;
        if (seenColors.has(key))
            return false;
        seenColors.add(key);
        return true;
    });
    return {
        name: artboardName,
        dimensions: { width, height },
        colors: uniqueColors,
        typography,
        spacing,
        borders,
        shadows,
        elements,
    };
}
function collectFromNodes(nodes, colors, typography, spacing, borders, shadows, elements) {
    for (const node of nodes) {
        if (!node.visible)
            continue;
        const elSpec = {
            name: node.name,
            type: node.type,
            dimensions: { width: Math.round(node.width), height: Math.round(node.height) },
            position: { x: Math.round(node.x), y: Math.round(node.y) },
            fills: [],
            opacity: node.opacity,
        };
        if (node.borderRadius !== undefined) {
            elSpec.borderRadius = (0, xd_parser_1.borderRadiusToCSS)(node.borderRadius);
        }
        for (const fill of node.fills) {
            if (fill.type === 'solid' && fill.color) {
                const hex = (0, xd_parser_1.colorToHex)(fill.color);
                const rgba = (0, xd_parser_1.colorToRGBA)(fill.color);
                colors.push({ elementName: node.name, role: 'fill', hex, rgba, opacity: fill.color.a ?? 1 });
                elSpec.fills.push(hex);
            }
        }
        for (const stroke of node.strokes) {
            const hex = (0, xd_parser_1.colorToHex)(stroke.color);
            colors.push({
                elementName: node.name,
                role: 'stroke',
                hex,
                rgba: (0, xd_parser_1.colorToRGBA)(stroke.color),
                opacity: stroke.color.a ?? 1,
            });
            borders.push({
                elementName: node.name,
                color: hex,
                width: stroke.width,
                position: stroke.position,
                borderRadius: elSpec.borderRadius,
            });
        }
        for (const shadow of node.shadows) {
            const css = (0, xd_parser_1.shadowToCSS)(shadow);
            shadows.push({ elementName: node.name, cssValue: css });
        }
        if (node.textStyle) {
            const ts = node.textStyle;
            const entry = {
                elementName: node.name,
                fontFamily: ts.fontFamily,
                fontSize: ts.fontSize,
                fontWeight: ts.fontWeight,
                lineHeight: ts.lineHeight,
                letterSpacing: ts.letterSpacing,
                textAlign: ts.textAlign,
            };
            if (ts.color) {
                const hex = (0, xd_parser_1.colorToHex)(ts.color);
                entry.color = hex;
                colors.push({
                    elementName: node.name,
                    role: 'text',
                    hex,
                    rgba: (0, xd_parser_1.colorToRGBA)(ts.color),
                    opacity: ts.color.a ?? 1,
                });
            }
            typography.push(entry);
        }
        spacing.push({
            elementName: node.name,
            x: Math.round(node.x),
            y: Math.round(node.y),
            width: Math.round(node.width),
            height: Math.round(node.height),
        });
        elements.push(elSpec);
        if (node.children.length) {
            collectFromNodes(node.children, colors, typography, spacing, borders, shadows, elements);
        }
    }
}
// ─── Output formatting (mirrors get-artboard-specs.ts) ───────────────────────
function formatSpecs(specs) {
    const lines = [];
    lines.push(`# Artboard Specs: ${specs.name}`);
    lines.push(`Dimensions: ${specs.dimensions.width}px × ${specs.dimensions.height}px`);
    lines.push('');
    lines.push('## Colors');
    if (specs.colors.length === 0) {
        lines.push('None found.');
    }
    else {
        const fills = specs.colors.filter((c) => c.role === 'fill');
        const strokes = specs.colors.filter((c) => c.role === 'stroke');
        const texts = specs.colors.filter((c) => c.role === 'text');
        if (fills.length) {
            lines.push('### Fill Colors');
            for (const c of fills) {
                const opStr = c.opacity < 1 ? ` (opacity: ${c.opacity.toFixed(2)})` : '';
                lines.push(`  ${c.elementName}: ${c.hex} / ${c.rgba}${opStr}`);
            }
        }
        if (texts.length) {
            lines.push('### Text Colors');
            for (const c of texts)
                lines.push(`  ${c.elementName}: ${c.hex} / ${c.rgba}`);
        }
        if (strokes.length) {
            lines.push('### Stroke/Border Colors');
            for (const c of strokes)
                lines.push(`  ${c.elementName}: ${c.hex} / ${c.rgba}`);
        }
    }
    lines.push('');
    lines.push('## Typography');
    if (specs.typography.length === 0) {
        lines.push('None found.');
    }
    else {
        for (const t of specs.typography) {
            lines.push(`### ${t.elementName}`);
            lines.push(`  font-family: ${t.fontFamily}`);
            lines.push(`  font-size: ${t.fontSize}px`);
            lines.push(`  font-weight: ${t.fontWeight}`);
            if (t.lineHeight)
                lines.push(`  line-height: ${t.lineHeight}px`);
            if (t.letterSpacing !== undefined)
                lines.push(`  letter-spacing: ${t.letterSpacing}em`);
            if (t.textAlign)
                lines.push(`  text-align: ${t.textAlign}`);
            if (t.color)
                lines.push(`  color: ${t.color}`);
        }
    }
    lines.push('');
    lines.push('## Borders & Border Radius');
    if (specs.borders.length === 0) {
        lines.push('None found.');
    }
    else {
        for (const b of specs.borders) {
            lines.push(`### ${b.elementName}`);
            lines.push(`  border: ${b.width}px ${b.color} (position: ${b.position})`);
            if (b.borderRadius)
                lines.push(`  border-radius: ${b.borderRadius}`);
        }
    }
    const radiiOnly = specs.elements.filter((e) => e.borderRadius && !specs.borders.find((b) => b.elementName === e.name));
    for (const e of radiiOnly) {
        lines.push(`### ${e.name} (radius only)`);
        lines.push(`  border-radius: ${e.borderRadius}`);
    }
    lines.push('');
    lines.push('## Shadows');
    if (specs.shadows.length === 0) {
        lines.push('None found.');
    }
    else {
        for (const s of specs.shadows) {
            lines.push(`  ${s.elementName}: box-shadow: ${s.cssValue}`);
        }
    }
    lines.push('');
    lines.push('## Layout & Spacing');
    lines.push('Element positions and dimensions (relative to artboard):');
    for (const s of specs.spacing) {
        lines.push(`  ${s.elementName}: x=${s.x}px, y=${s.y}px, w=${s.width}px, h=${s.height}px`);
    }
    lines.push('');
    lines.push('## Suggested SCSS Variables');
    lines.push('```scss');
    lines.push(`// ${specs.name} - extracted from XD share`);
    const seenHex = new Set();
    let ci = 1;
    for (const c of specs.colors) {
        if (!seenHex.has(c.hex)) {
            seenHex.add(c.hex);
            lines.push(`$color-${ci++}: ${c.hex};`);
        }
    }
    for (const t of specs.typography) {
        const safe = t.elementName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        lines.push(`$font-family-${safe}: '${t.fontFamily}';`);
        lines.push(`$font-size-${safe}: ${t.fontSize}px;`);
        lines.push(`$font-weight-${safe}: ${t.fontWeight};`);
        if (t.lineHeight)
            lines.push(`$line-height-${safe}: ${t.lineHeight}px;`);
        if (t.letterSpacing !== undefined)
            lines.push(`$letter-spacing-${safe}: ${t.letterSpacing}em;`);
    }
    for (const s of specs.shadows) {
        const safe = s.elementName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        lines.push(`$shadow-${safe}: ${s.cssValue};`);
    }
    lines.push('```');
    return lines.join('\n');
}
// ─── Public tool function ─────────────────────────────────────────────────────
async function fetchFromXDShare(input) {
    const { xd_share_url, artboard_name } = input;
    const shareId = extractShareId(xd_share_url);
    const data = await fetchShareData(shareId);
    const artboards = extractArtboardList(data);
    if (artboards.length === 0) {
        return (`No artboard data found in the API response for share ID "${shareId}".\n\n` +
            'The Adobe XD share API may have changed or the link may require authentication.\n' +
            'Try downloading the .xd file and using get_artboard_specs with a local path instead.');
    }
    // No artboard_name → list mode (mirrors list_artboards behaviour)
    if (!artboard_name) {
        const lines = [
            `Found ${artboards.length} artboard(s) in XD share ${shareId}:`,
            '',
            ...artboards.map((a, i) => `${i + 1}. ${a.name}`),
            '',
            'Use fetch_from_xd_share with artboard_name set to one of these to extract styling details.',
        ];
        return lines.join('\n');
    }
    // Find matching artboard (case-insensitive, contains fallback)
    const nameLower = artboard_name.toLowerCase();
    let match = artboards.find((a) => a.name.toLowerCase() === nameLower) ??
        artboards.find((a) => a.name.toLowerCase().includes(nameLower) ||
            nameLower.includes(a.name.toLowerCase()));
    if (!match) {
        const available = artboards.map((a) => `  - ${a.name}`).join('\n');
        return `Artboard "${artboard_name}" not found.\n\nAvailable artboards:\n${available}`;
    }
    const nodes = (match.nodes ?? []).map(normaliseNode);
    const specs = buildSpecsFromNodes(match.name, match.width, match.height, nodes);
    return formatSpecs(specs);
}
//# sourceMappingURL=fetch-from-xd-share.js.map