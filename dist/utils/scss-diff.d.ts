import { TokenDiff } from '../parser/types';
/**
 * Parses a SCSS variables file into a flat key/value map.
 * Handles:
 *   $variable-name: value;
 *   $variable-name: value !default;
 */
export declare function parseScssVariables(scssContent: string): Record<string, string>;
/**
 * Reads and parses a SCSS file from disk.
 */
export declare function parseScssFile(filePath: string): Record<string, string>;
/**
 * Diffs extracted XD tokens against existing SCSS variables.
 *
 * @param extractedTokens - Record of variable name -> value from XD
 * @param existingScss - Record of variable name -> value from SCSS file
 */
export declare function diffTokens(extractedTokens: Record<string, string>, existingScss: Record<string, string>): TokenDiff;
/**
 * Formats a TokenDiff as a human-readable summary for Cursor to consume.
 */
export declare function formatDiffSummary(diff: TokenDiff): string;
/**
 * Generates the full updated SCSS variables file content.
 */
export declare function generateUpdatedScss(diff: TokenDiff, existingScss: Record<string, string>): string;
//# sourceMappingURL=scss-diff.d.ts.map