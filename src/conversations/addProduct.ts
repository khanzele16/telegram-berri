import { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard, Keyboard } from "grammy";
import { MyContext } from "../types/bot";
import userService from "../database/controllers/user";
import shopService from "../database/controllers/shop";
import Product from "../database/models/Product";
import Category from "../database/models/Category";
import { getSellerKeyboard } from "../shared/keyboards";

export async function addProduct(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
) {
  // Проверяем, что пользователь - продавец
  const user = await userService.getUserById(ctx.from!.id);
  
  if (!user?.profiles.seller.isActive || !user.profiles.seller.shopId) {
    await ctx.reply("❌ Вы не зарегистрированы как продавец");
    return;
  }

  // Проверяем, что магазин одобрен
  const shop = await shopService.getShopById(user.profiles.seller.shopId.toString());
  
  if (!shop?.isApproved) {
    await ctx.reply(
      "⏳ Ваш магазин ещё не прошёл модерацию.\n\n" +
      "Дождитесь одобрения администратором, после чего вы сможете добавлять товары.",
      { reply_markup: getSellerKeyboard(user.profiles.buyer.isActive) }
    );
    return;
  }

  // Собираем медиа файлы
  const mediaFiles: Array<{ fileId: string; mediaType: 'photo' | 'video' }> = [];
  const MAX_MEDIA = 6;

  // Цикл для сбора медиа с поддержкой автоматического перезапуска шага при ошибке
  while (true) {
    // Инструкция в начале шага (при первом проходе или после перезапуска)
    await ctx.reply(
      "<b>Шаг 1/7:</b> Отправьте фото или видео товара\n\n" +
      `📸 Можно отправить до ${MAX_MEDIA} фото/видео. Когда закончите, нажмите '✅ Готово'`,
      { parse_mode: 'HTML', reply_markup: new Keyboard().text('✅ Готово').row().text('❌ Отмена').resized() }
    );

    mediaFiles.length = 0; // очищаем на всякий случай при перезапуске

    // Собираем медиа пока не нажмут 'Готово' или не будет отмена
    while (true) {
      const mediaCtx = await conversation.wait();

      // Проверка на отмену
      if (mediaCtx.message?.text === "❌ Отмена") {
        await ctx.reply("❌ Добавление товара отменено", {
          reply_markup: getSellerKeyboard(user.profiles.buyer.isActive)
        });
        return;
      }

      // Проверка на завершение
      if (mediaCtx.message?.text === "✅ Готово") {
        if (mediaFiles.length === 0) {
          await ctx.reply(
            "⚠️ Необходимо добавить хотя бы одно фото или видео!\n\n" +
            "Отправьте медиа файл или нажмите '❌ Отмена' для выхода"
          );
          continue;
        }
        break;
      }

      // Рассматриваем попытку добавить файл
      // Определяем количество файлов в текущем входящем сообщении (обычно 1)
      let incomingCount = 0;
      if (mediaCtx.message?.photo) incomingCount = 1;
      if (mediaCtx.message?.video) incomingCount = 1;

      // Если добавление приведёт к превышению лимита — сообщаем и перезапускаем шаг
      if (incomingCount > 0 && mediaFiles.length + incomingCount > MAX_MEDIA) {
        await ctx.reply(
          `⚠️ Превышен лимит медиа (максимум ${MAX_MEDIA}).\n` +
          `Начинаем шаг заново — пожалуйста, отправьте до ${MAX_MEDIA} фото/видео.`
        );
        // Принудительный перезапуск внешнего цикла — начнём сбор заново
        break; // выйдем во внешний цикл, где mediaFiles будет очищен и шаг повторится
      }

      // Обработка фото
      if (mediaCtx.message?.photo && mediaCtx.message.photo.length > 0) {
        const photo = mediaCtx.message.photo[mediaCtx.message.photo.length - 1];
        mediaFiles.push({ fileId: photo.file_id, mediaType: 'photo' });
        await ctx.reply(`✅ Фото добавлено (${mediaFiles.length}/${MAX_MEDIA})`);
        if (mediaFiles.length >= MAX_MEDIA) {
          await ctx.reply("🎯 Достигнут лимит медиа — нажмите '✅ Готово' для продолжения");
        }
        continue;
      }

      // Обработка видео
      if (mediaCtx.message?.video) {
        const video = mediaCtx.message.video;
        mediaFiles.push({ fileId: video.file_id, mediaType: 'video' });
        await ctx.reply(`✅ Видео добавлено (${mediaFiles.length}/${MAX_MEDIA})`);
        if (mediaFiles.length >= MAX_MEDIA) {
          await ctx.reply("🎯 Достигнут лимит медиа — нажмите '✅ Готово' для продолжения");
        }
        continue;
      }

      // Если отправлено что-то другое
      if (mediaCtx.message?.text && mediaCtx.message?.text !== "✅ Готово" && mediaCtx.message?.text !== "❌ Отмена") {
        await ctx.reply("⚠️ Пожалуйста, отправьте фото или видео, либо нажмите '✅ Готово' для продолжения");
      }
    }

    // Если мы дошли сюда и mediaFiles заполнены и не превышают лимит — продолжаем дальше
    if (mediaFiles.length > 0 && mediaFiles.length <= MAX_MEDIA) {
      break; // выходим из внешнего цикла — шаг успешно завершён
    }
    // Иначе внешний цикл повторится (перезапуск шага)
  }

  // Подсчитываем типы медиа
  const photoCount = mediaFiles.filter(m => m.mediaType === 'photo').length;
  const videoCount = mediaFiles.filter(m => m.mediaType === 'video').length;
  
  let mediaStats = `<b>✅ Добавлено медиа: ${mediaFiles.length}</b>\n`;
  if (photoCount > 0) mediaStats += `📸 Фото: ${photoCount}\n`;
  if (videoCount > 0) mediaStats += `🎥 Видео: ${videoCount}\n`;

  // Шаг 2: название — повторяем пока не введут корректный текст или не отменят
  let name: string;
  while (true) {
    await ctx.reply(mediaStats + "\n<b>Шаг 2/7:</b> Введите название товара:", {
      parse_mode: "HTML",
      reply_markup: new Keyboard().text("❌ Отмена").resized()
    });

    const nameCtx = await conversation.wait();

    if (nameCtx.message?.text === "❌ Отмена") {
      await ctx.reply("❌ Добавление товара отменено", {
        reply_markup: getSellerKeyboard(user.profiles.buyer.isActive)
      });
      return;
    }

    const text = nameCtx.message?.text?.trim();
    if (!text || text.length < 1) {
      await ctx.reply("❌ Необходимо ввести название товара (минимум 1 символ)");
      continue;
    }
    if (text.length > 100) {
      await ctx.reply("❌ Название слишком длинное (максимум 100 символов)");
      continue;
    }

    name = text;
    break;
  }

  // Шаг 3: описание — повторяем пока не введут корректный текст или не отменят
  let description: string;
  while (true) {
    await ctx.reply(`<b>✅ Название:</b> ${name}\n\n<b>Шаг 3/7:</b> Введите описание товара:`, { parse_mode: "HTML" });
    const descriptionCtx = await conversation.wait();

    if (descriptionCtx.message?.text === "❌ Отмена") {
      await ctx.reply("❌ Добавление товара отменено", {
        reply_markup: getSellerKeyboard(user.profiles.buyer.isActive)
      });
      return;
    }

    const text = descriptionCtx.message?.text?.trim();
    if (!text || text.length < 5) {
      await ctx.reply("❌ Описание должно содержать минимум 5 символов");
      continue;
    }
    if (text.length > 500) {
      await ctx.reply("❌ Описание слишком длинное (максимум 500 символов)");
      continue;
    }

    description = text;
    break;
  }

  // Шаг 4: цена — повторяем пока не введут корректную цену
  let price: number;
  while (true) {
    await ctx.reply(`<b>✅ Описание:</b> ${description}\n\n<b>Шаг 4/7:</b> Введите цену товара (в рублях):`, { parse_mode: "HTML" });
    const priceCtx = await conversation.wait();

    if (priceCtx.message?.text === "❌ Отмена") {
      await ctx.reply("❌ Добавление товара отменено", {
        reply_markup: getSellerKeyboard(user.profiles.buyer.isActive)
      });
      return;
    }

    if (!priceCtx.message?.text) {
      await ctx.reply("❌ Необходимо ввести цену товара");
      continue;
    }

    const parsed = parseFloat(priceCtx.message.text.replace(/\s/g, ""));
    if (isNaN(parsed) || parsed <= 0) {
      await ctx.reply("❌ Цена должна быть положительным числом");
      continue;
    }
    if (parsed > 1000000) {
      await ctx.reply("❌ Цена слишком высокая (максимум 1 000 000 ₽)");
      continue;
    }

    price = parsed;
    break;
  }

  // Шаг 5: количество — повторяем пока не введут корректное число
  let quantity: number;
  while (true) {
    await ctx.reply(`<b>✅ Цена:</b> ${price} ₽\n\n<b>Шаг 5/7:</b> Введите количество товара на складе:`, { parse_mode: "HTML" });
    const quantityCtx = await conversation.wait();

    if (quantityCtx.message?.text === "❌ Отмена") {
      await ctx.reply("❌ Добавление товара отменено", {
        reply_markup: getSellerKeyboard(user.profiles.buyer.isActive)
      });
      return;
    }

    if (!quantityCtx.message?.text) {
      await ctx.reply("❌ Необходимо ввести количество товара");
      continue;
    }

    const parsedQ = parseInt(quantityCtx.message.text);
    if (isNaN(parsedQ) || parsedQ < 0) {
      await ctx.reply("❌ Количество должно быть целым неотрицательным числом");
      continue;
    }
    if (parsedQ > 10000) {
      await ctx.reply("❌ Количество слишком большое (максимум 10 000 шт)");
      continue;
    }

    quantity = parsedQ;
    break;
  }

  // Получаем категории
  const categories = await Category.find({ isActive: true }).sort({ order: 1 });

  if (categories.length === 0) {
    await ctx.reply("❌ В системе нет доступных категорий. Обратитесь к администратору.");
    return;
  }

  const categoryKeyboard = new InlineKeyboard();
  categories.forEach((category, index) => {
    categoryKeyboard.text(
      `${category.emoji} ${category.name}`,
      `select_category:${category._id}`
    );
    if ((index + 1) % 2 === 0) {
      categoryKeyboard.row();
    }
  });

  await ctx.reply(
    `<b>✅ Количество:</b> ${quantity} шт.\n\n` +
    "<b>Шаг 6/7:</b> Выберите категорию товара:",
    { 
      parse_mode: "HTML",
      reply_markup: categoryKeyboard
    }
  );

  // Ожидаем выбор категории (повторяем пока не выберут корректно)
  let selectedCategory;
  while (true) {
    const categoryCtx = await conversation.waitFor("callback_query:data");
    if (!categoryCtx.callbackQuery?.data?.startsWith("select_category:")) {
      await ctx.reply("❌ Необходимо выбрать категорию");
      continue;
    }

    const categoryId = categoryCtx.callbackQuery.data.split(":")[1];
    selectedCategory = categories.find(c => c._id.toString() === categoryId);
    if (!selectedCategory) {
      await ctx.reply("❌ Выбрана некорректная категория. Попробуйте ещё раз.");
      continue;
    }

    await categoryCtx.answerCallbackQuery();
    await categoryCtx.editMessageText(
      `<b>✅ Категория:</b> ${selectedCategory?.emoji} ${selectedCategory?.name}`,
      { parse_mode: "HTML" }
    );
    break;
  }

  // Предлагаем добавить геолокацию
  const locationKeyboard = new Keyboard()
    .requestLocation("📍 Отправить геолокацию")
    .row()
    .text("⏭️ Пропустить")
    .text("❌ Отмена")
    .resized();

  await ctx.reply(
    "<b>Шаг 7/7:</b> Отправьте геолокацию товара (если актуально)\n\n" +
    "Это поможет покупателям найти товар на карте.\n" +
    "Вы можете пропустить этот шаг.",
    { 
      parse_mode: "HTML",
      reply_markup: locationKeyboard
    }
  );

  const locationCtx = await conversation.wait();

  let location: { latitude: number; longitude: number; address?: string } | undefined;

  if (locationCtx.message?.text === "❌ Отмена") {
    await ctx.reply("❌ Добавление товара отменено", {
      reply_markup: getSellerKeyboard(user.profiles.buyer.isActive)
    });
    return;
  }

  if (locationCtx.message?.location) {
    location = {
      latitude: locationCtx.message.location.latitude,
      longitude: locationCtx.message.location.longitude
    };
    
    // Попробуем получить адрес через геокодинг (можно добавить позже)
    // location.address = await getAddressFromCoordinates(location.latitude, location.longitude);
  }

  // Создаём товар со статусом "не одобрен" - отправляем на модерацию
  try {
    const product = await Product.create({
      shopId: shop._id,
      sellerId: user._id,
      categoryId: selectedCategory?._id,
      name: name,
      description: description,
      price: price,
      quantity: quantity,
      media: mediaFiles,
      images: mediaFiles.filter(m => m.mediaType === 'photo').map(m => ({ fileId: m.fileId })), // для обратной совместимости
      location: location,
      status: quantity > 0 ? 'available' : 'out_of_stock',
      isApproved: false, // Товар требует модерации
      isActive: false // Скрыт до одобрения
    });

    // Обновляем счётчик товаров в магазине
    await shopService.incrementProductsCount(shop._id.toString());

    // Подсчитываем медиа
    const photoCount = mediaFiles.filter(m => m.mediaType === 'photo').length;
    const videoCount = mediaFiles.filter(m => m.mediaType === 'video').length;

    // Формируем сообщение с подтверждением
    let confirmMessage = 
      "<b>✅ Товар успешно создан!</b>\n\n" +
      `<b>📦 Название:</b> ${name}\n` +
      `<b>📝 Описание:</b> ${description}\n` +
      `<b>💰 Цена:</b> ${price} ₽\n` +
      `<b>📊 Количество:</b> ${quantity} шт.\n` +
      `<b>🏷️ Категория:</b> ${selectedCategory?.emoji} ${selectedCategory?.name}\n\n` +
      `<b>⏳ Статус:</b> Отправлен на модерацию\n` +
      `После одобрения администратором товар появится в каталоге.\n`;

    if (photoCount > 0) confirmMessage += `<b>📸 Фото:</b> ${photoCount} шт.\n`;
    if (videoCount > 0) confirmMessage += `<b>🎥 Видео:</b> ${videoCount} шт.\n`;

    if (location) {
      confirmMessage += `<b>📍 Геолокация:</b> добавлена\n`;
    }

    confirmMessage += `\n<b>🆔 ID товара:</b> ${product._id}`;

    // Отправляем уведомление админу о новом товаре
    if (process.env.ADMIN_ID) {
      try {
        const moderationKeyboard = new InlineKeyboard()
          .text("✅ Одобрить", `approve_product:${product._id}`)
          .text("❌ Отклонить", `reject_product:${product._id}`);

        let adminMessage = 
          `🆕 Новый товар на модерацию!\n\n` +
          `👤 Продавец: ${ctx.from?.first_name || ""} ${ctx.from?.last_name || ""}\n` +
          `📱 @${ctx.from?.username || "нет username"}\n` +
          `🏪 Магазин: ${shop.name}\n\n` +
          `📦 Название: ${name}\n` +
          `📝 Описание: ${description}\n` +
          `💰 Цена: ${price} ₽\n` +
          `📊 Количество: ${quantity} шт.\n` +
          `🏷️ Категория: ${selectedCategory?.emoji} ${selectedCategory?.name}\n`;

        if (location) {
          adminMessage += `📍 Геолокация: добавлена\n`;
        }
        
        adminMessage += `\n🆔 ID товара: ${product._id}`;

        // Отправляем первое медиа админу
        if (mediaFiles.length > 0) {
          const firstMedia = mediaFiles[0];
          if (firstMedia.mediaType === 'photo') {
            await ctx.api.sendPhoto(process.env.ADMIN_ID, firstMedia.fileId, {
              caption: adminMessage,
              reply_markup: moderationKeyboard
            });
          } else {
            await ctx.api.sendVideo(process.env.ADMIN_ID, firstMedia.fileId, {
              caption: adminMessage,
              reply_markup: moderationKeyboard
            });
          }
        } else {
          await ctx.api.sendMessage(process.env.ADMIN_ID, adminMessage, {
            reply_markup: moderationKeyboard
          });
        }

        console.log(`✅ Уведомление админу о товаре ${product._id} отправлено`);
      } catch (error) {
        console.error("❌ Ошибка отправки уведомления админу о товаре:", error);
      }
    }

    // Отправляем первое медиа с описанием продавцу
    if (mediaFiles.length > 0) {
      const firstMedia = mediaFiles[0];
      if (firstMedia.mediaType === 'photo') {
        await ctx.replyWithPhoto(firstMedia.fileId, {
          caption: confirmMessage,
          parse_mode: "HTML",
          reply_markup: getSellerKeyboard(user.profiles.buyer.isActive)
        });
      } else {
        await ctx.replyWithVideo(firstMedia.fileId, {
          caption: confirmMessage,
          parse_mode: "HTML",
          reply_markup: getSellerKeyboard(user.profiles.buyer.isActive)
        });
      }
    } else {
      await ctx.reply(confirmMessage, {
        parse_mode: "HTML",
        reply_markup: getSellerKeyboard(user.profiles.buyer.isActive)
      });
    }

  } catch (error) {
    console.error("Ошибка создания товара:", error);
    await ctx.reply(
      "❌ Произошла ошибка при создании товара. Попробуйте ещё раз.",
      { reply_markup: getSellerKeyboard(user.profiles.buyer.isActive) }
    );
  }
}
