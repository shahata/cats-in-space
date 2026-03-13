/**
 * Converts a Wix image URL (wix:image://v1/...) to a displayable static URL.
 * Falls back to the original string if it's already a regular URL.
 */
export function getImageUrl(wixImage: string | undefined, width = 800, height = 800): string | null {
  if (!wixImage) return null;

  // Already a regular URL
  if (wixImage.startsWith('http')) return wixImage;

  // Parse wix:image://v1/{mediaId}/{filename}#{params}
  const match = wixImage.match(/^wix:image:\/\/v1\/([^/]+)\//);
  if (!match) return null;

  const mediaId = match[1];
  return `https://static.wixstatic.com/media/${mediaId}/v1/fill/w_${width},h_${height},al_c,q_80/${mediaId}`;
}
