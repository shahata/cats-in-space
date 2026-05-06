import { orders } from "@wix/ecom";
import { items } from "@wix/data";
import { auth } from "@wix/essentials";

async function notifyTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("Telegram notification skipped: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return;
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!response.ok) {
    console.error("Telegram notification failed", response.status, await response.text());
  }
}

export default orders.onOrderApproved(async (event) => {
  console.log("Order approved event received");
  const order = event.data.order;
  if (!order) return;

  const insertOrderLog = auth.elevate(items.insert);
  await insertOrderLog("OrderLog", {
    orderId: order._id,
    orderNumber: order.number,
    total: order.priceSummary?.total?.formattedAmount,
    buyerEmail: order.buyerInfo?.email,
    orderCreatedDate: order._createdDate,
  });

  const message = [
    `<b>New order #${order.number}</b>`,
    order.priceSummary?.total?.formattedAmount && `Total: ${order.priceSummary.total.formattedAmount}`,
    order.buyerInfo?.email && `Buyer: ${order.buyerInfo.email}`,
  ]
    .filter(Boolean)
    .join("\n");
  await notifyTelegram(message);
});
