import Category from "../database/models/Category";
import userService from "../database/controllers/user";
import { InlineKeyboard, Keyboard } from "grammy";
import { MyConversation, MyConversationContext } from "../types/bot";

export async function addCategoryConversation(
  conversation: MyConversation,
  ctx: MyConversationContext
) {
  const user = await userService.getUserById(ctx.from!.id);

  const cancelKeyboard = new Keyboard().text("❌ Отмена").resized();

  let name: string;
  while (true) {
    await ctx.reply("<b>Шаг 1/5:</b> Введите название категории:", {
      parse_mode: "HTML",
      reply_markup: cancelKeyboard,
    });
    const nameCtx = await conversation.wait();

    if (nameCtx.message?.text === "❌ Отмена") {
      await ctx.reply("❌ Создание категории отменено");
      return;
    }

    const text = nameCtx.message?.text?.trim();
    if (!text || text.length < 2) {
      await ctx.reply("❌ Название должно содержать минимум 2 символа");
      continue;
    }
    if (text.length > 50) {
      await ctx.reply("❌ Название слишком длинное (максимум 50 символов)");
      continue;
    }

    const exists = await Category.findOne({
      name: new RegExp(`^${escapeRegExp(text)}$`, "i"),
    });
    if (exists) {
      await ctx.reply(
        "❌ Категория с таким названием уже существует. Введите другое название"
      );
      continue;
    }

    name = text;
    break;
  }

  let emoji: string;
  while (true) {
    await ctx.reply(
      "<b>Шаг 2/5:</b> Отправьте эмодзи для категории (например: 🛍️).\n\nМожно ввести несколько, будет использован первый.",
      { parse_mode: "HTML", reply_markup: cancelKeyboard }
    );
    const emojiCtx = await conversation.wait();

    if (emojiCtx.message?.text === "❌ Отмена") {
      await ctx.reply("❌ Создание категории отменено");
      return;
    }

    const text = emojiCtx.message?.text?.trim();
    if (!text) {
      await ctx.reply("❌ Пожалуйста, введите эмодзи");
      continue;
    }

    const firstEmoji = extractFirstEmoji(text);
    if (!firstEmoji) {
      await ctx.reply("❌ Не удалось распознать эмодзи. Попробуйте ещё раз");
      continue;
    }

    emoji = firstEmoji;
    break;
  }

  let description: string | undefined;
  while (true) {
    await ctx.reply(
      "<b>Шаг 3/5:</b> Введите описание категории (опционально).\n\nОтправьте текст или нажмите '⏭️ Пропустить'.",
      {
        parse_mode: "HTML",
        reply_markup: new Keyboard()
          .text("⏭️ Пропустить")
          .row()
          .text("❌ Отмена")
          .resized(),
      }
    );
    const descCtx = await conversation.wait();

    if (descCtx.message?.text === "❌ Отмена") {
      await ctx.reply("❌ Создание категории отменено");
      return;
    }

    if (descCtx.message?.text === "⏭️ Пропустить") {
      description = undefined;
      break;
    }

    const text = descCtx.message?.text?.trim();
    if (!text) {
      await ctx.reply("❌ Введите описание или нажмите '⏭️ Пропустить'");
      continue;
    }

    if (text.length > 300) {
      await ctx.reply("❌ Описание слишком длинное (максимум 300 символов)");
      continue;
    }

    description = text;
    break;
  }

  let order = 0;
  while (true) {
    await ctx.reply(
      "<b>Шаг 4/5:</b> Укажите порядковый номер (целое число).\n\nЧем меньше число — тем выше категория в списке.\nОтправьте '⏭️ Пропустить' для значения по умолчанию (0).",
      {
        parse_mode: "HTML",
        reply_markup: new Keyboard()
          .text("⏭️ Пропустить")
          .row()
          .text("❌ Отмена")
          .resized(),
      }
    );
    const orderCtx = await conversation.wait();

    if (orderCtx.message?.text === "❌ Отмена") {
      await ctx.reply("❌ Создание категории отменено");
      return;
    }

    if (orderCtx.message?.text === "⏭️ Пропустить") {
      order = 0;
      break;
    }

    const parsed = parseInt(orderCtx.message?.text || "", 10);
    if (isNaN(parsed)) {
      await ctx.reply("❌ Введите целое число или '⏭️ Пропустить'");
      continue;
    }

    order = parsed;
    break;
  }

  const isAdmin = checkIsAdmin(user);
  let isActive = false;
  if (isAdmin) {
    const activeKeyboard = new InlineKeyboard()
      .text("✅ Создать и активировать", "create_category:active")
      .row()
      .text("🔒 Создать неактивной", "create_category:inactive");
    await ctx.reply(
      `<b>Шаг 5/5:</b> Выберите, создать категорию активной или неактивной (для администратора).\n\nНазвание: ${name}\nЭмодзи: ${emoji}${
        description ? `\nОписание: ${description}` : ""
      }\nПорядок: ${order}`,
      { parse_mode: "HTML", reply_markup: activeKeyboard }
    );

    while (true) {
      const cb = await conversation.waitFor("callback_query:data");
      if (!cb.callbackQuery?.data) {
        await ctx.reply("❌ Необходимо выбрать опцию");
        continue;
      }

      const data = cb.callbackQuery.data;
      if (data === "create_category:active") {
        isActive = true;
      } else if (data === "create_category:inactive") {
        isActive = false;
      } else {
        await ctx.reply("❌ Некорректный выбор");
        continue;
      }

      await cb.answerCallbackQuery();
      await cb.editMessageText(
        `<b>Выбрано:</b> ${isActive ? "Активная" : "Неактивная"}`,
        { parse_mode: "HTML" }
      );
      break;
    }
  } else {
    isActive = false;
  }

  try {
    const category = await Category.create({
      name,
      emoji,
      description,
      order,
      isActive,
    });

    if (isAdmin) {
      await ctx.reply(`<b>✅ Категория успешно создана:</b> ${emoji} ${name}`, {
        parse_mode: "HTML",
      });
    } else {
      await ctx.reply(
        `<b>✅ Заявка на создание категории отправлена на модерацию.</b>\nПосле одобрения администратором категория появится в каталоге.`,
        { parse_mode: "HTML" }
      );

      if (process.env.ADMIN_ID) {
        try {
          const moderationKeyboard = new InlineKeyboard()
            .text("✅ Одобрить", `approve_category:${category._id}`)
            .text("❌ Отклонить", `reject_category:${category._id}`);

          let adminMessage =
            `🆕 Новая заявка на категорию:\n\n` +
            `👤 Отправитель: ${ctx.from?.first_name || ""} ${
              ctx.from?.last_name || ""
            }\n` +
            `📱 @${ctx.from?.username || "нет username"}\n\n` +
            `🏷️ Название: ${name}\n` +
            `🔣 Эмодзи: ${emoji}\n` +
            (description ? `📝 Описание: ${description}\n` : "") +
            `🔢 Порядок: ${order}\n` +
            `\n🆔 ID заявки: ${category._id}`;

          await ctx.api.sendMessage(process.env.ADMIN_ID, adminMessage, {
            reply_markup: moderationKeyboard,
          });
        } catch (err) {
          console.error("Ошибка отправки уведомления админу о категории:", err);
        }
      }
    }
  } catch (error) {
    console.error("Ошибка создания категории:", error);
    await ctx.reply(
      "❌ Произошла ошибка при создании категории. Попробуйте ещё раз позже."
    );
  }
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFirstEmoji(text: string): string | null {
  const emojiRegex =
    /([\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])/u;
  const match = text.match(emojiRegex);
  return match ? match[0] : null;
}

function checkIsAdmin(user: any): boolean {
  if (!user) return false;
  if (typeof user.isAdmin === "boolean") return user.isAdmin;
  if (user.profiles?.admin?.isActive) return true;

  if (
    process.env.ADMIN_ID &&
    user.telegramId &&
    user.telegramId.toString() === process.env.ADMIN_ID.toString()
  )
    return true;
  return false;
}
