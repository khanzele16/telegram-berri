import Order from "../models/Order";
import User from "../models/User";
import Shop from "../models/Shop";
import yookassaService from "../../services/yookassa";

/**
 * Одобрить заказ и отправить выплату продавцу
 */
export async function approveOrder(orderId: string, adminId: number) {
  const order = await Order.findById(orderId);
  
  if (!order) {
    throw new Error("Заказ не найден");
  }

  if (order.adminApproved) {
    throw new Error("Заказ уже одобрен");
  }

  if (order.status !== "paid") {
    throw new Error("Заказ не оплачен");
  }

  // Группируем товары по продавцам
  const sellerPayouts = new Map<string, { amount: number; items: any[] }>();
  
  for (const item of order.items) {
    if (!item.sellerId || !item.price || !item.quantity) {
      console.error(`Пропущен товар с неполными данными:`, item);
      continue;
    }
    
    const sellerId = item.sellerId.toString();
    const itemTotal = item.price * item.quantity;
    const sellerAmount = Math.round(itemTotal * 0.9); // 90% продавцу

    if (!sellerPayouts.has(sellerId)) {
      sellerPayouts.set(sellerId, { amount: 0, items: [] });
    }

    const payout = sellerPayouts.get(sellerId)!;
    payout.amount += sellerAmount;
    payout.items.push(item);
  }

  // Отправляем выплаты каждому продавцу
  const payoutResults: any[] = [];

  for (const [sellerId, { amount, items }] of sellerPayouts) {
    try {
      const seller = await User.findById(sellerId);
      
      if (!seller) {
        console.error(`Продавец ${sellerId} не найден`);
        continue;
      }

      if (!seller.profiles?.seller?.shopId) {
        console.error(`У продавца ${sellerId} нет магазина`);
        continue;
      }

      const shop = await Shop.findById(seller.profiles.seller.shopId);
      
      if (!shop?.cardNumber) {
        console.error(`У магазина ${shop?._id} не указан номер карты`);
        continue;
      }

      const productNames = items.map(i => i.name).join(", ");
      const description = `Выплата за заказ ${order.orderNumber}: ${productNames}`;

      const payoutResponse = await yookassaService.createPayout(
        amount.toString(),
        shop.cardNumber,
        description
      );

      payoutResults.push({
        sellerId,
        amount,
        payoutId: payoutResponse.id,
        status: payoutResponse.status
      });

    } catch (err) {
      console.error(`Ошибка выплаты продавцу ${sellerId}:`, err);
      payoutResults.push({
        sellerId,
        amount,
        error: err instanceof Error ? err.message : "Неизвестная ошибка"
      });
    }
  }

  // Обновляем заказ
  order.adminApproved = true;
  order.approvedAt = new Date();
  order.approvedBy = adminId as any;
  order.payoutStatus = "succeeded";
  
  // Сохраняем ID первой выплаты (если их несколько)
  if (payoutResults.length > 0 && payoutResults[0].payoutId) {
    order.payoutId = payoutResults[0].payoutId;
  }

  await order.save();

  return {
    success: true,
    order,
    payouts: payoutResults
  };
}

/**
 * Отклонить заказ
 */
export async function rejectOrder(orderId: string, adminId: number, reason: string) {
  const order = await Order.findById(orderId);
  
  if (!order) {
    throw new Error("Заказ не найден");
  }

  if (order.adminApproved) {
    throw new Error("Заказ уже одобрен, отклонение невозможно");
  }

  order.adminApproved = false;
  order.rejectedAt = new Date();
  order.approvedBy = adminId as any;
  order.rejectionReason = reason;
  order.status = "cancelled";

  await order.save();

  return {
    success: true,
    order
  };
}

/**
 * Получить заказ по ID с полной информацией
 */
export async function getOrderWithDetails(orderId: string) {
  return await Order.findById(orderId)
    .populate("buyerId")
    .populate({
      path: "items.productId",
      model: "Product"
    })
    .populate({
      path: "items.sellerId",
      model: "User"
    });
}

export default {
  approveOrder,
  rejectOrder,
  getOrderWithDetails
};
