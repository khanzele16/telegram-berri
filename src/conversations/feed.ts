import Product from "../database/models/Product";
import userService from "../database/controllers/user";
import { InlineKeyboard } from "grammy";
import { MyConversation, MyConversationContext } from "../types/bot";
import { getBuyerKeyboard } from "../shared/keyboards";

export async function productFeed(
  conversation: MyConversation,
  ctx: MyConversationContext
) {
  const user = await userService.getUserById(ctx.from!.id);
  
  if (!user?.profiles.buyer.isActive) {
    await ctx.reply("❌ Эта функция доступна только покупателям");
    return;
  }
  try {
    await ctx.reply("📱 Открываю ленту...", { reply_markup: { remove_keyboard: true } });
  } catch (err) {
  }

  let currentIndex = 0;
  let currentMessageIds: number[] = [];
  let totalCount = 0;
  let viewedProducts = new Set<string>();

  Product.find({ 
    isActive: true,
    isApproved: true,
    status: 'available',
    quantity: { $gt: 0 }
  })
  .populate('sellerId', '_id')
  .then(products => {
    const filtered = products.filter(p => {
      const seller = p.sellerId as any;
      return seller && seller._id && seller._id.toString() !== user._id.toString();
    });
    totalCount = filtered.length;
  }).catch(err => {
    console.error("Ошибка подсчёта товаров:", err);
    totalCount = 0;
  });

  const loadProduct = async (index: number) => {
    const products = await Product.find({ 
      isActive: true,
      isApproved: true,
      status: 'available',
      quantity: { $gt: 0 }
    })
    .populate('categoryId', 'name emoji')
    .populate('shopId', 'name')
    .populate('sellerId', '_id')
    .sort({ createdAt: -1 })
    .limit(100);

    const filteredProducts = products.filter(p => {
      const seller = p.sellerId as any;
      return seller && seller._id && seller._id.toString() !== user._id.toString();
    });

    return filteredProducts[index] || null;
  };

  const showProduct = async (index: number, deleteOldMessages: boolean = false, oldMessageIds: number[] = []): Promise<number[]> => {
    const product = await loadProduct(index);
    
    if (!product) {
      await ctx.reply("❌ Товар не найден");
      return oldMessageIds;
    }

    const productIdStr = product._id.toString();
    if (!viewedProducts.has(productIdStr)) {
      viewedProducts.add(productIdStr);
      try {
        await Product.updateOne(
          { _id: product._id },
          { $inc: { viewsCount: 1 } }
        );
        product.viewsCount = (product.viewsCount || 0) + 1;
      } catch (err) {
        console.error("Ошибка увеличения счетчика просмотров:", err);
      }
    }

    const category = product.categoryId as unknown as { name: string; emoji: string };
    const shop = product.shopId as unknown as { name: string };

    let message = 
      `<b>${product.name}</b>\n\n` +
      `📝 ${product.description}\n\n` +
      `💰 <b>Цена:</b> ${product.price} ₽\n` +
      `📊 <b>В наличии:</b> ${product.quantity} шт.\n` +
      `🏷️ <b>Категория:</b> ${category?.emoji} ${category?.name}\n` +
      `🏪 <b>Магазин:</b> ${shop?.name}\n` +
      `👁️ <b>Просмотров:</b> ${product.viewsCount}`;

    if (product.location?.latitude && product.location?.longitude) {
      message += `\n📍 <b>Есть геолокация</b>`;
    }

    message += `\n\n<i>⬅️ Предыдущий товар | ➡️ Следующий товар</i>`;

    const keyboard = new InlineKeyboard();

    if (index > 0) {
      keyboard.text("⬅️", `feed_prev:${index}`);
    }
    
    const counterText = totalCount > 0 ? `${index + 1}/${totalCount}` : `${index + 1}`;
    keyboard.text(counterText, `feed_noop`);
    
    if (totalCount === 0 || index < totalCount - 1) {
      keyboard.text("➡️", `feed_next:${index}`);
    }

    keyboard.row();

    keyboard
      .text("🛒 В корзину", `add_to_cart:${product._id}`)
      .text("💳 Купить", `feed_buy_now:${product._id}`)
      .row();

    if (product.location?.latitude && product.location?.longitude) {
      keyboard.text("📍 Показать на карте", `show_location:${product._id}`).row();
    }

    keyboard.text("↩️ Перейти в меню", `feed_exit`);

    if (deleteOldMessages && oldMessageIds.length > 0) {
      for (const msgId of oldMessageIds) {
        try {
          await ctx.api.deleteMessage(ctx.chat!.id, msgId);
        } catch (error) {
          console.warn(`Не удалось удалить сообщение ${msgId}:`, error);
        }
      }
    }

    const mediaItems = product.media && product.media.length > 0 ? product.media : [];
    
    const newMessageIds: number[] = [];

    if (mediaItems.length > 1) {
      try {
        const { InputMediaBuilder } = await import("grammy");
        const mediaGroup: Array<ReturnType<typeof InputMediaBuilder.photo | typeof InputMediaBuilder.video>> = [];

        for (let i = 0; i < mediaItems.length && i < 10; i++) {
          const media = mediaItems[i];
          if (!media.fileId) continue;

          if (media.mediaType === 'video') {
            mediaGroup.push(InputMediaBuilder.video(media.fileId, {
              caption: i === 0 ? message : undefined,
              parse_mode: i === 0 ? "HTML" : undefined
            }));
          } else {
            mediaGroup.push(InputMediaBuilder.photo(media.fileId, {
              caption: i === 0 ? message : undefined,
              parse_mode: i === 0 ? "HTML" : undefined
            }));
          }
        }

        if (mediaGroup.length > 0) {
          const sentMessages = await ctx.replyWithMediaGroup(mediaGroup);
          sentMessages.forEach(msg => newMessageIds.push(msg.message_id));
          const buttonsMsg = await ctx.reply("👆 Управление товаром:", {
            reply_markup: keyboard
          });
          newMessageIds.push(buttonsMsg.message_id);
        } else {
          const sentMsg = await ctx.reply(message, {
            parse_mode: "HTML",
            reply_markup: keyboard
          });
          newMessageIds.push(sentMsg.message_id);
        }
      } catch (error) {
        console.error("Ошибка отправки медиагруппы:", error);
        const firstMedia = mediaItems[0];
        if (firstMedia.mediaType === 'video' && firstMedia.fileId) {
          const sentMsg = await ctx.replyWithVideo(firstMedia.fileId, {
            caption: message,
            parse_mode: "HTML",
            reply_markup: keyboard
          });
          newMessageIds.push(sentMsg.message_id);
        } else if (firstMedia.fileId) {
          const sentMsg = await ctx.replyWithPhoto(firstMedia.fileId, {
            caption: message,
            parse_mode: "HTML",
            reply_markup: keyboard
          });
          newMessageIds.push(sentMsg.message_id);
        } else {
          const sentMsg = await ctx.reply(message, {
            parse_mode: "HTML",
            reply_markup: keyboard
          });
          newMessageIds.push(sentMsg.message_id);
        }
      }
    } else if (mediaItems.length === 1) {
      const firstMedia = mediaItems[0];
      
      try {
        if (firstMedia.mediaType === 'video' && firstMedia.fileId) {
          const sentMsg = await ctx.replyWithVideo(firstMedia.fileId, {
            caption: message,
            parse_mode: "HTML",
            reply_markup: keyboard
          });
          newMessageIds.push(sentMsg.message_id);
        } else if (firstMedia.fileId) {
          const sentMsg = await ctx.replyWithPhoto(firstMedia.fileId, {
            caption: message,
            parse_mode: "HTML",
            reply_markup: keyboard
          });
          newMessageIds.push(sentMsg.message_id);
        } else {
          const sentMsg = await ctx.reply(message, {
            parse_mode: "HTML",
            reply_markup: keyboard
          });
          newMessageIds.push(sentMsg.message_id);
        }
      } catch (error) {
        console.error("Ошибка отправки медиа:", error);
        const sentMsg = await ctx.reply(message, {
          parse_mode: "HTML",
          reply_markup: keyboard
        });
        newMessageIds.push(sentMsg.message_id);
      }
    } else {
      const sentMsg = await ctx.reply(message, {
        parse_mode: "HTML",
        reply_markup: keyboard
      });
      newMessageIds.push(sentMsg.message_id);
    }

    return newMessageIds;
  };

  currentMessageIds = await showProduct(currentIndex);

  if (currentMessageIds.length === 0) {
    await ctx.reply(
      "📱 Лента товаров пуста\n\n" +
      "Пока что продавцы не добавили ни одного товара.\n" +
      "Загляните позже!",
      { reply_markup: getBuyerKeyboard(user.profiles.seller.isActive) }
    );
    return;
  }

  while (true) {
    const callbackCtx = await conversation.waitFor("callback_query:data");
    const data = callbackCtx.callbackQuery.data;

    if (data.startsWith("feed_next:")) {
      const oldIndex = parseInt(data.split(":")[1]);
      if (oldIndex === currentIndex) {
        if (totalCount > 0 && currentIndex >= totalCount - 1) {
          await callbackCtx.answerCallbackQuery("📍 Это последний товар");
          continue;
        }

        await callbackCtx.answerCallbackQuery("⏳ Загрузка...");
        currentIndex++;
        const newMessageIds = await showProduct(currentIndex, true, currentMessageIds);
        
        if (newMessageIds.length === 0) {
          currentIndex--;
          await ctx.api.answerCallbackQuery(callbackCtx.callbackQuery.id, {
            text: "📍 Больше товаров нет"
          });
          continue;
        }
        currentMessageIds = newMessageIds;
      } else {
        await callbackCtx.answerCallbackQuery();
      }
      continue;
    }

    if (data.startsWith("feed_prev:")) {
      const oldIndex = parseInt(data.split(":")[1]);
      if (oldIndex === currentIndex && currentIndex > 0) {
        await callbackCtx.answerCallbackQuery("⏳ Загрузка...");
        currentIndex--;
        currentMessageIds = await showProduct(currentIndex, true, currentMessageIds);
      } else {
        await callbackCtx.answerCallbackQuery();
      }
      continue;
    }

    if (data === "feed_noop") {
      await callbackCtx.answerCallbackQuery();
      continue;
    }

    if (data === "feed_exit") {
      await callbackCtx.answerCallbackQuery("✅ Закрываю ленту");
      for (const msgId of currentMessageIds) {
        try {
          await ctx.api.deleteMessage(ctx.chat!.id, msgId);
        } catch (e) {
          console.warn(`Не удалось удалить сообщение ${msgId}:`, e);
        }
      }
      break;
    }

    if (data.startsWith("add_to_cart:")) {
      const productId = data.split(":")[1];
      await callbackCtx.answerCallbackQuery();
      try {
        const cartService = (await import("../database/controllers/cart")).default;
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

    if (data.startsWith("feed_buy_now:")) {
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

        const minAmount = 60;
        if (product.price < minAmount) {
          await ctx.reply(`❌ Минимальная сумма для оплаты: ${minAmount} ₽\nЦена товара: ${product.price} ₽`);
          continue;
        }

        const Order = (await import("../database/models/Order")).default;
        const orderNumber = `ORD-${Date.now()}`;
        const totalAmount = product.price;
        const commissionPercent = 10;
        const commission = Math.round(totalAmount * commissionPercent / 100);

        const title = `Заказ ${orderNumber}`.slice(0, 32);
        const description = `${product.name}`.slice(0, 255);

        await ctx.replyWithInvoice(
          title,
          description,
          orderNumber,
          "RUB",
          [
            {
              label: product.name.slice(0, 50),
              amount: product.price * 100,
            },
            {
              label: "Комиссия платформы",
              amount: commission * 100,
            },
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
          items: [
            {
              productId: product._id,
              sellerId: product.shopId,
              name: product.name,
              price: product.price,
              quantity: 1,
            },
          ],
          totalAmount: totalAmount + commission,
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

    if (data.startsWith("product_details:")) {
      const productId = data.split(":")[1];
      try {
        const product = await Product.findById(productId)
          .populate('categoryId', 'name emoji')
          .populate('shopId', 'name');
        
        if (product) {
          const category = product.categoryId as unknown as { name: string; emoji: string };
          const shop = product.shopId as unknown as { name: string };
          
          let detailsMsg = 
            `<b>📦 Подробная информация о товаре</b>\n\n` +
            `<b>Название:</b> ${product.name}\n` +
            `<b>Описание:</b> ${product.description}\n\n` +
            `<b>💰 Цена:</b> ${product.price} ₽\n` +
            `<b>📊 В наличии:</b> ${product.quantity} шт.\n` +
            `<b>🏷️ Категория:</b> ${category?.emoji} ${category?.name}\n` +
            `<b>🏪 Магазин:</b> ${shop?.name}\n\n` +
            `<b>👁️ Просмотров:</b> ${product.viewsCount}\n` +
            `<b>🛒 Заказов:</b> ${product.ordersCount}\n\n` +
            `<b>🆔 ID:</b> <code>${product._id}</code>`;

          const mediaItems = product.media && product.media.length > 0 ? product.media : [];
          
          if (mediaItems.length > 0) {
            const firstMedia = mediaItems[0];
            if (firstMedia.fileId) {
              if (firstMedia.mediaType === 'video') {
                await ctx.replyWithVideo(firstMedia.fileId, {
                  caption: detailsMsg,
                  parse_mode: 'HTML'
                });
              } else {
                await ctx.replyWithPhoto(firstMedia.fileId, {
                  caption: detailsMsg,
                  parse_mode: 'HTML'
                });
              }
            }

            for (let i = 1; i < mediaItems.length; i++) {
              const media = mediaItems[i];
              if (media.fileId) {
                try {
                  if (media.mediaType === 'video') {
                    await ctx.replyWithVideo(media.fileId);
                  } else {
                    await ctx.replyWithPhoto(media.fileId);
                  }
                } catch (err) {
                  console.error(`Ошибка отправки медиа ${i}:`, err);
                }
              }
            }
          } else if (product.images && product.images.length > 0 && product.images[0].fileId) {
            await ctx.replyWithPhoto(product.images[0].fileId, {
              caption: detailsMsg,
              parse_mode: 'HTML'
            });
          } else {
            await ctx.reply(detailsMsg, { parse_mode: 'HTML' });
          }
          await callbackCtx.answerCallbackQuery();
        } else {
          await callbackCtx.answerCallbackQuery("❌ Товар не найден");
        }
      } catch (err) {
        console.error("Ошибка получения информации о товаре:", err);
        await callbackCtx.answerCallbackQuery("❌ Ошибка при получении информации");
      }
      continue;
    }

    if (data.startsWith("show_location:")) {
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
    if (data.startsWith("add_to_wishlist:")) {
      continue;
    }
    await callbackCtx.answerCallbackQuery();
  }

  try {
    await ctx.reply("✅ Возврат в меню", {
      reply_markup: getBuyerKeyboard(user.profiles.seller.isActive),
    });
  } catch (err) {
    console.error("Ошибка при восстановлении клавиатуры:", err);
  }
}