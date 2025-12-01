import { MyContext } from "../types/bot";
import {
  registerKeyboard,
  getBuyerKeyboard,
  getSellerKeyboard,
} from "../shared/keyboards";
import userService from "../database/controllers/user";
import shopService from "../database/controllers/shop";
import { InlineKeyboard } from "grammy";

export const start = async (ctx: MyContext) => {
  if (!ctx.from) return;

  if (!ctx.session) {
    ctx.session = { menu: null, profile: null };
  }

  const name = ctx.from?.first_name
    ? ctx.from?.username
      ? `<a href="https://t.me/${ctx.from.username}">${ctx.from.first_name}</a>`
      : ctx.from.first_name
    : ctx.from?.username
    ? `@${ctx.from.username}`
    : "друг";

  const user = await userService.getUserById(ctx.from.id);

  if (user && (user.profiles.buyer.isActive || user.profiles.seller.isActive)) {
    if (!user.phoneNumber) {
      await ctx.reply(
        `⚠️ ${name}, похоже мы не закончили регистрацию!\n\n` +
          `Для продолжения работы нам нужен ваш номер телефона.\n\n` +
          `Давайте завершим регистрацию! 👇`,
        {
          parse_mode: "HTML",
          reply_markup: registerKeyboard,
          link_preview_options: { is_disabled: true },
        }
      );
      return;
    }

    const currentProfile =
      ctx.session.profile ||
      (user.profiles.buyer.isActive ? "buyer" : "seller");
    ctx.session.profile = currentProfile;

    const profileText =
      currentProfile === "buyer" ? "👤 Покупатель" : "🏪 Продавец";
    const keyboard =
      currentProfile === "buyer"
        ? getBuyerKeyboard(user.profiles.seller.isActive)
        : getSellerKeyboard(user.profiles.buyer.isActive);

    await ctx.reply(
      `👋 С возвращением, <b>${name}!</b>\n\n` +
        `<b>Текущий профиль:</b> ${profileText}\n\n` +
        `🔽 Выберите действие из меню ниже:`,
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      }
    );
  } else {
    await ctx.reply(
      `<b>Привет, ${name}! Я — Berri 🍓</b>\nТвой помощник на маркетплейсе.\n\n<blockquote>Здесь ты можешь быстро найти то, что нужно, или выгодно продать свои товары.</blockquote>\n\n🛒 Для покупателей мы предлагаем удобный каталог, возможность сравнивать цены и оформлять заказы за пару кликов.\n\n🏪 Для продавцов мы можем предложить простой способ добавлять товары, управлять заказами и отслеживать актуальные продажи в реальном времени.\n\n<b>👇🏻 Выбери, как начать, и нажми на кнопку ниже, чтобы зарегистрироваться и сразу пользоваться маркетплейсом.</b>`,
      {
        parse_mode: "HTML",
        reply_markup: registerKeyboard,
        link_preview_options: { is_disabled: true },
      }
    );
  }
};

export const addCategory = async (ctx: MyContext) => {
  if (!ctx.from) return;
  if (!userService.isAdmin(ctx.from.id)) {
    await ctx.reply("❌ Эта команда доступна только администраторам");
    return;
  }
  await ctx.conversation.enter("addCategoryConversation")
};

export const pendingShops = async (ctx: MyContext) => {
  if (!ctx.from) return;

  if (!userService.isAdmin(ctx.from.id)) {
    await ctx.reply("❌ Эта команда доступна только администраторам");
    return;
  }

  const shops = await shopService.getPendingShops();

  if (shops.length === 0) {
    await ctx.reply("✅ Нет магазинов, ожидающих модерации");
    return;
  }

  await ctx.reply(
    `📋 Магазины на модерации: ${shops.length}\n\nПросмотрите каждый магазин ниже:`
  );

  for (const shop of shops) {
    const owner = shop.ownerId as unknown as {
      firstName?: string;
      lastName?: string;
      username?: string;
      phoneNumber?: string;
      telegramId: number;
    };
    const text =
      `🏪 <b>Новый магазин</b>\n\n` +
      `<b>Название:</b> ${shop.name}\n` +
      `<b>Описание:</b> ${shop.description}\n\n` +
      `<b>Владелец:</b> ${owner.firstName || ""} ${owner.lastName || ""}\n` +
      `<b>Username:</b> @${owner.username || "нет"}\n` +
      `<b>Телефон:</b> ${owner.phoneNumber || "нет"}\n` +
      `<b>Telegram ID:</b> ${owner.telegramId}\n\n` +
      `<b>ID магазина:</b> <code>${shop._id}</code>`;

    const keyboard = new InlineKeyboard()
      .text("✅ Одобрить", `approve_shop:${shop._id}`)
      .text("❌ Отклонить", `reject_shop:${shop._id}`);

    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  }
};

export const statsCommand = async (ctx: MyContext) => {
  if (!ctx.from) return
  if (!userService.isAdmin(ctx.from.id)) {
    await ctx.reply("❌ Эта команда доступна только администраторам");
    return;
  }

  const pendingShops = await shopService.getPendingShops();
  const allShops = await shopService.getAllShops(1, 1000);

  const User = (await import("../database/models/User")).default;
  const totalUsers = await User.countDocuments();
  const buyers = await User.countDocuments({ "profiles.buyer.isActive": true });
  const sellers = await User.countDocuments({
    "profiles.seller.isActive": true,
  });

  const Product = (await import("../database/models/Product")).default;
  const totalProducts = await Product.countDocuments({ isActive: true });
  const availableProducts = await Product.countDocuments({
    status: "available",
    isActive: true,
  });

  const Category = (await import("../database/models/Category")).default;
  const totalCategories = await Category.countDocuments({ isActive: true });

  await ctx.reply(
    `📊 <b>Статистика платформы</b>\n\n` +
      `👥 <b>Пользователи:</b>\n` +
      `├ Всего: ${totalUsers}\n` +
      `├ Покупателей: ${buyers}\n` +
      `└ Продавцов: ${sellers}\n\n` +
      `🏪 <b>Магазины:</b>\n` +
      `├ Одобренных: ${allShops.length}\n` +
      `└ На модерации: ${pendingShops.length}\n\n` +
      `📦 <b>Товары:</b>\n` +
      `├ Всего: ${totalProducts}\n` +
      `└ Доступно: ${availableProducts}\n\n` +
      `🏷️ <b>Категорий:</b> ${totalCategories}`,
    { parse_mode: "HTML" }
  );
};
