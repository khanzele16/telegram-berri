import userService from "../database/controllers/user";
import shopService from "../database/controllers/shop";
import { getSellerKeyboard } from "../shared/keyboards";
import { MyConversation, MyConversationContext } from "../types/bot";

export async function editShopName(
  conversation: MyConversation,
  ctx: MyConversationContext
) {
  if (!ctx.from) return;

  const user = await userService.getUserWithShop(ctx.from.id);
  if (!user || !user.profiles.seller.isActive || !user.profiles.seller.shopId) {
    await ctx.reply("❌ У вас нет активного магазина");
    return;
  }

  const shop = user.profiles.seller.shopId as unknown as {
    _id: { toString: () => string };
    name: string;
  };

  let newName: string;
  while (true) {
    await ctx.reply(
      `Текущее название магазина: <b>${shop.name}</b>\n\n` +
        `📝 Введите новое название магазина:`,
      { parse_mode: "HTML" }
    );

    const nameCtx = await conversation.wait();

    if (!nameCtx.message?.text) {
      await ctx.reply("❌ Необходимо ввести текст. Попробуйте ещё раз.");
      continue;
    }

    newName = nameCtx.message.text.trim();

    if (newName.length < 3) {
      await ctx.reply(
        "❌ Название должно содержать минимум 3 символа. Попробуйте ещё раз."
      );
      continue;
    }

    if (newName.length > 50) {
      await ctx.reply(
        "❌ Название не должно превышать 50 символов. Попробуйте ещё раз."
      );
      continue;
    }

    break;
  }

  await shopService.submitNameChange(shop._id.toString(), newName);

  const keyboard = getSellerKeyboard(user.profiles.buyer.isActive);

  await ctx.reply(
    `✅ Запрос на изменение названия отправлен на модерацию!\n\n` +
      `Новое название: <b>${newName}</b>\n\n` +
      `После одобрения администратором название будет изменено.`,
    {
      parse_mode: "HTML",
      reply_markup: keyboard,
    }
  );

  if (process.env.ADMIN_ID) {
    try {
      const { InlineKeyboard } = await import("grammy");
      const moderationKeyboard = new InlineKeyboard()
        .text("✅ Одобрить", `approve_shop_name:${shop._id}`)
        .text("❌ Отклонить", `reject_shop_name:${shop._id}`);

      await ctx.api.sendMessage(
        process.env.ADMIN_ID,
        `🔄 <b>Изменение названия магазина</b>\n\n` +
          `👤 ${ctx.from?.first_name || ""} ${ctx.from?.last_name || ""}\n` +
          `📱 @${ctx.from?.username || "нет username"}\n\n` +
          `🏪 <b>Текущее:</b> ${shop.name}\n` +
          `⬇️ <b>Новое:</b> ${newName}\n\n` +
          `🆔 ID магазина: ${shop._id}`,
        {
          parse_mode: "HTML",
          reply_markup: moderationKeyboard,
        }
      );
    } catch (error) {
      console.error("❌ Ошибка отправки уведомления админу:", error);
    }
  }
}

export async function editShopDescription(
  conversation: MyConversation,
  ctx: MyConversationContext
) {
  if (!ctx.from) return;

  const user = await userService.getUserWithShop(ctx.from.id);
  if (!user || !user.profiles.seller.isActive || !user.profiles.seller.shopId) {
    await ctx.reply("❌ У вас нет активного магазина");
    return;
  }

  const shop = user.profiles.seller.shopId as unknown as {
    _id: { toString: () => string };
    name: string;
    description: string;
  };

  let newDescription: string;
  while (true) {
    await ctx.reply(
      `Текущее описание магазина:\n<i>${shop.description}</i>\n\n` +
        `📝 Введите новое описание магазина:`,
      { parse_mode: "HTML" }
    );

    const descCtx = await conversation.wait();

    if (!descCtx.message?.text) {
      await ctx.reply("❌ Необходимо ввести текст. Попробуйте ещё раз.");
      continue;
    }

    newDescription = descCtx.message.text.trim();

    if (newDescription.length < 10) {
      await ctx.reply(
        "❌ Описание должно содержать минимум 10 символов. Попробуйте ещё раз."
      );
      continue;
    }

    if (newDescription.length > 500) {
      await ctx.reply(
        "❌ Описание не должно превышать 500 символов. Попробуйте ещё раз."
      );
      continue;
    }

    break;
  }

  await shopService.submitDescriptionChange(
    shop._id.toString(),
    newDescription
  );

  const keyboard = getSellerKeyboard(user.profiles.buyer.isActive);

  await ctx.reply(
    `✅ Запрос на изменение описания отправлен на модерацию!\n\n` +
      `Новое описание:\n<i>${newDescription}</i>\n\n` +
      `После одобрения администратором описание будет изменено.`,
    {
      parse_mode: "HTML",
      reply_markup: keyboard,
    }
  );

  if (process.env.ADMIN_ID) {
    try {
      const { InlineKeyboard } = await import("grammy");
      const moderationKeyboard = new InlineKeyboard()
        .text("✅ Одобрить", `approve_shop_desc:${shop._id}`)
        .text("❌ Отклонить", `reject_shop_desc:${shop._id}`);

      await ctx.api.sendMessage(
        process.env.ADMIN_ID,
        `🔄 <b>Изменение описания магазина</b>\n\n` +
          `👤 ${ctx.from?.first_name || ""} ${ctx.from?.last_name || ""}\n` +
          `📱 @${ctx.from?.username || "нет username"}\n` +
          `🏪 Магазин: ${shop.name}\n\n` +
          `<b>Текущее:</b>\n<i>${shop.description}</i>\n\n` +
          `<b>Новое:</b>\n<i>${newDescription}</i>\n\n` +
          `🆔 ID магазина: ${shop._id}`,
        {
          parse_mode: "HTML",
          reply_markup: moderationKeyboard,
        }
      );
    } catch (error) {
      console.error("❌ Ошибка отправки уведомления админу:", error);
    }
  }
}
