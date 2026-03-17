import type { APIRoute } from 'astro';
import { backInStockNotifications } from '@wix/ecom';

const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email, catalogItemId, variantId, productName, productPrice } = await request.json();

    if (!email || !catalogItemId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const catalogReference: any = {
      catalogItemId,
      appId: STORES_APP_ID,
    };
    if (variantId) {
      catalogReference.options = { variantId };
    }

    await backInStockNotifications.createBackInStockNotificationRequest({
      catalogReference,
      email,
      itemDetails: {
        name: productName || 'Product',
        price: String(productPrice || '0'),
      },
    } as any);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to register' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
