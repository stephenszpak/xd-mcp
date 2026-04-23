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
exports.parseScssVariables = parseScssVariables;
exports.parseScssFile = parseScssFile;
exports.diffTokens = diffTokens;
exports.formatDiffSummary = formatDiffSummary;
exports.generateUpdatedScss = generateUpdatedScss;
const fs = __importStar(require("fs"));
/**
 * Parses a SCSS variables file into a flat key/value map.
 * Handles:
 *   $variable-name: value;
 *   $variable-name: value !default;
 */
function parseScssVariables(scssContent) {
    const result = {};
    const lines = scssContent.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('$'))
            continue;
        // Match: $name: value; or $name: value !default;
        const match = trimmed.match(/^\$([^:]+):\s*(.+?)(?:\s*!default)?\s*;/);
        if (match) {
            const name = match[1].trim();
            const value = match[2].trim();
            result[name] = value;
        }
    }
    return result;
}
/**
 * Reads and parses a SCSS file from disk.
 */
function parseScssFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`SCSS file not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseScssVariables(content);
}
/**
 * Diffs extracted XD tokens against existing SCSS variables.
 *
 * @param extractedTokens - Record of variable name -> value from XD
 * @param existingScss - Record of variable name -> value from SCSS file
 */
function diffTokens(extractedTokens, existingScss) {
    const added = {};
    const changed = {};
    const unchanged = {};
    const removedFromScss = {};
    // Check all extracted tokens against existing SCSS
    for (const [name, newValue] of Object.entries(extractedTokens)) {
        if (!(name in existingScss)) {
            added[name] = newValue;
        }
        else if (normalizeValue(existingScss[name]) !== normalizeValue(newValue)) {
            changed[name] = { existing: existingScss[name], new: newValue };
        }
        else {
            unchanged[name] = newValue;
        }
    }
    // Check SCSS variables that don't exist in the extracted tokens
    for (const [name, value] of Object.entries(existingScss)) {
        if (!(name in extractedTokens)) {
            removedFromScss[name] = value;
        }
    }
    return { added, changed, unchanged, removedFromScss };
}
/**
 * Formats a TokenDiff as a human-readable summary for Cursor to consume.
 */
function formatDiffSummary(diff) {
    const lines = [];
    const addedCount = Object.keys(diff.added).length;
    const changedCount = Object.keys(diff.changed).length;
    const unchangedCount = Object.keys(diff.unchanged).length;
    const removedCount = Object.keys(diff.removedFromScss).length;
    lines.push('## Token Diff Summary');
    lines.push(`- ${addedCount} new tokens (in XD, not in SCSS)`);
    lines.push(`- ${changedCount} changed tokens`);
    lines.push(`- ${unchangedCount} unchanged tokens`);
    lines.push(`- ${removedCount} tokens in SCSS but not found in XD`);
    lines.push('');
    if (changedCount > 0) {
        lines.push('### Changed Tokens (update these in your SCSS)');
        for (const [name, { existing, new: newVal }] of Object.entries(diff.changed)) {
            lines.push(`$${name}:`);
            lines.push(`  existing: ${existing}`);
            lines.push(`  new:      ${newVal}`);
        }
        lines.push('');
    }
    if (addedCount > 0) {
        lines.push('### New Tokens (add these to your SCSS)');
        for (const [name, value] of Object.entries(diff.added)) {
            lines.push(`$${name}: ${value};`);
        }
        lines.push('');
    }
    if (removedCount > 0) {
        lines.push('### SCSS Variables Not Found in XD (review for removal)');
        for (const [name, value] of Object.entries(diff.removedFromScss)) {
            lines.push(`$${name}: ${value};`);
        }
        lines.push('');
    }
    if (unchangedCount > 0) {
        lines.push('### Unchanged Tokens');
        for (const [name, value] of Object.entries(diff.unchanged)) {
            lines.push(`$${name}: ${value};`);
        }
    }
    return lines.join('\n');
}
/**
 * Generates the full updated SCSS variables file content.
 */
function generateUpdatedScss(diff, existingScss) {
    const lines = [];
    lines.push('// Auto-updated by xd-mcp');
    lines.push('// Review changes before committing');
    lines.push('');
    // Merge: existing + changed + added
    const merged = { ...existingScss };
    for (const [name, { new: newVal }] of Object.entries(diff.changed)) {
        merged[name] = newVal;
    }
    for (const [name, value] of Object.entries(diff.added)) {
        merged[name] = value;
    }
    for (const [name, value] of Object.entries(merged)) {
        lines.push(`$${name}: ${value};`);
    }
    return lines.join('\n');
}
function normalizeValue(value) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
//# sourceMappingURL=scss-diff.js.map