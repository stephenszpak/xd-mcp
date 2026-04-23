"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTokens = extractTokens;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fetch_xd_1 = require("../utils/fetch-xd");
const xd_parser_1 = require("../parser/xd-parser");
const scss_diff_1 = require("../utils/scss-diff");
async function extractTokens(input) {
    const { xd_source, existing_scss_path, output_scss_path } = input;
    const buffer = await (0, fetch_xd_1.fetchXDFile)(xd_source);
    const parser = new xd_parser_1.XDParser(buffer);
    const tokens = parser.extractGlobalTokens();
    const scssVariables = tokensToScssVariables(tokens);
    const output = [];
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
        if (spec.fontFamily)
            output.push(`$font-family-${name}: '${spec.fontFamily}';`);
        if (spec.fontSize)
            output.push(`$font-size-${name}: ${spec.fontSize}px;`);
        if (spec.fontWeight)
            output.push(`$font-weight-${name}: ${spec.fontWeight};`);
        if (spec.lineHeight)
            output.push(`$line-height-${name}: ${spec.lineHeight}px;`);
        if (spec.letterSpacing !== undefined)
            output.push(`$letter-spacing-${name}: ${spec.letterSpacing}em;`);
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
            const existingVars = (0, scss_diff_1.parseScssFile)(existing_scss_path);
            const diff = (0, scss_diff_1.diffTokens)(scssVariables, existingVars);
            output.push('---');
            output.push('');
            output.push((0, scss_diff_1.formatDiffSummary)(diff));
            // Write updated SCSS if output path provided
            if (output_scss_path) {
                const updatedContent = (0, scss_diff_1.generateUpdatedScss)(diff, existingVars);
                const outPath = path.resolve(output_scss_path);
                fs.mkdirSync(path.dirname(outPath), { recursive: true });
                fs.writeFileSync(outPath, updatedContent, 'utf-8');
                output.push('');
                output.push(`✅ Updated SCSS written to: ${outPath}`);
                output.push('Review the changes before committing.');
            }
        }
        catch (err) {
            output.push(`⚠️  Could not diff SCSS: ${err.message}`);
        }
    }
    return output.join('\n');
}
/**
 * Converts GlobalTokens into a flat SCSS variable map for diffing.
 */
function tokensToScssVariables(tokens) {
    const vars = {};
    for (const [name, value] of Object.entries(tokens.colors)) {
        vars[name] = value;
    }
    for (const [name, spec] of Object.entries(tokens.typography)) {
        const s = spec;
        if (s.fontFamily)
            vars[`font-family-${name}`] = `'${s.fontFamily}'`;
        if (s.fontSize)
            vars[`font-size-${name}`] = `${s.fontSize}px`;
        if (s.fontWeight)
            vars[`font-weight-${name}`] = `${s.fontWeight}`;
        if (s.lineHeight)
            vars[`line-height-${name}`] = `${s.lineHeight}px`;
        if (s.letterSpacing !== undefined)
            vars[`letter-spacing-${name}`] = `${s.letterSpacing}em`;
    }
    tokens.spacing.slice(0, 20).forEach((val, i) => {
        vars[`spacing-${i + 1}`] = `${val}px`;
    });
    for (const [name, value] of Object.entries(tokens.shadows)) {
        vars[name] = value;
    }
    return vars;
}
//# sourceMappingURL=extract-tokens.js.map