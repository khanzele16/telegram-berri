import { MyContext } from "../types/bot";
import userService from "../database/controllers/user";
import shopService from "../database/controllers/shop";
import cartService from "../database/controllers/cart";
import { getBuyerKeyboard, getSellerKeyboard } from "../shared/keyboards";

export const callbackQueryHandler = async (ctx: MyContext) => {
  if (!ctx.callbackQuery || !ctx.from) {
    console.log("Почему-то callbackQuery или from нет.");
    return;
  }

  // Ensure session is initialized
  if (!ctx.session) {
    ctx.session = { menu: null, profile: null };
  }

  const data = ctx.callbackQuery.data;

  // Регистрация
  if (data?.startsWith("register:")) {
    const role = data.split(":")[1];

    // Создаем пользователя, если его нет
    await userService.findOrCreate(ctx.from.id, {
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name,
    });

    await ctx.answerCallbackQuery();

    switch (role) {
      case "buyer":
        await ctx.conversation.enter("buyerRegistration");
        break;

      case "seller":
        await ctx.conversation.enter("sellerRegistration");
        break;

      case "both":
        await ctx.conversation.enter("bothRegistration");
        break;
    }

    return;
  }

  // Настройки магазина
  if (data?.startsWith("shop:")) {
    const action = data.split(":")[1];

    if (action === "edit_name") {
      await ctx.answerCallbackQuery();
      await ctx.conversation.enter("editShopName");
      return;
    }

    if (action === "edit_description") {
      await ctx.answerCallbackQuery();
      await ctx.conversation.enter("editShopDescription");
      return;
    }

    if (action === "back") {
      await ctx.answerCallbackQuery();
      const user = await userService.getUserById(ctx.from.id);
      if (user?.profiles.seller.isActive) {
        await ctx.editMessageText("✅ Возвращаемся в главное меню");
        await ctx.reply("Главное меню:", {
          reply_markup: getSellerKeyboard(user.profiles.buyer.isActive),
        });
      }
      return;
    }
  }

  // Переключение профиля
  if (data === "switch:buyer") {
    const user = await userService.getUserById(ctx.from.id);
    if (user?.profiles.buyer.isActive) {
      ctx.session.profile = "buyer";
      await ctx.editMessageText("✅ Переключено на профиль покупателя");
      await ctx.reply("Главное меню:", {
        reply_markup: getBuyerKeyboard(user.profiles.seller.isActive),
      });
    } else {
      await ctx.answerCallbackQuery("❌ Профиль покупателя не активен");
    }
    return;
  }

  if (data === "switch:seller") {
    const user = await userService.getUserById(ctx.from.id);
    if (user?.profiles.seller.isActive) {
      ctx.session.profile = "seller";
      await ctx.editMessageText("✅ Переключено на профиль продавца");
      await ctx.reply("Главное меню:", {
        reply_markup: getSellerKeyboard(user.profiles.buyer.isActive),
      });
    } else {
      await ctx.answerCallbackQuery("❌ Профиль продавца не активен");
    }
    return;
  }

  // Одобрение магазина
  if (data?.startsWith("approve_shop:")) {
    // Проверяем права администратора
    if (!userService.isAdmin(ctx.from.id)) {
      await ctx.answerCallbackQuery("❌ У вас нет прав администратора");
      return;
    }

    const shopId = data.split(":")[1];
    
    try {
      const shop = await shopService.approveShop(shopId);
      
      if (!shop) {
        await ctx.answerCallbackQuery("❌ Магазин не найден");
        return;
      }

      // Находим владельца магазина
      const owner = await userService.getUserByShopId(shopId);
      
      if (owner) {
        // Одобряем продавца
        await userService.approveSeller(owner.telegramId);
        
        // Уведомляем продавца
        try {
          await ctx.api.sendMessage(
            owner.telegramId,
            `🎉 <b>Поздравляем!</b>\n\n` +
            `Ваш магазин "<b>${shop.name}</b>" успешно прошёл модерацию и одобрен!\n\n` +
            `Теперь вы можете:\n` +
            `📦 Добавлять товары\n` +
            `📊 Получать заказы\n` +
            `💰 Начать продавать\n\n` +
            `Желаем успешных продаж! 🚀`,
            { parse_mode: "HTML" }
          );
        } catch (error) {
          console.error("Ошибка отправки уведомления продавцу:", error);
        }
      }

      await ctx.editMessageText(
        ctx.callbackQuery.message?.text + 
        "\n\n✅ <b>ОДОБРЕНО</b>",
        { parse_mode: "HTML" }
      );
      
      await ctx.answerCallbackQuery("✅ Магазин одобрен!");
    } catch (error) {
      console.error("Ошибка одобрения магазина:", error);
      await ctx.answerCallbackQuery("❌ Ошибка при одобрении магазина");
    }
    
    return;
  }

  // Одобрение товара
  if (data?.startsWith("approve_product:")) {
    if (!userService.isAdmin(ctx.from.id)) {
      await ctx.answerCallbackQuery("❌ У вас нет прав администратора");
      return;
    }

    const productId = data.split(":")[1];
    
    try {
      const Product = (await import("../database/models/Product")).default;
      const product = await Product.findById(productId).populate('sellerId', 'telegramId firstName');
      
      if (!product) {
        await ctx.answerCallbackQuery("❌ Товар не найден");
        return;
      }

      product.isApproved = true;
      product.isActive = true;
      await product.save();

      const seller = product.sellerId as unknown as { telegramId: number; firstName: string };
      
      if (seller) {
        try {
          await ctx.api.sendMessage(
            seller.telegramId,
            `🎉 <b>Товар одобрен!</b>\n\n` +
            `Ваш товар "<b>${product.name}</b>" успешно прошёл модерацию!\n\n` +
            `Теперь он доступен для покупателей в каталоге.\n\n` +
            `🆔 ID товара: ${product._id}`,
            { parse_mode: "HTML" }
          );
        } catch (error) {
          console.error("Ошибка отправки уведомления продавцу:", error);
        }
      }

      await ctx.editMessageCaption({
        caption: ctx.callbackQuery.message?.caption + "\n\n✅ <b>ОДОБРЕНО</b>",
        parse_mode: "HTML"
      });
      
      await ctx.answerCallbackQuery("✅ Товар одобрен!");
    } catch (error) {
      console.error("Ошибка одобрения товара:", error);
      await ctx.answerCallbackQuery("❌ Ошибка при одобрении товара");
    }
    
    return;
  }

  // Отклонение товара
  if (data?.startsWith("reject_product:")) {
    if (!userService.isAdmin(ctx.from.id)) {
      await ctx.answerCallbackQuery("❌ У вас нет прав администратора");
      return;
    }

    const productId = data.split(":")[1];
    
    try {
      const Product = (await import("../database/models/Product")).default;
      const product = await Product.findById(productId).populate('sellerId', 'telegramId firstName');
      
      if (!product) {
        await ctx.answerCallbackQuery("❌ Товар не найден");
        return;
      }

      product.isActive = false;
      await product.save();

      const seller = product.sellerId as unknown as { telegramId: number; firstName: string };
      
      if (seller) {
        try {
          await ctx.api.sendMessage(
            seller.telegramId,
            `❌ <b>Товар отклонён</b>\n\n` +
            `К сожалению, ваш товар "<b>${product.name}</b>" не прошёл модерацию.\n\n` +
            `Возможные причины:\n` +
            `• Некорректное описание или фото\n` +
            `• Нарушение правил платформы\n` +
            `• Запрещённый товар\n\n` +
            `Вы можете связаться с поддержкой для уточнения деталей.\n\n` +
            `🆔 ID товара: ${product._id}`,
            { parse_mode: "HTML" }
          );
        } catch (error) {
          console.error("Ошибка отправки уведомления продавцу:", error);
        }
      }

      await ctx.editMessageCaption({
        caption: ctx.callbackQuery.message?.caption + "\n\n❌ <b>ОТКЛОНЕНО</b>",
        parse_mode: "HTML"
      });
      
      await ctx.answerCallbackQuery("❌ Товар отклонён");
    } catch (error) {
      console.error("Ошибка отклонения товара:", error);
      await ctx.answerCallbackQuery("❌ Ошибка при отклонении товара");
    }
    
    return;
  }

  // Отклонение магазина
  if (data?.startsWith("reject_shop:")) {
    // Проверяем права администратора
    if (!userService.isAdmin(ctx.from.id)) {
      await ctx.answerCallbackQuery("❌ У вас нет прав администратора");
      return;
    }

    const shopId = data.split(":")[1];
    
    try {
      const shop = await shopService.rejectShop(shopId);
      
      if (!shop) {
        await ctx.answerCallbackQuery("❌ Магазин не найден");
        return;
      }

      // Находим владельца магазина
      const owner = await userService.getUserByShopId(shopId);
      
      if (owner) {
        // Уведомляем продавца
        try {
          await ctx.api.sendMessage(
            owner.telegramId,
            `❌ <b>Модерация не пройдена</b>\n\n` +
            `К сожалению, ваш магазин "<b>${shop.name}</b>" не прошёл модерацию.\n\n` +
            `Возможные причины:\n` +
            `• Некорректное описание\n` +
            `• Нарушение правил платформы\n` +
            `• Недостаточная информация\n\n` +
            `Вы можете связаться с поддержкой для уточнения деталей.`,
            { parse_mode: "HTML" }
          );
        } catch (error) {
          console.error("Ошибка отправки уведомления продавцу:", error);
        }
      }

      await ctx.editMessageText(
        ctx.callbackQuery.message?.text + 
        "\n\n❌ <b>ОТКЛОНЕНО</b>",
        { parse_mode: "HTML" }
      );
      
      await ctx.answerCallbackQuery("❌ Магазин отклонён");
    } catch (error) {
      console.error("Ошибка отклонения магазина:", error);
      await ctx.answerCallbackQuery("❌ Ошибка при отклонении магазина");
    }
    
    return;
  }

  // Одобрение изменения названия магазина
  if (data?.startsWith("approve_shop_name:")) {
    if (!userService.isAdmin(ctx.from.id)) {
      await ctx.answerCallbackQuery("❌ У вас нет прав администратора");
      return;
    }

    const shopId = data.split(":")[1];
    
    try {
      const shop = await shopService.approveNameChange(shopId);
      
      if (!shop) {
        await ctx.answerCallbackQuery("❌ Магазин не найден или изменения отсутствуют");
        return;
      }

      const owner = await userService.getUserByShopId(shopId);
      
      if (owner) {
        try {
          await ctx.api.sendMessage(
            owner.telegramId,
            `✅ <b>Изменение одобрено</b>\n\n` +
            `Название вашего магазина успешно изменено на:\n` +
            `<b>${shop.name}</b>`,
            { parse_mode: "HTML" }
          );
        } catch (error) {
          console.error("Ошибка отправки уведомления продавцу:", error);
        }
      }

      await ctx.editMessageText(
        ctx.callbackQuery.message?.text + "\n\n✅ <b>ОДОБРЕНО</b>",
        { parse_mode: "HTML" }
      );
      
      await ctx.answerCallbackQuery("✅ Название одобрено!");
    } catch (error) {
      console.error("Ошибка одобрения названия:", error);
      await ctx.answerCallbackQuery("❌ Ошибка при одобрении");
    }
    
    return;
  }

  // Отклонение изменения названия магазина
  if (data?.startsWith("reject_shop_name:")) {
    if (!userService.isAdmin(ctx.from.id)) {
      await ctx.answerCallbackQuery("❌ У вас нет прав администратора");
      return;
    }

    const shopId = data.split(":")[1];
    
    try {
      const shop = await shopService.rejectNameChange(shopId);
      
      if (!shop) {
        await ctx.answerCallbackQuery("❌ Магазин не найден");
        return;
      }

      const owner = await userService.getUserByShopId(shopId);
      
      if (owner) {
        try {
          await ctx.api.sendMessage(
            owner.telegramId,
            `❌ <b>Изменение отклонено</b>\n\n` +
            `Запрос на изменение названия магазина был отклонён.\n\n` +
            `Возможные причины:\n` +
            `• Некорректное название\n` +
            `• Нарушение правил платформы\n` +
            `• Использование запрещённых слов\n\n` +
            `Вы можете попробовать другое название.`,
            { parse_mode: "HTML" }
          );
        } catch (error) {
          console.error("Ошибка отправки уведомления продавцу:", error);
        }
      }

      await ctx.editMessageText(
        ctx.callbackQuery.message?.text + "\n\n❌ <b>ОТКЛОНЕНО</b>",
        { parse_mode: "HTML" }
      );
      
      await ctx.answerCallbackQuery("❌ Название отклонено");
    } catch (error) {
      console.error("Ошибка отклонения названия:", error);
      await ctx.answerCallbackQuery("❌ Ошибка при отклонении");
    }
    
    return;
  }

  // Одобрение изменения описания магазина
  if (data?.startsWith("approve_shop_desc:")) {
    if (!userService.isAdmin(ctx.from.id)) {
      await ctx.answerCallbackQuery("❌ У вас нет прав администратора");
      return;
    }

    const shopId = data.split(":")[1];
    
    try {
      const shop = await shopService.approveDescriptionChange(shopId);
      
      if (!shop) {
        await ctx.answerCallbackQuery("❌ Магазин не найден или изменения отсутствуют");
        return;
      }

      const owner = await userService.getUserByShopId(shopId);
      
      if (owner) {
        try {
          await ctx.api.sendMessage(
            owner.telegramId,
            `✅ <b>Изменение одобрено</b>\n\n` +
            `Описание вашего магазина успешно изменено.`,
            { parse_mode: "HTML" }
          );
        } catch (error) {
          console.error("Ошибка отправки уведомления продавцу:", error);
        }
      }

      await ctx.editMessageText(
        ctx.callbackQuery.message?.text + "\n\n✅ <b>ОДОБРЕНО</b>",
        { parse_mode: "HTML" }
      );
      
      await ctx.answerCallbackQuery("✅ Описание одобрено!");
    } catch (error) {
      console.error("Ошибка одобрения описания:", error);
      await ctx.answerCallbackQuery("❌ Ошибка при одобрении");
    }
    
    return;
  }

  // Отклонение изменения описания магазина
  if (data?.startsWith("reject_shop_desc:")) {
    if (!userService.isAdmin(ctx.from.id)) {
      await ctx.answerCallbackQuery("❌ У вас нет прав администратора");
      return;
    }

    const shopId = data.split(":")[1];
    
    try {
      const shop = await shopService.rejectDescriptionChange(shopId);
      
      if (!shop) {
        await ctx.answerCallbackQuery("❌ Магазин не найден");
        return;
      }

      const owner = await userService.getUserByShopId(shopId);
      
      if (owner) {
        try {
          await ctx.api.sendMessage(
            owner.telegramId,
            `❌ <b>Изменение отклонено</b>\n\n` +
            `Запрос на изменение описания магазина был отклонён.\n\n` +
            `Возможные причины:\n` +
            `• Некорректное описание\n` +
            `• Нарушение правил платформы\n` +
            `• Недостаточная информация\n\n` +
            `Вы можете попробовать другое описание.`,
            { parse_mode: "HTML" }
          );
        } catch (error) {
          console.error("Ошибка отправки уведомления продавцу:", error);
        }
      }

      await ctx.editMessageText(
        ctx.callbackQuery.message?.text + "\n\n❌ <b>ОТКЛОНЕНО</b>",
        { parse_mode: "HTML" }
      );
      
      await ctx.answerCallbackQuery("❌ Описание отклонено");
    } catch (error) {
      console.error("Ошибка отклонения описания:", error);
      await ctx.answerCallbackQuery("❌ Ошибка при отклонении");
    }
    
    return;
  }

  // Переключение статуса товара (скрыть/показать)
  if (data?.startsWith("toggle_product:")) {
    const productId = data.split(":")[1];
    const Product = (await import("../database/models/Product")).default;
    
    try {
      const product = await Product.findById(productId);
      
      if (!product) {
        await ctx.answerCallbackQuery("❌ Товар не найден");
        return;
      }

      // Проверяем, что это товар пользователя
      const user = await userService.getUserById(ctx.from.id);
      if (product.sellerId.toString() !== user?._id.toString()) {
        await ctx.answerCallbackQuery("❌ Это не ваш товар");
        return;
      }

      // Переключаем статус
      const newStatus = product.status === 'available' ? 'hidden' : 'available';
      product.status = newStatus;
      await product.save();

      const statusText = newStatus === 'available' ? 'показан' : 'скрыт';
      await ctx.answerCallbackQuery(`✅ Товар ${statusText}`);
      
      // Обновляем сообщение
      const category = await (await import("../database/models/Category")).default.findById(product.categoryId);
      const statusEmoji = newStatus === 'available' ? '✅' : '🔒';
      
      // Подсчитываем медиа
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

      const InlineKeyboard = (await import("grammy")).InlineKeyboard;
      const keyboard = new InlineKeyboard()
        .text("✏️ Изменить", `edit_product:${product._id}`)
        .text("🗑️ Удалить", `delete_product:${product._id}`)
        .row()
        .text(newStatus === 'available' ? '🔒 Скрыть' : '✅ Показать', `toggle_product:${product._id}`);

      await ctx.editMessageCaption({
        caption: message,
        parse_mode: "HTML",
        reply_markup: keyboard
      });
      
    } catch (error) {
      console.error("Ошибка переключения статуса товара:", error);
      await ctx.answerCallbackQuery("❌ Ошибка при изменении статуса");
    }
    
    return;
  }

  // Удаление товара
  if (data?.startsWith("delete_product:")) {
    const productId = data.split(":")[1];
    const Product = (await import("../database/models/Product")).default;
    
    try {
      const product = await Product.findById(productId);
      
      if (!product) {
        await ctx.answerCallbackQuery("❌ Товар не найден");
        return;
      }

      // Проверяем, что это товар пользователя
      const user = await userService.getUserById(ctx.from.id);
      if (product.sellerId.toString() !== (user as unknown as { _id: { toString: () => string } })?._id.toString()) {
        await ctx.answerCallbackQuery("❌ Это не ваш товар");
        return;
      }

      // Удаляем товар (или делаем неактивным)
      product.isActive = false;
      await product.save();

      // Уменьшаем счётчик товаров в магазине
      if (user?.profiles.seller.shopId) {
        await shopService.decrementProducts(user.profiles.seller.shopId.toString());
      }

      await ctx.answerCallbackQuery("✅ Товар удалён");
      await ctx.deleteMessage();
      
    } catch (error) {
      console.error("Ошибка удаления товара:", error);
      await ctx.answerCallbackQuery("❌ Ошибка при удалении товара");
    }
    
    return;
  }

  // Редактирование товара (пока заглушка)
  if (data?.startsWith("edit_product:")) {
    await ctx.answerCallbackQuery("🔧 Функция редактирования в разработке");
    return;
  }

  // NOTE: add_to_cart и product_details теперь обрабатываются внутри conversations (feed, catalog)
  // Глобальная обработка отключена, чтобы избежать двойного срабатывания
  
  // Добавление в корзину - ОТКЛЮЧЕНО (обрабатывается в conversations)
  // if (data?.startsWith("add_to_cart:")) {
  //   const productId = data.split(":")[1];
  //   try {
  //     await cartService.addToCart(ctx.from.id, productId, 1);
  //     await ctx.answerCallbackQuery("🛒 Товар добавлен в корзину");
  //   } catch (err) {
  //     console.error("Ошибка добавления в корзину:", err);
  //     await ctx.answerCallbackQuery("❌ Ошибка при добавлении в корзину");
  //   }
  //   return;
  // }

  // Показать геолокацию товара - ОТКЛЮЧЕНО (обрабатывается в conversations)
  // if (data?.startsWith("show_location:")) {
  //   const productId = data.split(":")[1];
  //   try {
  //     const Product = (await import("../database/models/Product")).default;
  //     const product = await Product.findById(productId);
  //     
  //     if (product?.location?.latitude && product?.location?.longitude) {
  //       await ctx.replyWithLocation(
  //         product.location.latitude,
  //         product.location.longitude
  //       );
  //       await ctx.answerCallbackQuery("📍 Геолокация отправлена");
  //     } else {
  //       await ctx.answerCallbackQuery("❌ Геолокация недоступна");
  //     }
  //   } catch (err) {
  //     console.error("Ошибка отправки геолокации:", err);
  //     await ctx.answerCallbackQuery("❌ Ошибка при отправке геолокации");
  //   }
  //   return;
  // }

  // Подробная информация о товаре - ОТКЛЮЧЕНО (обрабатывается в conversations)
  // if (data?.startsWith("product_details:")) {
  //   const productId = data.split(":")[1];
  //   try {
  //     const Product = (await import("../database/models/Product")).default;
  //     const product = await Product.findById(productId)
  //       .populate('categoryId', 'name emoji')
  //       .populate('shopId', 'name');
  //     
  //     if (product) {
  //       const category = product.categoryId as any;
  //       const shop = product.shopId as any;
  //       
  //       let detailsMsg = 
  //         `<b>📦 Подробная информация о товаре</b>\n\n` +
  //         `<b>Название:</b> ${product.name}\n` +
  //         `<b>Описание:</b> ${product.description}\n\n` +
  //         `<b>💰 Цена:</b> ${product.price} ₽\n` +
  //         `<b>📊 В наличии:</b> ${product.quantity} шт.\n` +
  //         `<b>🏷️ Категория:</b> ${category?.emoji} ${category?.name}\n` +
  //         `<b>🏪 Магазин:</b> ${shop?.name}\n\n` +
  //         `<b>👁️ Просмотров:</b> ${product.viewsCount}\n` +
  //         `<b>🛒 Заказов:</b> ${product.ordersCount}\n\n` +
  //         `<b>🆔 ID:</b> <code>${product._id}</code>`;
  //
  //       // Отправляем все медиа если есть
  //       const mediaItems = product.media && product.media.length > 0 ? product.media : [];
  //       
  //       if (mediaItems.length > 0) {
  //         // Отправляем первое медиа с подробным описанием
  //         const firstMedia = mediaItems[0];
  //         if (firstMedia.fileId) {
  //           if (firstMedia.mediaType === 'video') {
  //             await ctx.replyWithVideo(firstMedia.fileId, {
  //               caption: detailsMsg,
  //               parse_mode: "HTML"
  //             });
  //           } else {
  //             await ctx.replyWithPhoto(firstMedia.fileId, {
  //               caption: detailsMsg,
  //               parse_mode: "HTML"
  //             });
  //           }
  //         }
  //         
  //         // Отправляем остальные медиа (если их больше 1)
  //         for (let i = 1; i < mediaItems.length; i++) {
  //           const media = mediaItems[i];
  //           if (media.fileId) {
  //             try {
  //               if (media.mediaType === 'video') {
  //                 await ctx.replyWithVideo(media.fileId);
  //               } else {
  //                 await ctx.replyWithPhoto(media.fileId);
  //               }
  //             } catch (err) {
  //               console.error(`Ошибка отправки медиа ${i}:`, err);
  //             }
  //           }
  //         }
  //       } else if (product.images && product.images.length > 0 && product.images[0].fileId) {
  //         // Fallback на старое поле images
  //         await ctx.replyWithPhoto(product.images[0].fileId, {
  //           caption: detailsMsg,
  //           parse_mode: "HTML"
  //         });
  //       } else {
  //         await ctx.reply(detailsMsg, { parse_mode: "HTML" });
  //       }
  //       
  //       await ctx.answerCallbackQuery();
  //     } else {
  //       await ctx.answerCallbackQuery("❌ Товар не найден");
  //     }
  //   } catch (err) {
  //     console.error("Ошибка получения информации о товаре:", err);
  //     await ctx.answerCallbackQuery("❌ Ошибка при получении информации");
  //   }
  //   return;
  // }

  // Операции с корзиной
  if (data === "cart_view") {
    try {
      await ctx.conversation.enter('viewCart');
    } catch (err) {
      console.error("Ошибка открытия корзины:", err);
      await ctx.answerCallbackQuery("❌ Не удалось открыть корзину");
    }
    return;
  }

  if (data === "cart_checkout") {
    await ctx.answerCallbackQuery();
    try {
      await ctx.conversation.enter('checkout');
    } catch (err) {
      console.error("Ошибка оформления заказа:", err);
      await ctx.reply("❌ Не удалось оформить заказ. Попробуйте позже.");
    }
    return;
  }

  if (data === "cart_clear") {
    try {
      await cartService.clearCart(ctx.from.id);
      await ctx.answerCallbackQuery("🗑️ Корзина очищена");
      
        // Try to update the cart message in-place if callback was from the cart message
        try {
          const build = (await import('../conversations/cartViewRenderer')).default;
          const payload = await build(ctx.from.id);
          if (ctx.callbackQuery.message && payload) {
            // If cart is empty, edit to say it's empty and remove keyboard
            if (payload.isEmpty) {
              await ctx.editMessageText('🛒 Ваша корзина пуста');
            } else {
              await ctx.editMessageText(payload.text, { parse_mode: 'HTML', reply_markup: payload.reply_markup });
            }
          }
        } catch (e) {
          // ignore edit errors
          console.warn('Failed to edit cart message after clear', e);
        }
    } catch (err) {
      console.error("Ошибка очистки корзины:", err);
      await ctx.answerCallbackQuery("❌ Ошибка при очистке корзины");
    }
    return;
  }

  if (data?.startsWith("cart_remove:")) {
    const itemId = data.split(":")[1];
    try {
      await cartService.removeItem(ctx.from.id, itemId);
      await ctx.answerCallbackQuery("🗑️ Позиция удалена");
      
        try {
          const build = (await import('../conversations/cartViewRenderer')).default;
          const payload = await build(ctx.from.id);
          if (ctx.callbackQuery.message && payload) {
            if (payload.isEmpty) {
              await ctx.editMessageText('🛒 Ваша корзина пуста');
            } else {
              await ctx.editMessageText(payload.text, { parse_mode: 'HTML', reply_markup: payload.reply_markup });
            }
          }
        } catch (e) {
          console.warn('Failed to edit cart message after remove', e);
        }
    } catch (err) {
      console.error("Ошибка удаления позиции корзины:", err);
      await ctx.answerCallbackQuery("❌ Ошибка при удалении позиции");
    }
    return;
  }

  if (data?.startsWith("cart_increase:") || data?.startsWith("cart_decrease:")) {
    const itemId = data.split(":")[1];
    const delta = data.startsWith("cart_increase:") ? 1 : -1;
    try {
      await cartService.updateItemQuantity(ctx.from.id, itemId, delta);
      await ctx.answerCallbackQuery("✅ Количество обновлено");
      
        try {
          const build = (await import('../conversations/cartViewRenderer')).default;
          const payload = await build(ctx.from.id);
          if (ctx.callbackQuery.message && payload) {
            if (payload.isEmpty) {
              await ctx.editMessageText('🛒 Ваша корзина пуста');
            } else {
              await ctx.editMessageText(payload.text, { parse_mode: 'HTML', reply_markup: payload.reply_markup });
            }
          }
        } catch (e) {
          console.warn('Failed to edit cart message after update', e);
        }
    } catch (err: unknown) {
      console.error("Ошибка обновления количества:", err);
      const errorMessage = err instanceof Error ? err.message : "❌ Ошибка при обновлении количества";
      await ctx.answerCallbackQuery(errorMessage);
    }
    return;
  }
};