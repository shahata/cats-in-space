import type { APIRoute } from 'astro';
import { files } from '@wix/media';
import { members } from '@wix/members';
import { auth } from '@wix/essentials';
import sizeOf from 'image-size';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const MIN_DIMENSION = 50;
const MAX_DIMENSION = 4096;

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const memberId = formData.get('memberId') as string | null;
    const field = (formData.get('field') as string) || 'photo'; // 'photo' or 'cover'

    if (!file || !memberId) {
      return new Response(JSON.stringify({ error: 'file and memberId required' }), { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return new Response(JSON.stringify({ error: 'Invalid file type. Allowed: jpeg, png, gif, webp.' }), { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: 'File too large. Maximum 5MB.' }), { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate image dimensions using image-size
    const dimensions = sizeOf(buffer);
    if (!dimensions.width || !dimensions.height) {
      return new Response(JSON.stringify({ error: 'Could not read image dimensions.' }), { status: 400 });
    }
    if (dimensions.width < MIN_DIMENSION || dimensions.height < MIN_DIMENSION) {
      return new Response(JSON.stringify({ error: `Image too small. Minimum ${MIN_DIMENSION}x${MIN_DIMENSION}px.` }), { status: 400 });
    }
    if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
      return new Response(JSON.stringify({ error: `Image too large. Maximum ${MAX_DIMENSION}x${MAX_DIMENSION}px.` }), { status: 400 });
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

    // Update member profile photo or cover
    const profileUpdate = field === 'cover'
      ? { cover: { _id: photoId, url: photoUrl } }
      : { photo: { _id: photoId, url: photoUrl } };
    await members.updateMember(memberId, { profile: profileUpdate });

    return new Response(JSON.stringify({ id: photoId, url: photoUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to update profile photo' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const { memberId, field = 'photo' } = await request.json();
    if (!memberId) {
      return new Response(JSON.stringify({ error: 'memberId required' }), { status: 400 });
    }

    const profileUpdate = field === 'cover'
      ? { cover: { url: '' } }
      : { photo: { url: '' } };
    await members.updateMember(memberId, { profile: profileUpdate });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to remove photo' }), { status: 500 });
  }
};
