import type { APIRoute } from "astro";
import { operations as operationsApi } from "@wix/restaurants";
import { auth } from "@wix/essentials";

/**
 * POST /api/restaurant-slots
 * Body: { operationId: string, date: "YYYY-MM-DD", address?: string }
 * Returns: { slotsByType: { PICKUP?: Slot[], DELIVERY?: Slot[] }, deliveryServiceable: boolean }
 *
 * Wraps `operations.calculateAvailableTimeSlotsForDate` which requires elevated auth.
 * When `address` is passed and no DELIVERY slots come back, the address is outside
 * any configured delivery area — that's the signal for "we don't deliver here."
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const operationId = String(body.operationId || "");
    const date = String(body.date || "");
    const address = body.address ? String(body.address) : "";
    if (!operationId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(
        JSON.stringify({ error: "Invalid operationId or date" }),
        { status: 400 },
      );
    }
    const [y, m, d] = date.split("-").map(Number);
    const elevated = auth.elevate(
      operationsApi.calculateAvailableTimeSlotsForDate,
    );
    const options: operationsApi.CalculateAvailableTimeSlotsForDateOptions = {
      date: { year: y!, month: m!, day: d! },
    };
    if (address) options.deliveryAddress = { addressLine: address };
    const result = await elevated(operationId, options);

    const slotsByType: Record<
      string,
      Array<{
        start: string;
        end: string;
        scheduling: string;
        fee: string | null;
        minOrder: string | null;
      }>
    > = {};
    for (const entry of result.timeslotsPerFulfillmentType || []) {
      const type = entry.fulfilmentType;
      const startDate = entry.timeSlot?.startTime;
      const endDate = entry.timeSlot?.endTime;
      if (!type || !startDate || !endDate) continue;
      const fi = entry.fulfillmentInfo?.[0];
      (slotsByType[type] ||= []).push({
        start: new Date(startDate).toISOString(),
        end: new Date(endDate).toISOString(),
        scheduling:
          entry.timeSlot?.orderSchedulingType ||
          operationsApi.OrderSchedulingType.PREORDER,
        fee: fi?.fee ?? null,
        minOrder: fi?.minOrderPrice ?? null,
      });
    }

    const deliveryServiceable =
      !address || (slotsByType.DELIVERY?.length ?? 0) > 0;
    return new Response(JSON.stringify({ slotsByType, deliveryServiceable }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      { status: 500 },
    );
  }
};
