import dotenv from "dotenv";
import userService from "../database/controllers/user";
import shopService from "../database/controllers/shop";
import { InlineKeyboard, Keyboard } from "grammy";
import { MyContext } from "../types/bot";
import type { Conversation } from "@grammyjs/conversations";
import { getBuyerKeyboard, getSellerKeyboard } from "../shared/keyboards";

dotenv.config({ path: "src/.env" });

export async function buyerRegistration(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
) {
  // Шаг: телефон - повторяем пока не получим контакт
  let phoneNumber: string;
  while (true) {
    await ctx.reply(
      "👤 Регистрация покупателя\n\nДля завершения регистрации, пожалуйста, поделитесь своим номером телефона:",
      {
        reply_markup: new Keyboard()
          .requestContact("📱 Поделиться номером телефона")
          .resized()
          .oneTime(),
      }
    );

    const contactCtx = await conversation.wait();

    if (!contactCtx.message?.contact) {
      await ctx.reply("❌ Необходимо отправить контакт для завершения регистрации. Попробуйте ещё раз.");
      continue;
    }

    phoneNumber = contactCtx.message.contact.phone_number;
    break;
  }

  await userService.findOrCreate(ctx.from!.id, {
    username: ctx.from?.username,
    first_name: ctx.from?.first_name,
    last_name: ctx.from?.last_name,
  });

  await userService.updatePhoneNumber(ctx.from!.id, phoneNumber);
  await userService.activateBuyer(ctx.from!.id);

  await conversation.external((ctx) => (ctx.session.profile = "buyer"));

  await ctx.reply(
    `<b>✅ Регистрация завершена!</b>\n\n` +
      `<b>Номер телефона:</b> ${phoneNumber}\n\n` +
      `📦 Теперь вы можете выбирать товары из каталога!`,
    {
      parse_mode: "HTML",
      reply_markup: getBuyerKeyboard(false),
    }
  );
}

export async function sellerRegistration(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
) {
  await ctx.reply(
    "<b>🏪 Регистрация продавца</b>\n\n<b>Шаг 1/3:</b> Пожалуйста, поделитесь своим номером телефона:",
    {
      parse_mode: "HTML",
      reply_markup: new Keyboard()
        .requestContact("📱 Поделиться номером телефона")
        .resized()
        .oneTime(),
    }
  );

  const contactCtx = await conversation.wait();

  if (!contactCtx.message?.contact) {
    await ctx.reply(
      "❌ Необходимо отправить контакт для завершения регистрации"
    );
    return;
  }

  const phoneNumber = contactCtx.message.contact.phone_number;
  await userService.updatePhoneNumber(ctx.from!.id, phoneNumber);

  // Шаг: название магазина — повторяем пока не введут корректное
  let shopName: string;
  while (true) {
    await ctx.reply(`<b>✅ Номер телефона: ${phoneNumber}</b>\n\n<b>Шаг 2/3:</b> Введите название вашего магазина:`, { parse_mode: "HTML", reply_markup: { remove_keyboard: true } });
    const shopNameCtx = await conversation.wait();
    if (!shopNameCtx.message?.text) {
      await ctx.reply("❌ Необходимо ввести название магазина. Попробуйте ещё раз.");
      continue;
    }
    shopName = shopNameCtx.message.text.trim();
    if (shopName.length < 3) {
      await ctx.reply("❌ Название должно содержать минимум 3 символа. Попробуйте ещё раз.");
      continue;
    }
    break;
  }

  // Шаг: номер карты — повторяем пока не введут корректный
  let cardNumber: string;
  while (true) {
    await ctx.reply(`<b>✅ Магазин: ${shopName}</b>\n\n<b>Шаг 3/4:</b> Введите номер карты для получения выплат (16 цифр):`, { parse_mode: "HTML" });
    const cardCtx = await conversation.wait();
    if (!cardCtx.message?.text) {
      await ctx.reply("❌ Необходимо ввести номер карты. Попробуйте ещё раз.");
      continue;
    }
    const card = cardCtx.message.text.replace(/\s/g, '').trim();
    if (!/^\d{16}$/.test(card)) {
      await ctx.reply("❌ Номер карты должен содержать 16 цифр. Попробуйте ещё раз.");
      continue;
    }
    cardNumber = card;
    break;
  }

  // Шаг: описание магазина — повторяем пока не введут корректное
  let description: string;
  while (true) {
    await ctx.reply(`<b>✅ Карта: ${cardNumber.slice(0,4)} **** **** ${cardNumber.slice(-4)}</b>\n\n<b>Шаг 4/4:</b> Введите описание вашего магазина (что продаете, особенности):`, { parse_mode: "HTML" });
    const descriptionCtx = await conversation.wait();
    if (!descriptionCtx.message?.text) {
      await ctx.reply("❌ Необходимо ввести описание магазина. Попробуйте ещё раз.");
      continue;
    }
    description = descriptionCtx.message.text.trim();
    if (description.length < 10) {
      await ctx.reply("❌ Описание слишком короткое (минимум 10 символов). Попробуйте ещё раз.");
      continue;
    }
    break;
  }

  const shop = await shopService.createShop(
    ctx.from!.id,
    shopName,
    description,
    cardNumber
  );

  await userService.activateSeller(ctx.from!.id, shop._id!.toString());
  await conversation.external((ctx) => (ctx.session.profile = "seller"));

  await ctx.reply(
    `✅ Поздравляем! Вы успешно зарегистрированы как продавец!\n\n` +
      `🏪 Магазин: ${shopName}\n` +
      `📝 Описание: ${description}\n` +
      `📱 Телефон: ${phoneNumber}\n\n` +
      `Ваш магазин отправлен на модерацию. После одобрения вы сможете добавлять товары.`,
    { reply_markup: getSellerKeyboard(false) }
  );

  if (process.env.ADMIN_ID) {
    try {
      const moderationKeyboard = new InlineKeyboard()
        .text("✅ Одобрить", `approve_shop:${shop._id}`)
        .text("❌ Отклонить", `reject_shop:${shop._id}`);

      console.log(`📤 Отправка уведомления админу (ID: ${process.env.ADMIN_ID}) о магазине ${shop._id}`);

      await ctx.api.sendMessage(
        process.env.ADMIN_ID,
        `🆕 Новый продавец!\n\n` +
          `👤 ${ctx.from?.first_name || ""} ${ctx.from?.last_name || ""}\n` +
          `📱 @${ctx.from?.username || "нет username"}\n` +
          `☎️ ${phoneNumber}\n` +
          `🏪 ${shopName}\n` +
          `📝 ${description}\n` +
          `💳 Карта: ${cardNumber.slice(0,4)} **** **** ${cardNumber.slice(-4)}\n` +
          `🆔 ID магазина: ${shop._id}`,
        {
          reply_markup: moderationKeyboard,
        }
      );

      console.log(`✅ Уведомление админу успешно отправлено`);
    } catch (error) {
      console.error("❌ Ошибка отправки уведомления админу:", error);
    }
  } else {
    console.warn("⚠️ ADMIN_ID не установлен в .env файле!");
  }
}

export async function bothRegistration(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
) {
  // Шаг 1: телефон - повторяем пока не получим контакт
  let phoneNumber: string;
  while (true) {
    await ctx.reply(
      "<b>🎭 Регистрация покупателя и продавца</b>\n\n<b>Шаг 1/3:</b> Пожалуйста, поделитесь своим номером телефона:",
      {
        parse_mode: "HTML",
        reply_markup: new Keyboard()
          .requestContact("📱 Поделиться номером телефона")
          .resized()
          .oneTime(),
      }
    );

    const contactCtx = await conversation.wait();

    if (!contactCtx.message?.contact) {
      await ctx.reply("❌ Необходимо отправить контакт для завершения регистрации. Попробуйте ещё раз.");
      continue;
    }

    phoneNumber = contactCtx.message.contact.phone_number;
    break;
  }

  const user = await userService.findOrCreate(ctx.from!.id, {
    username: ctx.from?.username,
    first_name: ctx.from?.first_name,
    last_name: ctx.from?.last_name,
  });

  await userService.updatePhoneNumber(ctx.from!.id, phoneNumber);
  await userService.activateBuyer(ctx.from!.id);

  // Шаг 2: название магазина - повторяем пока не введут корректное
  let shopName: string;
  while (true) {
    await ctx.reply(
      `<b>✅ Номер телефона: ${phoneNumber}</b>\n\n<b>Шаг 2/3:</b> Введите название вашего магазина:`,
      { reply_markup: { remove_keyboard: true }, parse_mode: "HTML" }
    );

    const shopNameCtx = await conversation.wait();

    if (!shopNameCtx.message?.text) {
      await ctx.reply("❌ Необходимо ввести название магазина. Попробуйте ещё раз.");
      continue;
    }

    shopName = shopNameCtx.message.text.trim();
    if (shopName.length < 3) {
      await ctx.reply("❌ Название должно содержать минимум 3 символа. Попробуйте ещё раз.");
      continue;
    }
    break;
  }

  let cardNumber: string;
  while (true) {
    await ctx.reply(`<b>✅ Магазин: ${shopName}</b>\n\n<b>Шаг 3/4:</b> Введите номер карты для получения выплат (16 цифр):`, { parse_mode: "HTML" });
    const cardCtx = await conversation.wait();
    if (!cardCtx.message?.text) {
      await ctx.reply("❌ Необходимо ввести номер карты. Попробуйте ещё раз.");
      continue;
    }
    const card = cardCtx.message.text.replace(/\s/g, '').trim();
    if (!/^\d{16}$/.test(card)) {
      await ctx.reply("❌ Номер карты должен содержать 16 цифр. Попробуйте ещё раз.");
      continue;
    }
    cardNumber = card;
    break;
  }

  // Шаг 4: описание магазина - повторяем пока не введут корректное
  let description: string;
  while (true) {
    await ctx.reply(
      `<b>✅ Карта: ${cardNumber.slice(0,4)} **** **** ${cardNumber.slice(-4)}</b>\n\n<b>Шаг 4/4:</b> Введите описание вашего магазина:`,
      { parse_mode: "HTML" }
    );

    const descriptionCtx = await conversation.wait();

    if (!descriptionCtx.message?.text) {
      await ctx.reply("❌ Необходимо ввести описание магазина. Попробуйте ещё раз.");
      continue;
    }

    description = descriptionCtx.message.text.trim();
    if (description.length < 10) {
      await ctx.reply("❌ Описание слишком короткое (минимум 10 символов). Попробуйте ещё раз.");
      continue;
    }
    break;
  }

  const shop = await shopService.createShop(
    ctx.from!.id,
    shopName,
    description,
    cardNumber
  );

  // Активируем профиль продавца
  await userService.activateSeller(ctx.from!.id, shop._id!.toString());
  await conversation.external((ctx) => (ctx.session.profile = "buyer"));

  await ctx.reply(
    `<b>✅ Поздравляем! Вы зарегистрированы как покупатель и продавец!</b>\n\n` +
      `<b>🏪 Магазин:</b> ${shopName}\n` +
      `<b>📝 Описание:</b> ${description}\n` +
      `<b>📱 Телефон:</b> ${phoneNumber}\n\n` +
      `Ваш магазин отправлен на модерацию. После одобрения вы сможете добавлять товары.\n\n` +
      `Сейчас активен профиль покупателя. Для переключения используйте кнопку "🏪 Перейти в продавцы"`,
    { parse_mode: "HTML", reply_markup: getBuyerKeyboard(true) }
  );

  if (process.env.ADMIN_ID) {
    try {
      const moderationKeyboard = new InlineKeyboard()
        .text("✅ Одобрить", `approve_shop:${shop._id}`)
        .text("❌ Отклонить", `reject_shop:${shop._id}`);

      console.log(`📤 Отправка уведомления админу (ID: ${process.env.ADMIN_ID}) о магазине ${shop._id}`);

      await ctx.api.sendMessage(
        process.env.ADMIN_ID,
        `🆕 Новый продавец (также покупатель)!\n\n` +
          `👤 ${ctx.from?.first_name || ""} ${ctx.from?.last_name || ""}\n` +
          `📱 @${ctx.from?.username || "нет username"}\n` +
          `☎️ ${phoneNumber}\n` +
          `🏪 ${shopName}\n` +
          `📝 ${description}\n` +
          `🆔 ID магазина: ${shop._id}`,
        {
          reply_markup: moderationKeyboard,
        }
      );

      console.log(`✅ Уведомление админу успешно отправлено`);
    } catch (error) {
      console.error("❌ Ошибка отправки уведомления админу:", error);
    }
  } else {
    console.warn("⚠️ ADMIN_ID не установлен в .env файле!");
  }
}

export async function searchProducts(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
) {
  const user = await userService.getUserById(ctx.from!.id);
  
  if (!user?.profiles.buyer.isActive) {
    await ctx.reply("❌ Эта функция доступна только покупателям");
    return;
  }

  await ctx.reply(
    "🔍 Поиск товаров\n\nВведите название товара или ключевое слово:",
    { reply_markup: { remove_keyboard: true } }
  );

  const searchCtx = await conversation.wait();

  if (!searchCtx.message?.text) {
    await ctx.reply("❌ Необходимо ввести текст для поиска");
    return;
  }

  const query = searchCtx.message.text.trim();

  // Поиск товаров по названию или описанию
  const Product = (await import("../database/models/Product")).default;
  const allResults = await Product.find({
    isActive: true,
    isApproved: true,
    status: 'available',
    quantity: { $gt: 0 },
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } }
    ]
  })
  .populate('categoryId', 'name emoji')
  .populate('shopId', 'name')
  .populate('sellerId', '_id')
  .sort({ createdAt: -1 });

  // Фильтруем свои товары
  const searchResults = allResults.filter(p => {
    const seller = p.sellerId as any;
    return seller && seller._id && seller._id.toString() !== user._id.toString();
  });

  if (searchResults.length === 0) {
    const keyboard = getBuyerKeyboard(user.profiles.seller.isActive);
    await ctx.reply(
      `<b>🔍 Результаты поиска по запросу:</b> "${query}"\n\n` +
        `❌ Товары не найдены.\n\n` +
        `Попробуйте изменить запрос или использовать другие ключевые слова.`,
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
      }
    );
    return;
  }

  // Показываем найденные товары в виде слайдера
  await ctx.reply(`🔍 Найдено товаров: ${searchResults.length}\n\nПоказываю результаты...`);

  let currentIndex = 0;
  let currentMessageIds: number[] = [];
  let viewedProducts = new Set<string>();

  // Функция отображения товара из результатов поиска
  const showProduct = async (index: number, deleteOldMessages: boolean = false, oldMessageIds: number[] = []): Promise<number[]> => {
    const product = searchResults[index];
    
    if (!product) {
      await ctx.reply("❌ Товар не найден");
      return oldMessageIds;
    }

    // Увеличиваем просмотры
    const productIdStr = product._id.toString();
    if (!viewedProducts.has(productIdStr)) {
      viewedProducts.add(productIdStr);
      try {
        await Product.updateOne({ _id: product._id }, { $inc: { viewsCount: 1 } });
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

    const { InlineKeyboard } = await import("grammy");
    const keyboard = new InlineKeyboard();

    if (index > 0) {
      keyboard.text("⬅️", `search_prev:${index}`);
    }
    
    keyboard.text(`${index + 1}/${searchResults.length}`, `search_noop`);
    
    if (index < searchResults.length - 1) {
      keyboard.text("➡️", `search_next:${index}`);
    }

    keyboard.row();
    keyboard.text("🛒 В корзину", `search_add_cart:${product._id}`).row();

    if (product.location?.latitude && product.location?.longitude) {
      keyboard.text("📍 Показать на карте", `search_location:${product._id}`).row();
    }

    keyboard.text("↩️ Перейти в меню", `search_exit`);

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
          const buttonsMsg = await ctx.reply("👆 Управление товаром:", { reply_markup: keyboard });
          newMessageIds.push(buttonsMsg.message_id);
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

  // Показываем первый товар
  currentMessageIds = await showProduct(currentIndex);

  // Основной цикл навигации
  while (true) {
    const callbackCtx = await conversation.waitFor("callback_query:data");
    const data = callbackCtx.callbackQuery.data;

    if (data === "search_noop") {
      await callbackCtx.answerCallbackQuery();
      continue;
    }

    if (data?.startsWith("search_prev:")) {
      if (currentIndex > 0) {
        currentIndex--;
        currentMessageIds = await showProduct(currentIndex, true, currentMessageIds);
      }
      await callbackCtx.answerCallbackQuery();
      continue;
    }

    if (data?.startsWith("search_next:")) {
      if (currentIndex < searchResults.length - 1) {
        currentIndex++;
        currentMessageIds = await showProduct(currentIndex, true, currentMessageIds);
      }
      await callbackCtx.answerCallbackQuery();
      continue;
    }

    if (data === "search_exit") {
      await callbackCtx.answerCallbackQuery("✅ Закрываю результаты поиска");
      for (const msgId of currentMessageIds) {
        try {
          await ctx.api.deleteMessage(ctx.chat!.id, msgId);
        } catch (e) {
          console.warn(`Не удалось удалить сообщение ${msgId}:`, e);
        }
      }
      const keyboard = getBuyerKeyboard(user.profiles.seller.isActive);
      await ctx.reply("Главное меню:", { reply_markup: keyboard });
      break;
    }

    if (data?.startsWith("search_add_cart:")) {
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

    if (data?.startsWith("search_location:")) {
      const productId = data.split(":")[1];
      try {
        const product = await Product.findById(productId);
        if (product?.location?.latitude && product?.location?.longitude) {
          await ctx.replyWithLocation(product.location.latitude, product.location.longitude);
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
  }
}
