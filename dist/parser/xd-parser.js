"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.XDParser = void 0;
exports.colorToHex = colorToHex;
exports.colorToRGBA = colorToRGBA;
exports.shadowToCSS = shadowToCSS;
exports.borderRadiusToCSS = borderRadiusToCSS;
const adm_zip_1 = __importDefault(require("adm-zip"));
class XDParser {
    constructor(buffer) {
        this.zip = new adm_zip_1.default(buffer);
    }
    /**
     * Returns all artboard names and IDs from the manifest.
     */
    listArtboards() {
        const manifest = this.getManifest();
        return this.extractArtboardsFromManifest(manifest);
    }
    /**
     * Parses a specific artboard by name (case-insensitive, fuzzy fallback).
     */
    getArtboard(name) {
        const manifest = this.getManifest();
        const artboards = this.extractArtboardsFromManifest(manifest);
        // Exact match first (case-insensitive)
        let found = artboards.find((a) => a.name.toLowerCase() === name.toLowerCase());
        // Fuzzy: contains match
        if (!found) {
            found = artboards.find((a) => a.name.toLowerCase().includes(name.toLowerCase()) ||
                name.toLowerCase().includes(a.name.toLowerCase()));
        }
        if (!found)
            return null;
        return this.parseArtboard(found);
    }
    /**
     * Extracts global design tokens from all artboards.
     */
    extractGlobalTokens() {
        const manifest = this.getManifest();
        const artboards = this.extractArtboardsFromManifest(manifest);
        const colors = new Map();
        const typographyMap = new Map();
        const spacingSet = new Set();
        const shadows = new Map();
        // Also try to read resources/graphics/graphicContent.agc for global swatches
        try {
            const swatches = this.getColorSwatches();
            swatches.forEach(({ name, hex }) => {
                const key = sanitizeTokenName(name);
                colors.set(key, hex);
            });
        }
        catch {
            // Not all XD files have this resource
        }
        for (const artboardMeta of artboards) {
            try {
                const artboard = this.parseArtboard(artboardMeta);
                this.collectTokensFromElements(artboard.children, colors, typographyMap, spacingSet, shadows);
            }
            catch {
                // Skip artboards that fail to parse
            }
        }
        return {
            colors: Object.fromEntries(colors),
            typography: Object.fromEntries(typographyMap),
            spacing: Array.from(spacingSet).sort((a, b) => a - b),
            shadows: Object.fromEntries(shadows),
        };
    }
    // ─── Private helpers ──────────────────────────────────────────────────────
    getManifest() {
        const entry = this.zip.getEntry('manifest');
        if (!entry)
            throw new Error('Invalid XD file: manifest not found');
        return JSON.parse(entry.getData().toString('utf-8'));
    }
    extractArtboardsFromManifest(manifest) {
        const m = manifest;
        const children = m['children'] || [];
        const results = [];
        for (const child of children) {
            const c = child;
            if (c['name'] === 'artwork') {
                const artworkChildren = c['children'] || [];
                for (const artworkChild of artworkChildren) {
                    const ac = artworkChild;
                    if (ac['name'] === 'pasteboard') {
                        const pasteboardChildren = ac['children'] || [];
                        for (const artboard of pasteboardChildren) {
                            const ab = artboard;
                            if (ab['path'] && ab['name'] && ab['id']) {
                                results.push({
                                    id: ab['id'],
                                    name: ab['name'],
                                    path: ab['path'],
                                });
                            }
                        }
                    }
                }
            }
        }
        return results;
    }
    parseArtboard(meta) {
        const entryPath = `${meta.path}`;
        const entry = this.zip.getEntry(entryPath) ||
            this.zip.getEntry(`${entryPath}.json`);
        if (!entry) {
            throw new Error(`Artboard file not found in XD zip: ${entryPath}`);
        }
        const data = JSON.parse(entry.getData().toString('utf-8'));
        const artboardNode = data;
        const width = artboardNode.artboard?.width || artboardNode.shape?.width || 0;
        const height = artboardNode.artboard?.height || artboardNode.shape?.height || 0;
        return {
            id: meta.id,
            name: meta.name,
            width,
            height,
            background: artboardNode.artboard?.fill
                ? this.parseFill(artboardNode.artboard.fill)
                : undefined,
            children: this.parseChildren(artboardNode.children || []),
        };
    }
    parseChildren(nodes) {
        return nodes.map((node) => this.parseElement(node)).filter(Boolean);
    }
    parseElement(node) {
        const transform = node.transform || { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        const x = transform.e || 0;
        const y = transform.f || 0;
        const width = node.shape?.width || node.text?.frame?.width || 0;
        const height = node.shape?.height || node.text?.frame?.height || 0;
        const element = {
            id: node.id || '',
            name: node.name || 'unnamed',
            type: node.type || 'unknown',
            visible: node.visible !== false,
            x,
            y,
            width,
            height,
            opacity: node.style?.opacity !== undefined ? node.style.opacity : 1,
            children: node.children ? this.parseChildren(node.children) : [],
        };
        if (node.style?.fill) {
            element.fills = [this.parseFill(node.style.fill)];
        }
        if (node.style?.stroke) {
            element.strokes = [this.parseStroke(node.style.stroke)];
        }
        if (node.style?.shadow) {
            element.shadows = this.parseShadows(node.style.shadow);
        }
        if (node.shape?.r !== undefined) {
            element.borderRadius = node.shape.r;
        }
        if (node.text) {
            element.textStyle = this.parseTextStyle(node.text);
        }
        return element;
    }
    parseFill(fill) {
        const f = fill;
        const type = f['type'] || 'none';
        if (type === 'solid' && f['color']) {
            return { type: 'solid', color: this.parseColor(f['color']) };
        }
        if (type === 'gradient' && f['gradient']) {
            const g = f['gradient'];
            const stops = (g['stops'] || []).map((s) => {
                const stop = s;
                return {
                    color: this.parseColor(stop['color']),
                    position: stop['offset'] || 0,
                };
            });
            return { type: 'gradient', gradient: { type: g['type'] || 'linear', stops } };
        }
        return { type: 'none' };
    }
    parseStroke(stroke) {
        const s = stroke;
        return {
            color: this.parseColor(s['color']),
            width: s['width'] || 1,
            position: s['align'] || 'center',
            dash: s['dash'],
        };
    }
    parseShadows(shadow) {
        const arr = Array.isArray(shadow) ? shadow : [shadow];
        return arr.map((s) => {
            const sh = s;
            return {
                color: this.parseColor(sh['color']),
                x: sh['x'] || 0,
                y: sh['y'] || 0,
                blur: sh['blur'] || 0,
                spread: sh['spread'],
            };
        });
    }
    parseColor(color) {
        const c = color;
        // XD stores colors as { value: 0xAARRGGBB } or { r, g, b, a }
        if (typeof c['value'] === 'number') {
            const val = c['value'];
            const a = ((val >> 24) & 0xff) / 255;
            const r = (val >> 16) & 0xff;
            const g = (val >> 8) & 0xff;
            const b = val & 0xff;
            return { r, g, b, a };
        }
        return {
            r: c['r'] || 0,
            g: c['g'] || 0,
            b: c['b'] || 0,
            a: c['a'] !== undefined ? c['a'] : 1,
        };
    }
    parseTextStyle(text) {
        if (!text)
            return { fontFamily: 'inherit', fontSize: 16, fontWeight: 400 };
        const para = text.paragraphs?.[0];
        const line = para?.lines?.[0]?.[0];
        if (!line)
            return { fontFamily: 'inherit', fontSize: 16, fontWeight: 400 };
        const style = {
            fontFamily: line.fontFamily || line.postscriptName || 'inherit',
            fontSize: line.fontSize || 16,
            fontWeight: extractFontWeight(line.fontStyle || ''),
            fontStyle: line.fontStyle,
            lineHeight: line.lineHeight,
            letterSpacing: line.charSpacing !== undefined ? line.charSpacing / 1000 : undefined,
            textAlign: para?.align,
            textTransform: line.textTransform,
            textDecoration: line.underline ? 'underline' : line.strikeThrough ? 'line-through' : undefined,
        };
        if (line.color?.value !== undefined) {
            style.color = this.parseColor(line.color);
        }
        return style;
    }
    getColorSwatches() {
        const entry = this.zip.getEntry('resources/graphics/graphicContent.agc') ||
            this.zip.getEntry('resources/swatches.json');
        if (!entry)
            return [];
        const data = JSON.parse(entry.getData().toString('utf-8'));
        const swatches = [];
        const children = data['children'] || [];
        for (const child of children) {
            const c = child;
            if (c['type'] === 'color' && c['name'] && c['style']) {
                const style = c['style'];
                const fill = style['fill'];
                if (fill?.['color']) {
                    const color = this.parseColor(fill['color']);
                    swatches.push({
                        name: c['name'],
                        hex: colorToHex(color),
                    });
                }
            }
        }
        return swatches;
    }
    collectTokensFromElements(elements, colors, typography, spacing, shadows) {
        for (const el of elements) {
            // Colors from fills
            for (const fill of el.fills || []) {
                if (fill.type === 'solid' && fill.color) {
                    const hex = colorToHex(fill.color);
                    const key = sanitizeTokenName(`color-${hex.replace('#', '')}`);
                    colors.set(key, hex);
                }
            }
            // Colors from strokes
            for (const stroke of el.strokes || []) {
                const hex = colorToHex(stroke.color);
                const key = sanitizeTokenName(`color-${hex.replace('#', '')}`);
                colors.set(key, hex);
            }
            // Typography
            if (el.textStyle) {
                const ts = el.textStyle;
                const key = sanitizeTokenName(`${ts.fontFamily}-${ts.fontSize}-${ts.fontWeight}`);
                typography.set(key, {
                    fontFamily: ts.fontFamily,
                    fontSize: ts.fontSize,
                    fontWeight: ts.fontWeight,
                    lineHeight: ts.lineHeight,
                    letterSpacing: ts.letterSpacing,
                });
                if (ts.color) {
                    const hex = colorToHex(ts.color);
                    colors.set(sanitizeTokenName(`color-${hex.replace('#', '')}`), hex);
                }
            }
            // Spacing from dimensions
            [el.width, el.height, el.paddingTop, el.paddingRight, el.paddingBottom, el.paddingLeft]
                .filter((v) => v !== undefined && v > 0)
                .forEach((v) => spacing.add(Math.round(v)));
            // Shadows
            for (const shadow of el.shadows || []) {
                const css = shadowToCSS(shadow);
                const key = sanitizeTokenName(`shadow-${el.name}`);
                shadows.set(key, css);
            }
            // Recurse
            if (el.children?.length) {
                this.collectTokensFromElements(el.children, colors, typography, spacing, shadows);
            }
        }
    }
}
exports.XDParser = XDParser;
// ─── Color helpers ────────────────────────────────────────────────────────────
function colorToHex(color) {
    const r = Math.round(color.r).toString(16).padStart(2, '0');
    const g = Math.round(color.g).toString(16).padStart(2, '0');
    const b = Math.round(color.b).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`.toUpperCase();
}
function colorToRGBA(color) {
    const a = color.a !== undefined ? color.a : 1;
    if (a === 1)
        return `rgb(${color.r}, ${color.g}, ${color.b})`;
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${a.toFixed(2)})`;
}
function shadowToCSS(shadow) {
    const color = colorToRGBA(shadow.color);
    const spread = shadow.spread !== undefined ? ` ${shadow.spread}px` : '';
    return `${shadow.x}px ${shadow.y}px ${shadow.blur}px${spread} ${color}`;
}
function borderRadiusToCSS(r) {
    if (Array.isArray(r))
        return r.map((v) => `${v}px`).join(' ');
    return `${r}px`;
}
function sanitizeTokenName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}
function extractFontWeight(fontStyle) {
    const style = fontStyle.toLowerCase();
    if (style.includes('thin'))
        return 100;
    if (style.includes('extralight') || style.includes('ultra-light'))
        return 200;
    if (style.includes('light'))
        return 300;
    if (style.includes('medium'))
        return 500;
    if (style.includes('semibold') || style.includes('demi'))
        return 600;
    if (style.includes('extrabold') || style.includes('ultra-bold'))
        return 800;
    if (style.includes('black') || style.includes('heavy'))
        return 900;
    if (style.includes('bold'))
        return 700;
    return 400;
}
//# sourceMappingURL=xd-parser.js.map