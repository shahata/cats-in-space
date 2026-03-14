import type { APIRoute } from 'astro';
import { httpClient } from '@wix/essentials';
import { auth } from '@wix/essentials';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { newPassword } = await request.json();
    if (!newPassword) {
      return new Response(JSON.stringify({ error: 'newPassword required' }), { status: 400 });
    }

    const elevatedFetch = auth.elevate(httpClient.fetchWithAuth);
    const res = await elevatedFetch(
      'https://www.wixapis.com/iam/authentication/v2/change-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      }
    );

    if (res.ok) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json().catch(() => ({}));
    return new Response(JSON.stringify({ error: data.message || 'Failed to change password' }), {
      status: res.status,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to change password' }), { status: 500 });
  }
};
