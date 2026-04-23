/**
 * Fetches an XD file from a URL or reads from a local path.
 * Returns a Buffer of the raw ZIP bytes.
 */
export declare function fetchXDFile(source: string): Promise<Buffer>;
/**
 * Writes a buffer to a temp file and returns the path.
 * Useful if adm-zip needs a file path rather than a buffer.
 */
export declare function bufferToTempFile(buffer: Buffer, filename?: string): string;
export declare function cleanupTempFile(filePath: string): void;
//# sourceMappingURL=fetch-xd.d.ts.map