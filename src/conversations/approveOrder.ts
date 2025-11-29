import { InlineKeyboard } from "grammy";
import { MyContext } from "../types/bot";
import { Conversation } from "@grammyjs/conversations";
import orderController from "../database/controllers/order";
import User from "../database/models/User";
import Order from "../database/models/Order";

export async function approveOrderConversation(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
) {
  if (!ctx.callbackQuery?.data) {
    await ctx.reply("❌ Некорректный запрос");
    return;
  }

  const data = ctx.callbackQuery.data;
  
  if (data.startsWith("approve_order:")) {
    const orderId = data.split(":")[1];
    
    try {
      await ctx.answerCallbackQuery("⏳ Обрабатываем одобрение...");
      
      const result = await orderController.approveOrder(orderId, ctx.from!.id);
      
      if (result.success) {
        let message = "✅ <b>ЗАКАЗ ОДОБРЕН</b>\n\n";
        message += `💳 Заказ: ${result.order.orderNumber}\n`;
        message += `💰 Сумма: ${result.order.totalAmount} ₽\n`;
        message += `📅 Одобрено: ${new Date().toLocaleString('ru-RU')}\n\n`;
        message += `💸 <b>Выплаты продавцам:</b>\n`;
        
        for (const payout of result.payouts) {
          if (payout.error) {
            message += `\n❌ Продавец ${payout.sellerId}\n`;
            message += `└ Ошибка: ${payout.error}\n`;
          } else {
            message += `\n✅ Продавец ${payout.sellerId}\n`;
            message += `├ Сумма: ${payout.amount} ₽\n`;
            message += `├ ID выплаты: <code>${payout.payoutId}</code>\n`;
            message += `└ Статус: ${payout.status}\n`;
          }
        }
        
        await ctx.editMessageText(message, { parse_mode: "HTML" });
        
        const order = await Order.findById(orderId).populate("buyerId");
        if (order && order.buyerId) {
          const buyer = order.buyerId as any;
          if (buyer.telegramId) {
            try {
              await ctx.api.sendMessage(
                buyer.telegramId,
                "✅ <b>Ваш заказ одобрен!</b>\n\n" +
                `💳 Заказ: ${order.orderNumber}\n` +
                `💰 Сумма: ${order.totalAmount} ₽\n\n` +
                "📦 Продавцы получили выплаты и скоро свяжутся с вами для передачи товара.",
                { parse_mode: "HTML" }
              );
            } catch (e) {
              console.error("Failed to notify buyer:", e);
            }
          }
        }
        
        // Уведомляем продавцов
        for (const item of result.order.items) {
          try {
            const seller = await User.findById(item.sellerId);
            if (seller && seller.telegramId) {
              const itemTotal = (item.price || 0) * (item.quantity || 0);
              const sellerAmount = Math.round(itemTotal * 0.9);
              
              await ctx.api.sendMessage(
                seller.telegramId,
                "💰 <b>ВЫПЛАТА ОДОБРЕНА!</b>\n\n" +
                `💳 Заказ: ${result.order.orderNumber}\n` +
                `📦 Товар: ${item.name}\n` +
                `💸 Сумма выплаты: ${sellerAmount} ₽\n\n` +
                "✅ Деньги отправлены на вашу карту.\n" +
                "📞 Пожалуйста, свяжитесь с покупателем для передачи товара.",
                { parse_mode: "HTML" }
              );
            }
          } catch (e) {
            console.error(`Failed to notify seller ${item.sellerId}:`, e);
          }
        }
      }
    } catch (err) {
      console.error("Error approving order:", err);
      const errorMessage = err instanceof Error ? err.message : "Неизвестная ошибка";
      await ctx.editMessageText(
        `❌ <b>Ошибка при одобрении заказа</b>\n\n${errorMessage}`,
        { parse_mode: "HTML" }
      );
    }
    
    return;
  }
  
  if (data.startsWith("reject_order:")) {
    const orderId = data.split(":")[1];
    
    await ctx.answerCallbackQuery();
    await ctx.reply("❌ Введите причину отклонения заказа:");
    
    const reasonCtx = await conversation.wait();
    
    if (!reasonCtx.message?.text) {
      await ctx.reply("❌ Причина не указана. Отмена операции.");
      return;
    }
    
    const reason = reasonCtx.message.text;
    
    try {
      const result = await orderController.rejectOrder(orderId, ctx.from!.id, reason);
      
      if (result.success) {
        let message = "❌ <b>ЗАКАЗ ОТКЛОНЕН</b>\n\n";
        message += `💳 Заказ: ${result.order.orderNumber}\n`;
        message += `💰 Сумма: ${result.order.totalAmount} ₽\n`;
        message += `📅 Отклонено: ${new Date().toLocaleString('ru-RU')}\n`;
        message += `📝 Причина: ${reason}`;
        
        await ctx.reply(message, { parse_mode: "HTML" });
        
        const order = await Order.findById(orderId).populate("buyerId");
        if (order && order.buyerId) {
          const buyer = order.buyerId as any;
          if (buyer.telegramId) {
            try {
              await ctx.api.sendMessage(
                buyer.telegramId,
                "❌ <b>Ваш заказ отклонен</b>\n\n" +
                `💳 Заказ: ${order.orderNumber}\n` +
                `💰 Сумма: ${order.totalAmount} ₽\n\n` +
                `📝 Причина: ${reason}\n\n` +
                "💳 Деньги будут возвращены на ваш счет в течение 5-10 рабочих дней.",
                { parse_mode: "HTML" }
              );
            } catch (e) {
              console.error("Failed to notify buyer:", e);
            }
          }
        }
        
        // Уведомляем продавцов
        for (const item of result.order.items) {
          try {
            const seller = await User.findById(item.sellerId);
            if (seller && seller.telegramId) {
              await ctx.api.sendMessage(
                seller.telegramId,
                "❌ <b>ЗАКАЗ ОТКЛОНЕН АДМИНИСТРАТОРОМ</b>\n\n" +
                `💳 Заказ: ${result.order.orderNumber}\n` +
                `📦 Товар: ${item.name}\n\n` +
                `📝 Причина: ${reason}\n\n` +
                "Выплата не будет произведена.",
                { parse_mode: "HTML" }
              );
            }
          } catch (e) {
            console.error(`Failed to notify seller ${item.sellerId}:`, e);
          }
        }
      }
    } catch (err) {
      console.error("Error rejecting order:", err);
      const errorMessage = err instanceof Error ? err.message : "Неизвестная ошибка";
      await ctx.reply(`❌ <b>Ошибка при отклонении заказа</b>\n\n${errorMessage}`, {
        parse_mode: "HTML"
      });
    }
    
    return;
  }
}
