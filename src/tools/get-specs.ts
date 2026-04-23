import { fetchFromXDShare } from './fetch-from-xd-share';
import { getArtboardSpecs } from './get-artboard-specs';
import { listArtboards } from './list-artboards';

export interface GetSpecsInput {
  xd_source: string;
  artboard_name?: string;
}

type SourceType = 'xd-share' | 'remote-file' | 'local-file';

function detectSourceType(xd_source: string): SourceType {
  if (xd_source.startsWith('https://xd.adobe.com/view/')) return 'xd-share';
  if (xd_source.startsWith('http://') || xd_source.startsWith('https://')) return 'remote-file';
  return 'local-file'; // handles /, ./, C:\, relative paths
}

export async function getSpecs(input: GetSpecsInput): Promise<string> {
  const { xd_source, artboard_name } = input;
  const sourceType = detectSourceType(xd_source);

  if (sourceType === 'xd-share') {
    // fetchFromXDShare handles both list mode (no artboard_name) and spec mode
    return fetchFromXDShare({ xd_share_url: xd_source, artboard_name });
  }

  // Remote file URL or local file path — use the .xd ZIP parser
  if (!artboard_name) {
    return listArtboards({ xd_source });
  }

  return getArtboardSpecs({ xd_source, artboard_name });
}
