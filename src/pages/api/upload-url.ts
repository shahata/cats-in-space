import type { APIRoute } from 'astro';
import { files } from '@wix/media';
import { auth } from '@wix/essentials';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { mimeType, fileName } = await request.json();
    if (!mimeType) {
      return new Response(JSON.stringify({ error: 'mimeType required' }), { status: 400 });
    }

    const elevatedGenerateUrl = auth.elevate(files.generateFileUploadUrl);
    const result = await elevatedGenerateUrl(mimeType, { fileName });

    return new Response(JSON.stringify({ uploadUrl: result.uploadUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to generate upload URL' }), { status: 500 });
  }
};
