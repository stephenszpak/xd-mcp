import * as fs from 'fs';
import * as path from 'path';
import { fetchXDFile } from '../utils/fetch-xd';
import { XDParser, colorToHex } from '../parser/xd-parser';
import { GlobalTokens, TypographySpec } from '../parser/types';
import { parseScssFile, diffTokens, formatDiffSummary, generateUpdatedScss } from '../utils/scss-diff';

export interface ExtractTokensInput {
  xd_source: string;
  existing_scss_path?: string;
  output_scss_path?: string;
}

export async function extractTokens(input: ExtractTokensInput): Promise<string> {
  const { xd_source, existing_scss_path, output_scss_path } = input;

  const buffer = await fetchXDFile(xd_source);
  const parser = new XDParser(buffer);
  const tokens = parser.extractGlobalTokens();

  const scssVariables = tokensToScssVariables(tokens);
  const output: string[] = [];

  output.push('# Global Design Tokens');
  output.push('');

  // ── Colors ───────────────────────────────────────────────────────────────
  output.push('## Colors');
  output.push('```scss');
  for (const [name, value] of Object.entries(tokens.colors)) {
    output.push(`$${name}: ${value};`);
  }
  output.push('```');
  output.push('');

  // ── Typography ───────────────────────────────────────────────────────────
  output.push('## Typography');
  output.push('```scss');
  for (const [name, spec] of Object.entries(tokens.typography)) {
    if (spec.fontFamily) output.push(`$font-family-${name}: '${spec.fontFamily}';`);
    if (spec.fontSize) output.push(`$font-size-${name}: ${spec.fontSize}px;`);
    if (spec.fontWeight) output.push(`$font-weight-${name}: ${spec.fontWeight};`);
    if (spec.lineHeight) output.push(`$line-height-${name}: ${spec.lineHeight}px;`);
    if (spec.letterSpacing !== undefined) output.push(`$letter-spacing-${name}: ${spec.letterSpacing}em;`);
  }
  output.push('```');
  output.push('');

  // ── Spacing ──────────────────────────────────────────────────────────────
  output.push('## Spacing Scale');
  output.push('```scss');
  tokens.spacing.slice(0, 20).forEach((val, i) => {
    output.push(`$spacing-${i + 1}: ${val}px;`);
  });
  output.push('```');
  output.push('');

  // ── Shadows ──────────────────────────────────────────────────────────────
  if (Object.keys(tokens.shadows).length > 0) {
    output.push('## Shadows');
    output.push('```scss');
    for (const [name, value] of Object.entries(tokens.shadows)) {
      output.push(`$${name}: ${value};`);
    }
    output.push('```');
    output.push('');
  }

  // ── Diff against existing SCSS ────────────────────────────────────────────
  if (existing_scss_path) {
    try {
      const existingVars = parseScssFile(existing_scss_path);
      const diff = diffTokens(scssVariables, existingVars);
      output.push('---');
      output.push('');
      output.push(formatDiffSummary(diff));

      // Write updated SCSS if output path provided
      if (output_scss_path) {
        const updatedContent = generateUpdatedScss(diff, existingVars);
        const outPath = path.resolve(output_scss_path);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, updatedContent, 'utf-8');
        output.push('');
        output.push(`✅ Updated SCSS written to: ${outPath}`);
        output.push('Review the changes before committing.');
      }
    } catch (err) {
      output.push(`⚠️  Could not diff SCSS: ${(err as Error).message}`);
    }
  }

  return output.join('\n');
}

/**
 * Converts GlobalTokens into a flat SCSS variable map for diffing.
 */
function tokensToScssVariables(tokens: GlobalTokens): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const [name, value] of Object.entries(tokens.colors)) {
    vars[name] = value;
  }

  for (const [name, spec] of Object.entries(tokens.typography)) {
    const s = spec as Partial<TypographySpec>;
    if (s.fontFamily) vars[`font-family-${name}`] = `'${s.fontFamily}'`;
    if (s.fontSize) vars[`font-size-${name}`] = `${s.fontSize}px`;
    if (s.fontWeight) vars[`font-weight-${name}`] = `${s.fontWeight}`;
    if (s.lineHeight) vars[`line-height-${name}`] = `${s.lineHeight}px`;
    if (s.letterSpacing !== undefined) vars[`letter-spacing-${name}`] = `${s.letterSpacing}em`;
  }

  tokens.spacing.slice(0, 20).forEach((val, i) => {
    vars[`spacing-${i + 1}`] = `${val}px`;
  });

  for (const [name, value] of Object.entries(tokens.shadows)) {
    vars[name] = value;
  }

  return vars;
}
