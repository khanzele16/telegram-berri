import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import { MyContext } from "../types/bot";
import userService from "../database/controllers/user";
import Product from "../database/models/Product";
import { getSellerKeyboard } from "../shared/keyboards";

export async function viewMyProducts(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
) {
  const user = await userService.getUserById(ctx.from!.id);
  
  if (!user?.profiles.seller.isActive || !user.profiles.seller.shopId) {
    await ctx.reply("❌ Вы не зарегистрированы как продавец");
    return;
  }

  const products = await Product.find({ 
    sellerId: user._id,
    isActive: true 
  })
  .populate('categoryId', 'name emoji')
  .sort({ createdAt: -1 })
  .limit(50);

  if (products.length === 0) {
    await ctx.reply(
      "📦 У вас пока нет товаров\n\n" +
      "Нажмите кнопку '➕ Добавить товар', чтобы начать продавать!",
      { reply_markup: getSellerKeyboard(user.profiles.buyer.isActive) }
    );
    return;
  }

  await ctx.reply(
    `📦 <b>Ваши товары (${products.length})</b>\n\n` +
    `Выберите товар для просмотра деталей:`,
    { parse_mode: "HTML" }
  );

  // Отправляем товары по одному с клавиатурой
  for (const product of products) {
    const category = product.categoryId as unknown as { name: string; emoji: string };
    const statusEmoji = product.status === 'available' ? '✅' : 
                       product.status === 'out_of_stock' ? '❌' : '🔒';
    
    // Подсчитываем медиа
    const mediaCount = product.media?.length || 0;
    const photoCount = product.media?.filter(m => m.mediaType === 'photo').length || 0;
    const videoCount = product.media?.filter(m => m.mediaType === 'video').length || 0;
    
    let message = 
      `${statusEmoji} <b>${product.name}</b>\n\n` +
      `📝 ${product.description}\n\n` +
      `💰 <b>Цена:</b> ${product.price} ₽\n` +
      `📊 <b>Количество:</b> ${product.quantity} шт.\n` +
      `🏷️ <b>Категория:</b> ${category?.emoji} ${category?.name}\n`;
    
    if (photoCount > 0) message += `📸 <b>Фото:</b> ${photoCount} шт.\n`;
    if (videoCount > 0) message += `🎥 <b>Видео:</b> ${videoCount} шт.\n`;
    
    message += `👁️ <b>Просмотров:</b> ${product.viewsCount}\n` +
      `🛒 <b>Заказов:</b> ${product.ordersCount}`;

    if (product.location?.latitude && product.location?.longitude) {
      message += `\n📍 <b>Геолокация:</b> добавлена`;
    }

    message += `\n\n🆔 <code>${product._id}</code>`;

    const keyboard = new InlineKeyboard()
      .text("✏️ Изменить", `edit_product:${product._id}`)
      .text("🗑️ Удалить", `delete_product:${product._id}`)
      .row()
      .text(product.status === 'available' ? '🔒 Скрыть' : '✅ Показать', `toggle_product:${product._id}`);

    // Отправляем первое медиа
    const firstMedia = product.media && product.media.length > 0 ? product.media[0] : null;
    
    if (firstMedia && firstMedia.fileId) {
      if (firstMedia.mediaType === 'video') {
        await ctx.replyWithVideo(firstMedia.fileId, {
          caption: message,
          parse_mode: "HTML",
          reply_markup: keyboard
        });
      } else {
        await ctx.replyWithPhoto(firstMedia.fileId, {
          caption: message,
          parse_mode: "HTML",
          reply_markup: keyboard
        });
      }
    } else if (product.images && product.images.length > 0 && product.images[0].fileId) {
      // Fallback на старое поле images
      await ctx.replyWithPhoto(product.images[0].fileId, {
        caption: message,
        parse_mode: "HTML",
        reply_markup: keyboard
      });
    } else {
      await ctx.reply(message, {
        parse_mode: "HTML",
        reply_markup: keyboard
      });
    }

    // Небольшая задержка между сообщениями
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  await ctx.reply(
    "Выше показаны все ваши товары",
    { reply_markup: getSellerKeyboard(user.profiles.buyer.isActive) }
  );
}
