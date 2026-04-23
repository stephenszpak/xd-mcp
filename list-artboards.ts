import { fetchXDFile } from '../utils/fetch-xd';
import { XDParser } from '../parser/xd-parser';

export interface ListArtboardsInput {
  xd_source: string;
}

export async function listArtboards(input: ListArtboardsInput): Promise<string> {
  const { xd_source } = input;

  const buffer = await fetchXDFile(xd_source);
  const parser = new XDParser(buffer);
  const artboards = parser.listArtboards();

  if (artboards.length === 0) {
    return 'No artboards found in this XD file.';
  }

  const lines: string[] = [
    `Found ${artboards.length} artboard(s) in the XD file:`,
    '',
    ...artboards.map((a, i) => `${i + 1}. ${a.name}`),
    '',
    'Use `get_artboard_specs` with any of these names to extract styling details.',
  ];

  return lines.join('\n');
}
