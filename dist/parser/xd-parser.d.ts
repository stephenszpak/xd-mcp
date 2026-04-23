import { XDArtboard, XDColor, XDShadow, GlobalTokens } from './types';
export declare class XDParser {
    private zip;
    constructor(buffer: Buffer);
    /**
     * Returns all artboard names and IDs from the manifest.
     */
    listArtboards(): Array<{
        id: string;
        name: string;
    }>;
    /**
     * Parses a specific artboard by name (case-insensitive, fuzzy fallback).
     */
    getArtboard(name: string): XDArtboard | null;
    /**
     * Extracts global design tokens from all artboards.
     */
    extractGlobalTokens(): GlobalTokens;
    private getManifest;
    private extractArtboardsFromManifest;
    private parseArtboard;
    private parseChildren;
    private parseElement;
    private parseFill;
    private parseStroke;
    private parseShadows;
    private parseColor;
    private parseTextStyle;
    private getColorSwatches;
    private collectTokensFromElements;
}
export declare function colorToHex(color: XDColor): string;
export declare function colorToRGBA(color: XDColor): string;
export declare function shadowToCSS(shadow: XDShadow): string;
export declare function borderRadiusToCSS(r: number | number[]): string;
//# sourceMappingURL=xd-parser.d.ts.map