import { media } from '@wix/sdk';

/**
 * Converts a Wix image identifier to a displayable URL.
 * Uses the official @wix/sdk media helpers.
 * Supports wix:image:// strings, media IDs, and regular URLs.
 */
export function getImageUrl(wixImage: string | undefined, width = 800, height = 800): string | null {
  if (!wixImage) return null;

  // Already a regular URL
  if (wixImage.startsWith('http')) return wixImage;

  // Use SDK media helper for wix:image:// strings
  if (wixImage.startsWith('wix:image://')) {
    try {
      return media.getScaledToFillImageUrl(wixImage, width, height, {});
    } catch {
      // Fallback: parse manually
      const parsed = media.getImageUrl(wixImage);
      return parsed?.url || null;
    }
  }

  // Plain media ID — construct wix:image:// format and try again
  try {
    return media.getScaledToFillImageUrl(`wix:image://v1/${wixImage}/${wixImage}#originWidth=${width}&originHeight=${height}`, width, height, {});
  } catch {
    return `https://static.wixstatic.com/media/${wixImage}`;
  }
}
