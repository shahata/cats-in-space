import type { APIRoute } from 'astro';
import { files } from '@wix/media';
import { members } from '@wix/members';
import { auth } from '@wix/essentials';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const MIN_DIMENSION = 50;
const MAX_DIMENSION = 4096;

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const memberId = formData.get('memberId') as string | null;

    if (!file || !memberId) {
      return new Response(JSON.stringify({ error: 'file and memberId required' }), { status: 400 });
    }

    // Validate image type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return new Response(JSON.stringify({ error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` }), { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: 'File too large. Maximum 5MB.' }), { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate image dimensions
    const dimensions = getImageDimensions(buffer, file.type);
    if (dimensions) {
      const { width, height } = dimensions;
      if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
        return new Response(JSON.stringify({ error: `Image too small. Minimum ${MIN_DIMENSION}x${MIN_DIMENSION}px.` }), { status: 400 });
      }
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        return new Response(JSON.stringify({ error: `Image too large. Maximum ${MAX_DIMENSION}x${MAX_DIMENSION}px.` }), { status: 400 });
      }
    }

    // Upload to Wix Media
    const elevatedGenerateUrl = auth.elevate(files.generateFileUploadUrl);
    const result = await elevatedGenerateUrl(file.type, { fileName: file.name });

    const uploadRes = await fetch(result.uploadUrl!, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: buffer,
    });

    if (!uploadRes.ok) {
      return new Response(JSON.stringify({ error: 'Upload to media manager failed' }), { status: 500 });
    }

    const data = await uploadRes.json();
    const photoId = data.file?.id;
    const photoUrl = data.file?.url;

    if (!photoId || !photoUrl) {
      return new Response(JSON.stringify({ error: 'Upload succeeded but no file data returned' }), { status: 500 });
    }

    // Update member profile photo
    await members.updateMember(memberId, {
      profile: { photo: { _id: photoId, url: photoUrl } },
    });

    return new Response(JSON.stringify({ id: photoId, url: photoUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to update profile photo' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const { memberId } = await request.json();
    if (!memberId) {
      return new Response(JSON.stringify({ error: 'memberId required' }), { status: 400 });
    }

    await members.updateMember(memberId, {
      profile: { photo: { url: '' } },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to remove photo' }), { status: 500 });
  }
};

function getImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  try {
    if (mimeType === 'image/png' && buffer.length >= 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (mimeType === 'image/gif' && buffer.length >= 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (mimeType === 'image/jpeg' && buffer.length >= 2) {
      let offset = 2;
      while (offset < buffer.length - 1) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          if (offset + 9 <= buffer.length) {
            return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
          }
        }
        const segmentLength = buffer.readUInt16BE(offset + 2);
        offset += 2 + segmentLength;
      }
    }
    if (mimeType === 'image/webp' && buffer.length >= 30) {
      if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x20) {
        return { width: (buffer[26] | (buffer[27] << 8)) & 0x3fff, height: (buffer[28] | (buffer[29] << 8)) & 0x3fff };
      }
      if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x4c) {
        const bits = buffer[21] | (buffer[22] << 8) | (buffer[23] << 16) | (buffer[24] << 24);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
  } catch {}
  return null;
}
