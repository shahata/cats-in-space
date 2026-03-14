import type { APIRoute } from 'astro';
import { files } from '@wix/media';
import { auth } from '@wix/essentials';

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: 'file required' }), { status: 400 });
    }

    // 1. Generate upload URL with elevated permissions
    const elevatedGenerateUrl = auth.elevate(files.generateFileUploadUrl);
    const result = await elevatedGenerateUrl(file.type, { fileName: file.name });

    // 2. Upload file binary to the upload URL server-side (avoids CORS/ORB)
    const uploadRes = await fetch(result.uploadUrl!, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: Buffer.from(await file.arrayBuffer()),
    });

    if (!uploadRes.ok) {
      return new Response(JSON.stringify({ error: 'Upload failed' }), { status: 500 });
    }

    const data = await uploadRes.json();
    return new Response(JSON.stringify({
      id: data.file?.id,
      url: data.file?.url,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Upload failed' }), { status: 500 });
  }
};
