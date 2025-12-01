import dotenv from "dotenv";
import Order from "../database/models/Order";
import cartService from "../database/controllers/cart";
import { getBuyerKeyboard } from "../shared/keyboards";
import { MyContext, MyConversation, MyConversationContext } from "../types/bot";

dotenv.config({ path: "src/.env" })

export async function checkout(
  conversation: MyConversation,
  ctx: MyConversationContext
) {
  const userId = ctx.from!.id;
  
  const cart = await cartService.getCartWithDetails(userId);
  
  if (!cart || cart.items.length === 0) {
    await ctx.reply("🛒 Ваша корзина пуста", {
      reply_markup: getBuyerKeyboard(false)
    });
    return;
  }

  const totalAmount = cart.items.reduce((sum: number, item: any) => 
    sum + (item.productId.price * item.quantity), 0);

  const minAmount = 60;
  if (totalAmount < minAmount) {
    await ctx.reply(
      `❌ Минимальная сумма для оплаты: ${minAmount} ₽\n` +
      `Сумма вашей корзины: ${totalAmount} ₽\n\n` +
      `Добавьте еще товаров на ${minAmount - totalAmount} ₽`,
      { reply_markup: getBuyerKeyboard(false) }
    );
    return;
  }

  const commissionPercent = 10;
  const commissionAmount = Math.round(totalAmount * commissionPercent / 100);
  const orderNumber = `ORD-${Date.now()}-${userId}`;

  const providerToken = process.env.PAYMENT_PROVIDER_TOKEN;
  
  if (!providerToken) {
    await ctx.reply("❌ Оплата временно недоступна. Обратитесь к администратору.");
    return;
  }

  const title = `Заказ ${orderNumber}`.slice(0, 32);
  const description = `Товаров: ${cart.items.length} | Сумма: ${totalAmount} ₽ | Комиссия: ${commissionAmount} ₽`.slice(0, 255);

  const prices = cart.items.map((item: any) => ({
    label: `${item.productId.name.slice(0, 50)} (x${item.quantity})`,
    amount: Math.round(item.productId.price * item.quantity * 100)
  }));

  try {
    await ctx.replyWithInvoice(
      title,
      description,
      orderNumber,
      'RUB',
      prices,
      {
        provider_token: providerToken,
        need_phone_number: true,
        need_shipping_address: false,
        is_flexible: false
      }
    );

    await Order.create({
      orderNumber,
      buyerId: cart.userId,
      items: cart.items.map((item: any) => ({
        productId: item.productId._id,
        sellerId: item.productId.sellerId,
        name: item.productId.name,
        price: item.productId.price,
        quantity: item.quantity,
        size: item.size
      })),
      totalAmount,
      commissionAmount,
      sellerAmount: totalAmount - commissionAmount,
      commissionPercent,
      status: 'pending',
      paymentStatus: 'pending',
      paymentId: orderNumber,
      buyerContact: { username: ctx.from?.username, phone: '' }
    });

    await ctx.reply(
      "📱 Для оплаты заказа нажмите кнопку выше.\n\n" +
      "После успешной оплаты вы получите уведомление, " +
      "а продавцы будут проинформированы о вашем заказе.",
      {
        reply_markup: getBuyerKeyboard(false)
      }
    );

  } catch (error) {
    console.error("Error creating invoice:", error);
    await ctx.reply(
      "❌ Ошибка при создании счета на оплату.\n" +
      "Попробуйте позже или обратитесь к администратору."
    );
  }
}
