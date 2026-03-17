import type { APIRoute } from 'astro';
import { backInStockNotifications } from '@wix/ecom';

const STORES_APP_ID = '1380b703-ce81-ff05-f115-39571d94dfcd';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email, catalogItemId, variantId, productName, productPrice } = await request.json();

    if (!email || !catalogItemId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const catalogReference: Record<string, unknown> = {
      catalogItemId,
      appId: STORES_APP_ID,
    };
    if (variantId) {
      catalogReference.options = { variantId };
    }

    // SDK takes two separate args: (request, itemDetails)
    await (backInStockNotifications.createBackInStockNotificationRequest as Function)(
      { catalogReference, email },
      { name: productName || 'Product', price: String(productPrice || '0') },
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Failed to register' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
