import type { APIRoute } from 'astro';
import { authentication } from '@wix/members';
import { auth } from '@wix/essentials';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { action, email } = await request.json();

    if (action === 'reset-password') {
      if (!email) return new Response(JSON.stringify({ error: 'email required' }), { status: 400 });
      const elevatedSend = auth.elevate(authentication.sendSetPasswordEmail);
      const result = await elevatedSend(email);
      return new Response(JSON.stringify({ accepted: result.accepted }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed' }), { status: 500 });
  }
};
