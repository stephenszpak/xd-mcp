"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getArtboardSpecs = getArtboardSpecs;
const fetch_xd_1 = require("../utils/fetch-xd");
const xd_parser_1 = require("../parser/xd-parser");
async function getArtboardSpecs(input) {
    const { xd_source, artboard_name } = input;
    const buffer = await (0, fetch_xd_1.fetchXDFile)(xd_source);
    const parser = new xd_parser_1.XDParser(buffer);
    const artboard = parser.getArtboard(artboard_name);
    if (!artboard) {
        const all = parser.listArtboards().map((a) => `  - ${a.name}`).join('\n');
        return `Artboard "${artboard_name}" not found.\n\nAvailable artboards:\n${all}`;
    }
    const specs = buildSpecs(artboard);
    return formatSpecs(specs);
}
function buildSpecs(artboard) {
    const colors = [];
    const typography = [];
    const spacing = [];
    const borders = [];
    const shadows = [];
    const elements = [];
    collectFromElements(artboard.children, colors, typography, spacing, borders, shadows, elements);
    // Deduplicate colors by hex+role
    const seenColors = new Set();
    const uniqueColors = colors.filter((c) => {
        const key = `${c.hex}-${c.role}-${c.elementName}`;
        if (seenColors.has(key))
            return false;
        seenColors.add(key);
        return true;
    });
    return {
        name: artboard.name,
        dimensions: { width: artboard.width, height: artboard.height },
        colors: uniqueColors,
        typography,
        spacing,
        borders,
        shadows,
        elements,
    };
}
function collectFromElements(elements, colors, typography, spacing, borders, shadows, elementSpecs) {
    for (const el of elements) {
        if (!el.visible)
            continue;
        const elSpec = {
            name: el.name,
            type: el.type,
            dimensions: { width: Math.round(el.width), height: Math.round(el.height) },
            position: { x: Math.round(el.x), y: Math.round(el.y) },
            fills: [],
            opacity: el.opacity ?? 1,
        };
        // Border radius
        if (el.borderRadius !== undefined) {
            elSpec.borderRadius = (0, xd_parser_1.borderRadiusToCSS)(el.borderRadius);
        }
        // Fills → colors
        for (const fill of el.fills || []) {
            if (fill.type === 'solid' && fill.color) {
                const hex = (0, xd_parser_1.colorToHex)(fill.color);
                const rgba = (0, xd_parser_1.colorToRGBA)(fill.color);
                colors.push({ elementName: el.name, role: 'fill', hex, rgba, opacity: fill.color.a ?? 1 });
                elSpec.fills.push(hex);
            }
            else if (fill.type === 'gradient' && fill.gradient) {
                const stops = fill.gradient.stops
                    .map((s) => `${(0, xd_parser_1.colorToHex)(s.color)} ${Math.round(s.position * 100)}%`)
                    .join(', ');
                const css = fill.gradient.type === 'radial'
                    ? `radial-gradient(${stops})`
                    : `linear-gradient(${stops})`;
                elSpec.fills.push(css);
            }
        }
        // Strokes → borders + colors
        for (const stroke of el.strokes || []) {
            const hex = (0, xd_parser_1.colorToHex)(stroke.color);
            colors.push({
                elementName: el.name,
                role: 'stroke',
                hex,
                rgba: (0, xd_parser_1.colorToRGBA)(stroke.color),
                opacity: stroke.color.a ?? 1,
            });
            borders.push({
                elementName: el.name,
                color: hex,
                width: stroke.width,
                position: stroke.position,
                borderRadius: elSpec.borderRadius,
            });
        }
        // Shadows
        for (const shadow of el.shadows || []) {
            const css = (0, xd_parser_1.shadowToCSS)(shadow);
            shadows.push({ elementName: el.name, cssValue: css });
        }
        // Typography
        if (el.textStyle) {
            const ts = el.textStyle;
            const entry = {
                elementName: el.name,
                fontFamily: ts.fontFamily,
                fontSize: ts.fontSize,
                fontWeight: ts.fontWeight,
                lineHeight: ts.lineHeight,
                letterSpacing: ts.letterSpacing,
                textAlign: ts.textAlign,
                textTransform: ts.textTransform,
            };
            if (ts.color) {
                const hex = (0, xd_parser_1.colorToHex)(ts.color);
                entry.color = hex;
                colors.push({
                    elementName: el.name,
                    role: 'text',
                    hex,
                    rgba: (0, xd_parser_1.colorToRGBA)(ts.color),
                    opacity: ts.color.a ?? 1,
                });
            }
            typography.push(entry);
        }
        // Spacing
        spacing.push({
            elementName: el.name,
            x: Math.round(el.x),
            y: Math.round(el.y),
            width: Math.round(el.width),
            height: Math.round(el.height),
            paddingTop: el.paddingTop,
            paddingRight: el.paddingRight,
            paddingBottom: el.paddingBottom,
            paddingLeft: el.paddingLeft,
        });
        elementSpecs.push(elSpec);
        // Recurse
        if (el.children?.length) {
            collectFromElements(el.children, colors, typography, spacing, borders, shadows, elementSpecs);
        }
    }
}
function formatSpecs(specs) {
    const lines = [];
    lines.push(`# Artboard Specs: ${specs.name}`);
    lines.push(`Dimensions: ${specs.dimensions.width}px × ${specs.dimensions.height}px`);
    lines.push('');
    // ── Colors ──────────────────────────────────────────────────────────────
    lines.push('## Colors');
    if (specs.colors.length === 0) {
        lines.push('None found.');
    }
    else {
        // Group by role
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
            for (const c of texts) {
                lines.push(`  ${c.elementName}: ${c.hex} / ${c.rgba}`);
            }
        }
        if (strokes.length) {
            lines.push('### Stroke/Border Colors');
            for (const c of strokes) {
                lines.push(`  ${c.elementName}: ${c.hex} / ${c.rgba}`);
            }
        }
    }
    lines.push('');
    // ── Typography ──────────────────────────────────────────────────────────
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
            if (t.textTransform)
                lines.push(`  text-transform: ${t.textTransform}`);
            if (t.color)
                lines.push(`  color: ${t.color}`);
        }
    }
    lines.push('');
    // ── Borders ──────────────────────────────────────────────────────────────
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
    // Also list border-radius on non-bordered elements
    const radiiOnly = specs.elements.filter((e) => e.borderRadius && !specs.borders.find((b) => b.elementName === e.name));
    for (const e of radiiOnly) {
        lines.push(`### ${e.name} (radius only)`);
        lines.push(`  border-radius: ${e.borderRadius}`);
    }
    lines.push('');
    // ── Shadows ──────────────────────────────────────────────────────────────
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
    // ── Layout & Spacing ─────────────────────────────────────────────────────
    lines.push('## Layout & Spacing');
    lines.push('Element positions and dimensions (relative to artboard):');
    for (const s of specs.spacing) {
        lines.push(`  ${s.elementName}: x=${s.x}px, y=${s.y}px, w=${s.width}px, h=${s.height}px`);
        if (s.paddingTop !== undefined) {
            lines.push(`    padding: ${s.paddingTop}px ${s.paddingRight ?? 0}px ${s.paddingBottom ?? 0}px ${s.paddingLeft ?? 0}px`);
        }
    }
    lines.push('');
    // ── SCSS Snippet ─────────────────────────────────────────────────────────
    lines.push('## Suggested SCSS Variables');
    lines.push('```scss');
    lines.push(`// ${specs.name} - extracted from XD`);
    const seenColors = new Set();
    let colorIndex = 1;
    for (const c of specs.colors) {
        if (!seenColors.has(c.hex)) {
            seenColors.add(c.hex);
            lines.push(`$color-${colorIndex++}: ${c.hex};`);
        }
    }
    for (const t of specs.typography) {
        const safeName = t.elementName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        lines.push(`$font-family-${safeName}: '${t.fontFamily}';`);
        lines.push(`$font-size-${safeName}: ${t.fontSize}px;`);
        lines.push(`$font-weight-${safeName}: ${t.fontWeight};`);
        if (t.lineHeight)
            lines.push(`$line-height-${safeName}: ${t.lineHeight}px;`);
        if (t.letterSpacing !== undefined)
            lines.push(`$letter-spacing-${safeName}: ${t.letterSpacing}em;`);
    }
    for (const s of specs.shadows) {
        const safeName = s.elementName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        lines.push(`$shadow-${safeName}: ${s.cssValue};`);
    }
    lines.push('```');
    return lines.join('\n');
}
//# sourceMappingURL=get-artboard-specs.js.map