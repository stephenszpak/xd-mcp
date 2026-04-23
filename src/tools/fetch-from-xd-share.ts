import fetch from 'node-fetch';
import {
  colorToHex,
  colorToRGBA,
  shadowToCSS,
  borderRadiusToCSS,
} from '../parser/xd-parser';
import {
  XDColor,
  ArtboardSpecs,
  ColorSpec,
  TypographySpec,
  SpacingSpec,
  BorderSpec,
  ShadowSpec,
  ElementSpec,
} from '../parser/types';

export interface FetchFromXDShareInput {
  xd_share_url: string;
  artboard_name?: string;
}

// ─── URL parsing ──────────────────────────────────────────────────────────────

function extractShareId(url: string): string {
  // Handles:
  //   https://xd.adobe.com/view/<id>/
  //   https://xd.adobe.com/view/<id>/grid
  //   https://xd.adobe.com/view/<id>/screen/<screenId>
  const match = url.match(/xd\.adobe\.com\/view\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    throw new Error(
      `Could not extract share ID from URL: "${url}". ` +
        'Expected format: https://xd.adobe.com/view/<id>/grid'
    );
  }
  return match[1];
}

// ─── API fetch with header spoofing ──────────────────────────────────────────

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://xd.adobe.com/',
  Origin: 'https://xd.adobe.com',
};

async function tryEndpoint(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchShareData(shareId: string): Promise<unknown> {
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
    if (data !== null) return data;
  }

  throw new Error(
    `Could not reach any Adobe XD share API endpoint for share ID "${shareId}". ` +
      'The share link may be private, expired, or Adobe may have changed their internal API. ' +
      'Try using get_artboard_specs with a direct .xd file URL instead.'
  );
}

// ─── Response shape adapters ──────────────────────────────────────────────────
// Adobe XD's viewer API uses a different JSON structure from the .xd ZIP format.
// These adapters normalise whatever the API returns into our internal types.

interface ShareArtboardMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  // raw node tree — structure varies by API version
  nodes?: unknown[];
  children?: unknown[];
  elements?: unknown[];
}

function extractArtboardList(data: unknown): ShareArtboardMeta[] {
  const d = data as Record<string, unknown>;

  // Shape 1: { artboards: [...] }
  if (Array.isArray(d['artboards'])) {
    return (d['artboards'] as unknown[]).map(normaliseArtboardMeta);
  }

  // Shape 2: { screens: [...] }
  if (Array.isArray(d['screens'])) {
    return (d['screens'] as unknown[]).map(normaliseArtboardMeta);
  }

  // Shape 3: { data: { artboards: [...] } }
  const nested = d['data'] as Record<string, unknown> | undefined;
  if (nested && Array.isArray(nested['artboards'])) {
    return (nested['artboards'] as unknown[]).map(normaliseArtboardMeta);
  }

  // Shape 4: top-level array
  if (Array.isArray(data)) {
    return (data as unknown[]).map(normaliseArtboardMeta);
  }

  // Shape 5: single artboard object
  if (d['id'] || d['name']) {
    return [normaliseArtboardMeta(data)];
  }

  return [];
}

function normaliseArtboardMeta(raw: unknown): ShareArtboardMeta {
  const r = raw as Record<string, unknown>;
  const size = r['size'] as Record<string, unknown> | undefined;
  const viewportSize = r['viewportSize'] as Record<string, unknown> | undefined;

  return {
    id: (r['id'] ?? r['uid'] ?? r['artboardId'] ?? '') as string,
    name: (r['name'] ?? r['title'] ?? 'Untitled') as string,
    width: ((size?.['width'] ?? viewportSize?.['width'] ?? r['width'] ?? 0) as number),
    height: ((size?.['height'] ?? viewportSize?.['height'] ?? r['height'] ?? 0) as number),
    nodes:
      (r['nodes'] as unknown[] | undefined) ??
      (r['children'] as unknown[] | undefined) ??
      (r['elements'] as unknown[] | undefined) ??
      [],
  };
}

// ─── Node → XDElement adapters ────────────────────────────────────────────────

function normaliseColor(raw: unknown): XDColor {
  if (!raw || typeof raw !== 'object') return { r: 0, g: 0, b: 0, a: 1 };
  const c = raw as Record<string, unknown>;

  // Packed 0xAARRGGBB integer
  if (typeof c['value'] === 'number') {
    const val = c['value'] as number;
    return {
      r: (val >> 16) & 0xff,
      g: (val >> 8) & 0xff,
      b: val & 0xff,
      a: ((val >> 24) & 0xff) / 255,
    };
  }

  // Hex string "#rrggbb" or "#rrggbbaa"
  if (typeof c['hex'] === 'string') {
    const hex = (c['hex'] as string).replace('#', '');
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }

  // { r, g, b, a } — values may be 0-1 or 0-255
  const r = (c['r'] as number) ?? 0;
  const g = (c['g'] as number) ?? 0;
  const b = (c['b'] as number) ?? 0;
  const a = (c['a'] as number) ?? 1;

  // Heuristic: if all channels ≤ 1 treat as 0-1 floats
  if (r <= 1 && g <= 1 && b <= 1) {
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a };
  }
  return { r, g, b, a };
}

interface NormNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: Array<{ type: 'solid' | 'none'; color?: XDColor }>;
  strokes: Array<{ color: XDColor; width: number; position: string }>;
  shadows: Array<{ color: XDColor; x: number; y: number; blur: number; spread?: number }>;
  borderRadius?: number | number[];
  opacity: number;
  textStyle?: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number | string;
    lineHeight?: number;
    letterSpacing?: number;
    textAlign?: string;
    color?: XDColor;
  };
  children: NormNode[];
}

function normaliseNode(raw: unknown): NormNode {
  const r = raw as Record<string, unknown>;

  // Position
  const pos = r['position'] as Record<string, unknown> | undefined;
  const transform = r['transform'] as Record<string, unknown> | undefined;
  const x = (pos?.['x'] ?? transform?.['e'] ?? r['x'] ?? 0) as number;
  const y = (pos?.['y'] ?? transform?.['f'] ?? r['y'] ?? 0) as number;

  // Size
  const size = r['size'] as Record<string, unknown> | undefined;
  const shape = r['shape'] as Record<string, unknown> | undefined;
  const bounds = r['bounds'] as Record<string, unknown> | undefined;
  const width = (size?.['width'] ?? shape?.['width'] ?? bounds?.['width'] ?? r['width'] ?? 0) as number;
  const height = (size?.['height'] ?? shape?.['height'] ?? bounds?.['height'] ?? r['height'] ?? 0) as number;

  // Styles block (various key names)
  const styles = (r['styles'] ?? r['style'] ?? {}) as Record<string, unknown>;

  // Fills
  const fills: NormNode['fills'] = [];
  const rawFill = styles['fill'] ?? r['fill'];
  if (rawFill && typeof rawFill === 'object') {
    const f = rawFill as Record<string, unknown>;
    const type = (f['type'] as string | undefined)?.toLowerCase();
    if (type === 'solid' || f['color']) {
      fills.push({ type: 'solid', color: normaliseColor(f['color'] ?? f) });
    }
  }
  // fills array style
  if (Array.isArray(r['fills'])) {
    for (const f of r['fills'] as unknown[]) {
      const fi = f as Record<string, unknown>;
      if (fi['color']) fills.push({ type: 'solid', color: normaliseColor(fi['color']) });
    }
  }

  // Strokes
  const strokes: NormNode['strokes'] = [];
  const rawStroke = styles['stroke'] ?? r['stroke'];
  if (rawStroke && typeof rawStroke === 'object') {
    const s = rawStroke as Record<string, unknown>;
    strokes.push({
      color: normaliseColor(s['color'] ?? s),
      width: (s['width'] ?? 1) as number,
      position: (s['position'] ?? s['align'] ?? 'center') as string,
    });
  }

  // Shadows
  const shadows: NormNode['shadows'] = [];
  const rawShadow = styles['shadow'] ?? r['shadow'];
  if (rawShadow) {
    const arr = Array.isArray(rawShadow) ? rawShadow : [rawShadow];
    for (const s of arr) {
      const sh = s as Record<string, unknown>;
      shadows.push({
        color: normaliseColor(sh['color']),
        x: (sh['x'] ?? sh['offsetX'] ?? 0) as number,
        y: (sh['y'] ?? sh['offsetY'] ?? 0) as number,
        blur: (sh['blur'] ?? sh['blurRadius'] ?? 0) as number,
        spread: sh['spread'] as number | undefined,
      });
    }
  }

  // Border radius
  let borderRadius: number | number[] | undefined;
  const rawR = shape?.['r'] ?? r['cornerRadius'] ?? r['borderRadius'] ?? styles['borderRadius'];
  if (rawR !== undefined) {
    borderRadius = rawR as number | number[];
  }

  // Text style
  let textStyle: NormNode['textStyle'] | undefined;
  const rawText = r['text'] ?? r['textContent'];
  const rawTypo = r['typography'] ?? styles['typography'] ?? styles['text'];
  if (rawText || rawTypo) {
    const src = (rawTypo ?? rawText) as Record<string, unknown>;
    const para = Array.isArray(src['paragraphs'])
      ? (src['paragraphs'] as unknown[])[0]
      : undefined;
    const paraObj = para as Record<string, unknown> | undefined;
    const line =
      Array.isArray(paraObj?.['lines'])
        ? ((paraObj!['lines'] as unknown[][])[0]?.[0] as Record<string, unknown> | undefined)
        : undefined;

    const fontFamily =
      (src['fontFamily'] ?? src['font'] ?? line?.['fontFamily'] ?? line?.['postscriptName'] ?? 'inherit') as string;
    const fontSize = (src['fontSize'] ?? line?.['fontSize'] ?? 16) as number;
    const fontWeight = (src['fontWeight'] ?? line?.['fontStyle'] ?? 400) as number | string;
    const lineHeight = (src['lineHeight'] ?? line?.['lineHeight']) as number | undefined;
    const charSpacing = (src['charSpacing'] ?? line?.['charSpacing']) as number | undefined;
    const textAlign = (src['textAlign'] ?? src['align'] ?? paraObj?.['align']) as string | undefined;
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
  const rawChildren =
    (r['nodes'] as unknown[] | undefined) ??
    (r['children'] as unknown[] | undefined) ??
    (r['elements'] as unknown[] | undefined) ??
    [];

  return {
    id: (r['id'] ?? r['uid'] ?? '') as string,
    name: (r['name'] ?? r['title'] ?? 'unnamed') as string,
    type: (r['type'] ?? r['nodeType'] ?? 'unknown') as string,
    visible: r['visible'] !== false && r['hidden'] !== true,
    x,
    y,
    width,
    height,
    fills,
    strokes,
    shadows,
    borderRadius,
    opacity: (r['opacity'] ?? styles['opacity'] ?? 1) as number,
    textStyle,
    children: rawChildren.map(normaliseNode),
  };
}

// ─── Spec builder (mirrors get-artboard-specs.ts logic) ──────────────────────

function buildSpecsFromNodes(
  artboardName: string,
  width: number,
  height: number,
  nodes: NormNode[]
): ArtboardSpecs {
  const colors: ColorSpec[] = [];
  const typography: TypographySpec[] = [];
  const spacing: SpacingSpec[] = [];
  const borders: BorderSpec[] = [];
  const shadows: ShadowSpec[] = [];
  const elements: ElementSpec[] = [];

  collectFromNodes(nodes, colors, typography, spacing, borders, shadows, elements);

  const seenColors = new Set<string>();
  const uniqueColors = colors.filter((c) => {
    const key = `${c.hex}-${c.role}-${c.elementName}`;
    if (seenColors.has(key)) return false;
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

function collectFromNodes(
  nodes: NormNode[],
  colors: ColorSpec[],
  typography: TypographySpec[],
  spacing: SpacingSpec[],
  borders: BorderSpec[],
  shadows: ShadowSpec[],
  elements: ElementSpec[]
): void {
  for (const node of nodes) {
    if (!node.visible) continue;

    const elSpec: ElementSpec = {
      name: node.name,
      type: node.type,
      dimensions: { width: Math.round(node.width), height: Math.round(node.height) },
      position: { x: Math.round(node.x), y: Math.round(node.y) },
      fills: [],
      opacity: node.opacity,
    };

    if (node.borderRadius !== undefined) {
      elSpec.borderRadius = borderRadiusToCSS(node.borderRadius);
    }

    for (const fill of node.fills) {
      if (fill.type === 'solid' && fill.color) {
        const hex = colorToHex(fill.color);
        const rgba = colorToRGBA(fill.color);
        colors.push({ elementName: node.name, role: 'fill', hex, rgba, opacity: fill.color.a ?? 1 });
        elSpec.fills.push(hex);
      }
    }

    for (const stroke of node.strokes) {
      const hex = colorToHex(stroke.color);
      colors.push({
        elementName: node.name,
        role: 'stroke',
        hex,
        rgba: colorToRGBA(stroke.color),
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
      const css = shadowToCSS(shadow);
      shadows.push({ elementName: node.name, cssValue: css });
    }

    if (node.textStyle) {
      const ts = node.textStyle;
      const entry: TypographySpec = {
        elementName: node.name,
        fontFamily: ts.fontFamily,
        fontSize: ts.fontSize,
        fontWeight: ts.fontWeight,
        lineHeight: ts.lineHeight,
        letterSpacing: ts.letterSpacing,
        textAlign: ts.textAlign,
      };
      if (ts.color) {
        const hex = colorToHex(ts.color);
        entry.color = hex;
        colors.push({
          elementName: node.name,
          role: 'text',
          hex,
          rgba: colorToRGBA(ts.color),
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

function formatSpecs(specs: ArtboardSpecs): string {
  const lines: string[] = [];

  lines.push(`# Artboard Specs: ${specs.name}`);
  lines.push(`Dimensions: ${specs.dimensions.width}px × ${specs.dimensions.height}px`);
  lines.push('');

  lines.push('## Colors');
  if (specs.colors.length === 0) {
    lines.push('None found.');
  } else {
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
      for (const c of texts) lines.push(`  ${c.elementName}: ${c.hex} / ${c.rgba}`);
    }
    if (strokes.length) {
      lines.push('### Stroke/Border Colors');
      for (const c of strokes) lines.push(`  ${c.elementName}: ${c.hex} / ${c.rgba}`);
    }
  }
  lines.push('');

  lines.push('## Typography');
  if (specs.typography.length === 0) {
    lines.push('None found.');
  } else {
    for (const t of specs.typography) {
      lines.push(`### ${t.elementName}`);
      lines.push(`  font-family: ${t.fontFamily}`);
      lines.push(`  font-size: ${t.fontSize}px`);
      lines.push(`  font-weight: ${t.fontWeight}`);
      if (t.lineHeight) lines.push(`  line-height: ${t.lineHeight}px`);
      if (t.letterSpacing !== undefined) lines.push(`  letter-spacing: ${t.letterSpacing}em`);
      if (t.textAlign) lines.push(`  text-align: ${t.textAlign}`);
      if (t.color) lines.push(`  color: ${t.color}`);
    }
  }
  lines.push('');

  lines.push('## Borders & Border Radius');
  if (specs.borders.length === 0) {
    lines.push('None found.');
  } else {
    for (const b of specs.borders) {
      lines.push(`### ${b.elementName}`);
      lines.push(`  border: ${b.width}px ${b.color} (position: ${b.position})`);
      if (b.borderRadius) lines.push(`  border-radius: ${b.borderRadius}`);
    }
  }
  const radiiOnly = specs.elements.filter(
    (e) => e.borderRadius && !specs.borders.find((b) => b.elementName === e.name)
  );
  for (const e of radiiOnly) {
    lines.push(`### ${e.name} (radius only)`);
    lines.push(`  border-radius: ${e.borderRadius}`);
  }
  lines.push('');

  lines.push('## Shadows');
  if (specs.shadows.length === 0) {
    lines.push('None found.');
  } else {
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
  const seenHex = new Set<string>();
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
    if (t.lineHeight) lines.push(`$line-height-${safe}: ${t.lineHeight}px;`);
    if (t.letterSpacing !== undefined) lines.push(`$letter-spacing-${safe}: ${t.letterSpacing}em;`);
  }
  for (const s of specs.shadows) {
    const safe = s.elementName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    lines.push(`$shadow-${safe}: ${s.cssValue};`);
  }
  lines.push('```');

  return lines.join('\n');
}

// ─── Public tool function ─────────────────────────────────────────────────────

export async function fetchFromXDShare(input: FetchFromXDShareInput): Promise<string> {
  const { xd_share_url, artboard_name } = input;

  const shareId = extractShareId(xd_share_url);
  const data = await fetchShareData(shareId);
  const artboards = extractArtboardList(data);

  if (artboards.length === 0) {
    return (
      `No artboard data found in the API response for share ID "${shareId}".\n\n` +
      'The Adobe XD share API may have changed or the link may require authentication.\n' +
      'Try downloading the .xd file and using get_artboard_specs with a local path instead.'
    );
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
  let match =
    artboards.find((a) => a.name.toLowerCase() === nameLower) ??
    artboards.find(
      (a) =>
        a.name.toLowerCase().includes(nameLower) ||
        nameLower.includes(a.name.toLowerCase())
    );

  if (!match) {
    const available = artboards.map((a) => `  - ${a.name}`).join('\n');
    return `Artboard "${artboard_name}" not found.\n\nAvailable artboards:\n${available}`;
  }

  const nodes = (match.nodes ?? []).map(normaliseNode);
  const specs = buildSpecsFromNodes(match.name, match.width, match.height, nodes);
  return formatSpecs(specs);
}
