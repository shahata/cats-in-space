import { orders } from "@wix/ecom";
// import { items } from "@wix/data";
// import { auth } from "@wix/essentials";

export default orders.onOrderCreated(async (_event) => {
  console.log("Order created event received for order");
  // const insertOrderLog = auth.elevate(items.insert);
  // const order = event.entity;
  // await insertOrderLog("OrderLog", {
  //   orderId: order._id,
  //   orderNumber: order.number,
  //   total: order.priceSummary?.total?.formattedAmount,
  //   buyerEmail: order.buyerInfo?.email,
  //   orderCreatedDate: order._createdDate,
  // });
});
