import Product from "../database/models/Product";
import Category from "../database/models/Category";
import Order from "../database/models/Order";
import userService from "../database/controllers/user";
import cartService from "../database/controllers/cart";
import { InlineKeyboard } from "grammy";
import { MyContext } from "../types/bot";
import { Conversation } from "@grammyjs/conversations";
import { getBuyerKeyboard } from "../shared/keyboards";

const MIN_PAYMENT_AMOUNT = 60;
const COMMISSION_PERCENT = 10;

export async function catalog(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
) {
  const user = await userService.getUserById(ctx.from!.id);
  
  if (!user?.profiles.buyer.isActive) {
    await ctx.reply("❌ Эта функция доступна только покупателям");
    return;
  }

  const categories = await Category.find({ isActive: true }).sort({ order: 1 });

  if (categories.length === 0) {
    await ctx.reply(
      "📦 Каталог пуст\n\nПока нет доступных категорий товаров.",
      { reply_markup: getBuyerKeyboard(user.profiles.seller.isActive) }
    );
    return;
  }

  let currentCategory: any = null;
  let currentIndex = 0;
  let currentMessageIds: number[] = [];
  let categoryProducts: any[] = [];
  let categoriesMessageId: number | null = null;

  while (true) {
    if (!currentCategory && categoriesMessageId === null) {
      const categoryKeyboard = new InlineKeyboard();
      
      categories.forEach((category, index) => {
        categoryKeyboard.text(
          `${category.emoji} ${category.name}`,
          `catalog_category:${category._id}`
        );
        if ((index + 1) % 2 === 0) {
          categoryKeyboard.row();
        }
      });
      
      categoryKeyboard.row().text("↩️ Вернуться в меню", "catalog_exit");

      const msg = await ctx.reply(
        "📦 <b>Каталог товаров</b>\n\n" +
        "Выберите категорию для просмотра товаров:",
        {
          parse_mode: "HTML",
          reply_markup: categoryKeyboard
        }
      );
      categoriesMessageId = msg.message_id;
    }

    const callbackCtx = await conversation.waitFor("callback_query:data");
    const data = callbackCtx.callbackQuery.data;

    if (data === "catalog_exit") {
      await callbackCtx.answerCallbackQuery("✅ Возврат в меню");
      
      await deleteMessages(ctx, [...currentMessageIds, categoriesMessageId].filter(Boolean) as number[]);
      
      await ctx.reply("Главное меню:", {
        reply_markup: getBuyerKeyboard(user.profiles.seller.isActive)
      });
      break;
    }

    if (data.startsWith("catalog_category:")) {
      const categoryId = data.split(":")[1];
      currentCategory = categories.find(c => c._id.toString() === categoryId);
      
      if (!currentCategory) {
        await callbackCtx.answerCallbackQuery("❌ Категория не найдена");
        continue;
      }

      await callbackCtx.answerCallbackQuery(`📂 Загрузка товаров из категории ${currentCategory.name}...`);

      const allProducts = await Product.find({
        categoryId: currentCategory._id,
        isActive: true,
        isApproved: true,
        status: 'available',
        quantity: { $gt: 0 }
      })
      .populate('categoryId', 'name emoji')
      .populate('shopId', 'name')
      .populate('sellerId', '_id')
      .sort({ createdAt: -1 });

      categoryProducts = allProducts.filter(p => {
        const seller = p.sellerId as any;
        return seller && seller._id && seller._id.toString() !== user._id.toString();
      });

      if (categoryProducts.length === 0) {
        await callbackCtx.answerCallbackQuery({
          text: `❌ В категории ${currentCategory.emoji} ${currentCategory.name} пока нет товаров`,
          show_alert: true
        });
        continue;
      }

      if (categoriesMessageId) {
        try {
          await ctx.api.deleteMessage(ctx.chat!.id, categoriesMessageId);
          categoriesMessageId = null;
        } catch (e) {}
      }

      currentIndex = 0;
      currentMessageIds = await showCatalogProduct(
        ctx,
        categoryProducts[currentIndex],
        currentIndex,
        categoryProducts.length,
        currentCategory
      );
      continue;
    }

    if (data === "catalog_next") {
      if (currentIndex < categoryProducts.length - 1) {
        await callbackCtx.answerCallbackQuery("⏳ Загрузка...");
        currentIndex++;
        await deleteMessages(ctx, currentMessageIds);
        currentMessageIds = await showCatalogProduct(ctx, categoryProducts[currentIndex], currentIndex, categoryProducts.length, currentCategory);
      } else {
        await callbackCtx.answerCallbackQuery("📍 Это последний товар в категории");
      }
      continue;
    }

    if (data === "catalog_prev") {
      if (currentIndex > 0) {
        await callbackCtx.answerCallbackQuery("⏳ Загрузка...");
        currentIndex--;
        await deleteMessages(ctx, currentMessageIds);
        currentMessageIds = await showCatalogProduct(ctx, categoryProducts[currentIndex], currentIndex, categoryProducts.length, currentCategory);
      } else {
        await callbackCtx.answerCallbackQuery("📍 Это первый товар в категории");
      }
      continue;
    }

    if (data === "catalog_back") {
      await callbackCtx.answerCallbackQuery("🔙 Возврат к категориям");
      await deleteMessages(ctx, currentMessageIds);
      currentMessageIds = [];
      currentCategory = null;
      categoriesMessageId = null;
      continue;
    }

    if (data.startsWith("catalog_add_cart:")) {
      const productId = data.split(":")[1];
      await callbackCtx.answerCallbackQuery();
      
      try {
        await cartService.addToCart(ctx.from!.id, productId, 1);
        await ctx.reply("🛒 Товар добавлен в корзину", {
          reply_markup: { remove_keyboard: true }
        }).then(msg => {
          setTimeout(() => {
            ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
          }, 2000);
        });
      } catch (err: unknown) {
        console.error("Ошибка добавления в корзину:", err);
        const errorMessage = err instanceof Error ? err.message : "❌ Ошибка при добавлении в корзину";
        await ctx.reply(errorMessage).then(msg => {
          setTimeout(() => {
            ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {});
          }, 3000);
        });
      }
      continue;
    }

    if (data.startsWith("catalog_buy_now:")) {
      const productId = data.split(":")[1];
      await callbackCtx.answerCallbackQuery();
      
      try {
        const product = await Product.findById(productId).populate("categoryId").populate("shopId");
        
        if (!product) {
          await ctx.reply("❌ Товар не найден");
          continue;
        }
        
        if (product.quantity < 1) {
          await ctx.reply("❌ Товар закончился");
          continue;
        }

        if (product.price < MIN_PAYMENT_AMOUNT) {
          await ctx.reply(`❌ Минимальная сумма для оплаты: ${MIN_PAYMENT_AMOUNT} ₽\nЦена товара: ${product.price} ₽`);
          continue;
        }

        const orderNumber = `ORD-${Date.now()}`;
        const commission = Math.round(product.price * COMMISSION_PERCENT / 100);

        await ctx.replyWithInvoice(
          `Заказ ${orderNumber}`.slice(0, 32),
          product.name.slice(0, 255),
          orderNumber,
          "RUB",
          [
            { label: product.name.slice(0, 50), amount: product.price * 100 },
            { label: "Комиссия платформы", amount: commission * 100 },
          ],
          {
            provider_token: process.env.PAYMENT_PROVIDER_TOKEN!,
            need_phone_number: true,
            need_shipping_address: false,
            is_flexible: false,
          }
        );

        await Order.create({
          orderNumber,
          buyerId: ctx.from!.id,
          items: [{
            productId: product._id,
            sellerId: product.shopId,
            name: product.name,
            price: product.price,
            quantity: 1,
          }],
          totalAmount: product.price + commission,
          status: "pending",
          paymentStatus: "pending",
        });

        await ctx.reply("✅ Счет отправлен. Нажмите 'Оплатить' для завершения покупки.");
        
      } catch (err: unknown) {
        console.error("Ошибка при создании заказа:", err);
        const errorMessage = err instanceof Error ? err.message : "❌ Ошибка при создании заказа";
        await ctx.reply(errorMessage);
      }
      continue;
    }

    if (data.startsWith("catalog_location:")) {
      const productId = data.split(":")[1];
      try {
        const product = await Product.findById(productId);
        if (product?.location?.latitude && product?.location?.longitude) {
          await ctx.replyWithLocation(
            product.location.latitude,
            product.location.longitude
          );
          await callbackCtx.answerCallbackQuery("📍 Геолокация отправлена");
        } else {
          await callbackCtx.answerCallbackQuery("❌ Геолокация недоступна");
        }
      } catch (err) {
        console.error("Ошибка отправки геолокации:", err);
        await callbackCtx.answerCallbackQuery("❌ Ошибка при отправке геолокации");
      }
      continue;
    }

    if (data === "catalog_noop") {
      await callbackCtx.answerCallbackQuery();
      continue;
    }

    await callbackCtx.answerCallbackQuery();
  }
}

async function deleteMessages(ctx: MyContext, messageIds: number[]): Promise<void> {
  for (const msgId of messageIds) {
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, msgId);
    } catch (e) {}
  }
}

function buildProductMessage(product: any, category: any, index: number, total: number): string {
  const shop = product.shopId as unknown as { name: string };
  const hasLocation = product.location?.latitude && product.location?.longitude;
  
  return `${category.emoji} <b>${category.name}</b>\n\n` +
    `<b>${product.name}</b>\n\n` +
    `📝 ${product.description}\n\n` +
    `💰 <b>Цена:</b> ${product.price} ₽\n` +
    `📊 <b>В наличии:</b> ${product.quantity} шт.\n` +
    `🏪 <b>Магазин:</b> ${shop?.name}\n` +
    `👁️ <b>Просмотров:</b> ${product.viewsCount || 0}` +
    (hasLocation ? `\n📍 <b>Есть геолокация</b>` : '') +
    `\n\n<i>Товар ${index + 1} из ${total}</i>`;
}

function buildProductKeyboard(product: any, index: number, total: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const hasLocation = product.location?.latitude && product.location?.longitude;

  if (index > 0) keyboard.text("⬅️", "catalog_prev");
  keyboard.text(`${index + 1}/${total}`, "catalog_noop");
  if (index < total - 1) keyboard.text("➡️", "catalog_next");

  keyboard.row()
    .text("🛒 В корзину", `catalog_add_cart:${product._id}`)
    .text("💳 Купить", `catalog_buy_now:${product._id}`);
  
  if (hasLocation) {
    keyboard.row().text("📍 Показать на карте", `catalog_location:${product._id}`);
  }

  return keyboard.row()
    .text("🔙 К категориям", "catalog_back")
    .text("↩️ В меню", "catalog_exit");
}

async function sendProductMedia(ctx: MyContext, message: string, keyboard: InlineKeyboard, mediaItems: any[]): Promise<number[]> {
  const messageIds: number[] = [];

  if (mediaItems.length > 1) {
    try {
      const { InputMediaBuilder } = await import("grammy");
      const mediaGroup = mediaItems.slice(0, 10).filter(m => m.fileId).map((media, i) => {
        const builder = media.mediaType === 'video' ? InputMediaBuilder.video : InputMediaBuilder.photo;
        return builder(media.fileId, {
          caption: i === 0 ? message : undefined,
          parse_mode: i === 0 ? "HTML" : undefined
        });
      });

      if (mediaGroup.length > 0) {
        const sentMessages = await ctx.replyWithMediaGroup(mediaGroup);
        messageIds.push(...sentMessages.map(msg => msg.message_id));
        
        const buttonsMsg = await ctx.reply("👆 Управление товаром:", { reply_markup: keyboard });
        messageIds.push(buttonsMsg.message_id);
      }
    } catch (error) {
      console.error("Ошибка отправки медиагруппы:", error);
      const firstMedia = mediaItems[0];
      if (firstMedia?.fileId) {
        const method = firstMedia.mediaType === 'video' ? 'replyWithVideo' : 'replyWithPhoto';
        const sentMsg = await ctx[method](firstMedia.fileId, { caption: message, parse_mode: "HTML", reply_markup: keyboard });
        messageIds.push(sentMsg.message_id);
      }
    }
  } else if (mediaItems.length === 1 && mediaItems[0].fileId) {
    const method = mediaItems[0].mediaType === 'video' ? 'replyWithVideo' : 'replyWithPhoto';
    const sentMsg = await ctx[method](mediaItems[0].fileId, { caption: message, parse_mode: "HTML", reply_markup: keyboard });
    messageIds.push(sentMsg.message_id);
  } else {
    const sentMsg = await ctx.reply(message, { parse_mode: "HTML", reply_markup: keyboard });
    messageIds.push(sentMsg.message_id);
  }

  return messageIds;
}

async function showCatalogProduct(
  ctx: MyContext,
  product: any,
  index: number,
  total: number,
  category: any
): Promise<number[]> {
  const message = buildProductMessage(product, category, index, total);
  const keyboard = buildProductKeyboard(product, index, total);
  const mediaItems = product.media?.length > 0 ? product.media : [];

  return await sendProductMedia(ctx, message, keyboard, mediaItems);
}
