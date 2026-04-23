import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Fetches an XD file from a URL or reads from a local path.
 * Returns a Buffer of the raw ZIP bytes.
 */
export async function fetchXDFile(source: string): Promise<Buffer> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch XD file: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // Local file path
  const resolved = path.resolve(source);
  if (!fs.existsSync(resolved)) {
    throw new Error(`XD file not found at path: ${resolved}`);
  }
  return fs.readFileSync(resolved);
}

/**
 * Writes a buffer to a temp file and returns the path.
 * Useful if adm-zip needs a file path rather than a buffer.
 */
export function bufferToTempFile(buffer: Buffer, filename = 'design.xd'): string {
  const tmpPath = path.join(os.tmpdir(), `xd-mcp-${Date.now()}-${filename}`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

export function cleanupTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Best-effort cleanup
  }
}
