import { media } from '@wix/sdk';
import type { productsV3 } from '@wix/stores';

/**
 * Converts a Wix video identifier to playable video URL + thumbnail image URL.
 * Supports wix:video:// strings and regular URLs.
 */
export function getVideoUrl(wixVideo: string | undefined, thumbnailWidth = 800, thumbnailHeight = 800): { url: string; thumbnail: string | null } | null {
  if (!wixVideo) return null;

  if (wixVideo.startsWith('http')) return { url: wixVideo, thumbnail: null };

  if (wixVideo.startsWith('wix:video://')) {
    const result = media.getVideoUrl(wixVideo);
    return {
      url: result.url,
      thumbnail: result.thumbnail ? getImageUrl(result.thumbnail, thumbnailWidth, thumbnailHeight) : null,
    };
  }

  return { url: `https://video.wixstatic.com/video/${wixVideo}/file`, thumbnail: null };
}

export interface MediaEntry {
  type: 'image' | 'video';
  url: string;
  thumbnail?: string;
}

/**
 * Extracts a displayable media entry from a Wix ProductMedia object.
 */
export function extractMediaUrl(m: productsV3.ProductMedia | undefined, width = 800, height = 800): MediaEntry | null {
  if (!m) return null;
  if (m.mediaType === 'VIDEO' && m.video) {
    const video = getVideoUrl(m.video, width, height);
    if (video) return { type: 'video', url: video.url, ...(video.thumbnail ? { thumbnail: video.thumbnail } : {}) };
    return null;
  }
  if (m.image) {
    const imageUrl = getImageUrl(m.image, width, height);
    if (imageUrl) return { type: 'image', url: imageUrl };
  }
  return null;
}

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
