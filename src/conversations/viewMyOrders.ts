import { Conversation } from "@grammyjs/conversations";
import { MyContext } from "../types/bot";
import { InlineKeyboard } from "grammy";
import Order from "../database/models/Order";
import userService from "../database/controllers/user";
import { getBuyerKeyboard } from "../shared/keyboards";

export async function viewMyOrders(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
) {
  const userId = ctx.from!.id;
  const user = await userService.getUserById(userId);

  if (!user) {
    await ctx.reply("❌ Пользователь не найден");
    return;
  }

  const orders = await Order.find({ buyerId: user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  if (orders.length === 0) {
    await ctx.reply(
      "📋 <b>Мои заказы</b>\n\n" +
      "У вас пока нет заказов.\n" +
      "Выберите товары из каталога и оформите заказ!",
      {
        parse_mode: "HTML",
        reply_markup: getBuyerKeyboard(user.profiles.seller.isActive)
      }
    );
    return;
  }

  const statusEmoji: Record<string, string> = {
    pending: "⏳",
    paid: "✅",
    processing: "📦",
    completed: "🎉",
    cancelled: "❌"
  };

  const statusText: Record<string, string> = {
    pending: "Ожидает оплаты",
    paid: "Оплачен",
    processing: "В обработке",
    completed: "Завершён",
    cancelled: "Отменён"
  };

  let currentIndex = 0;

  const showOrder = async (index: number) => {
    const order = orders[index];
    const status = statusEmoji[order.status] || "❓";
    const statusName = statusText[order.status] || order.status;

    let message = 
      `📋 <b>Заказ ${index + 1} из ${orders.length}</b>\n\n` +
      `🆔 <b>Номер:</b> <code>${order.orderNumber}</code>\n` +
      `${status} <b>Статус:</b> ${statusName}\n` +
      `💰 <b>Сумма:</b> ${order.totalAmount} ₽\n` +
      `📅 <b>Дата:</b> ${new Date(order.createdAt).toLocaleString('ru-RU')}\n\n`;

    if (order.items && order.items.length > 0) {
      message += `<b>Товары (${order.items.length}):</b>\n`;
      order.items.forEach((item: any, i: number) => {
        message += `${i + 1}. ${item.name} - ${item.quantity} шт. × ${item.price} ₽\n`;
      });
    }

    if (order.paidAt) {
      message += `\n✅ <b>Оплачен:</b> ${new Date(order.paidAt).toLocaleString('ru-RU')}`;
    }

    const keyboard = new InlineKeyboard();

    if (index > 0) {
      keyboard.text("⬅️", "order_prev");
    }
    
    keyboard.text(`${index + 1}/${orders.length}`, "order_noop");
    
    if (index < orders.length - 1) {
      keyboard.text("➡️", "order_next");
    }

    keyboard.row().text("↩️ Закрыть", "order_close");

    return message;
  };

  let lastMessageId: number | undefined;
  const msg = await ctx.reply(await showOrder(currentIndex), {
    parse_mode: "HTML",
    reply_markup: ((): InlineKeyboard => {
      const keyboard = new InlineKeyboard();
      if (currentIndex > 0) keyboard.text("⬅️", "order_prev");
      keyboard.text(`${currentIndex + 1}/${orders.length}`, "order_noop");
      if (currentIndex < orders.length - 1) keyboard.text("➡️", "order_next");
      keyboard.row().text("↩️ Закрыть", "order_close");
      return keyboard;
    })()
  });
  lastMessageId = msg.message_id;

  while (true) {
    const callbackCtx = await conversation.waitFor("callback_query:data");
    const data = callbackCtx.callbackQuery.data;

    if (data === "order_close") {
      await callbackCtx.answerCallbackQuery("✅ Закрыто");
      if (lastMessageId) {
        try {
          await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId);
        } catch (e) {}
      }
      break;
    }

    if (data === "order_next" && currentIndex < orders.length - 1) {
      currentIndex++;
      await callbackCtx.answerCallbackQuery();
      if (lastMessageId) {
        try {
          await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId);
        } catch (e) {}
      }
      const newMsg = await ctx.reply(await showOrder(currentIndex), {
        parse_mode: "HTML",
        reply_markup: ((): InlineKeyboard => {
          const keyboard = new InlineKeyboard();
          if (currentIndex > 0) keyboard.text("⬅️", "order_prev");
          keyboard.text(`${currentIndex + 1}/${orders.length}`, "order_noop");
          if (currentIndex < orders.length - 1) keyboard.text("➡️", "order_next");
          keyboard.row().text("↩️ Закрыть", "order_close");
          return keyboard;
        })()
      });
      lastMessageId = newMsg.message_id;
      continue;
    }

    if (data === "order_prev" && currentIndex > 0) {
      currentIndex--;
      await callbackCtx.answerCallbackQuery();
      if (lastMessageId) {
        try {
          await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId);
        } catch (e) {}
      }
      const newMsg = await ctx.reply(await showOrder(currentIndex), {
        parse_mode: "HTML",
        reply_markup: ((): InlineKeyboard => {
          const keyboard = new InlineKeyboard();
          if (currentIndex > 0) keyboard.text("⬅️", "order_prev");
          keyboard.text(`${currentIndex + 1}/${orders.length}`, "order_noop");
          if (currentIndex < orders.length - 1) keyboard.text("➡️", "order_next");
          keyboard.row().text("↩️ Закрыть", "order_close");
          return keyboard;
        })()
      });
      lastMessageId = newMsg.message_id;
      continue;
    }

    if (data === "order_noop") {
      await callbackCtx.answerCallbackQuery();
      continue;
    }

    await callbackCtx.answerCallbackQuery();
  }
}
