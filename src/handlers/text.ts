import { MyContext } from "../types/bot";
import userService from "../database/controllers/user";
import shopService from "../database/controllers/shop";
import { getBuyerKeyboard, getSellerKeyboard } from "../shared/keyboards";

export const handleSwitchToBuyer = async (ctx: MyContext) => {
  if (!ctx.from) return;

  if (!ctx.session) {
    ctx.session = { menu: null, profile: null };
  }

  const user = await userService.getUserById(ctx.from.id);
  if (!user) {
    await ctx.reply("❌ Пользователь не найден. Используйте /start");
    return;
  }

  if (!user.profiles.buyer.isActive) {
    await ctx.reply("❌ Профиль покупателя не активен");
    return;
  }

  ctx.session.profile = "buyer";

  await ctx.reply(
    "✅ Переключено на профиль покупателя\n\n📦 Выбирайте товары из каталога!",
    { reply_markup: getBuyerKeyboard(user.profiles.seller.isActive) }
  );
};

export const handleSwitchToSeller = async (ctx: MyContext) => {
  if (!ctx.from) return;

  if (!ctx.session) {
    ctx.session = { menu: null, profile: null };
  }

  const user = await userService.getUserById(ctx.from.id);
  if (!user) {
    await ctx.reply("❌ Пользователь не найден. Используйте /start");
    return;
  }

  if (!user.profiles.seller.isActive) {
    await ctx.reply("❌ Профиль продавца не активен");
    return;
  }

  ctx.session.profile = "seller";

  await ctx.reply(
    "✅ Переключено на профиль продавца\n\n🏪 Управляйте своими товарами!",
    { reply_markup: getSellerKeyboard(user.profiles.buyer.isActive) }
  );
};

export const handleBecomeSeller = async (ctx: MyContext) => {
  if (!ctx.from) return;

  const user = await userService.getUserById(ctx.from.id);
  if (!user) {
    await ctx.reply("❌ Пользователь не найден. Используйте /start");
    return;
  }

  if (user.profiles.seller.isActive) {
    await ctx.reply("❌ Вы уже являетесь продавцом");
    return;
  }

  await ctx.conversation.enter("sellerRegistration");
};

export const handleProfile = async (ctx: MyContext) => {
  if (!ctx.from) return;

  if (!ctx.session) {
    ctx.session = { menu: null, profile: null };
  }

  const user = await userService.getUserWithShop(ctx.from.id);
  if (!user) {
    await ctx.reply("❌ Пользователь не найден. Используйте /start");
    return;
  }

  const currentProfile = ctx.session.profile || "buyer";

  let profileText = `👤 Ваш профиль\n\n`;
  profileText += `Имя: ${user.firstName || ""} ${user.lastName || ""}\n`;
  profileText += `Username: @${user.username || "не указан"}\n`;
  profileText += `Телефон: ${user.phoneNumber || "не указан"}\n\n`;
  profileText += `Активный профиль: ${
    currentProfile === "buyer" ? "👤 Покупатель" : "🏪 Продавец"
  }\n\n`;

  if (user.profiles.buyer.isActive) {
    profileText += `📋 Заказов совершено: ${user.profiles.buyer.ordersCount}\n`;
  }

  if (user.profiles.seller.isActive && user.profiles.seller.shopId) {
    const shop = user.profiles.seller.shopId as unknown as {
      name: string;
      description: string;
      productsCount: number;
      salesCount: number;
      rating: number;
      reviewsCount: number;
      isApproved: boolean;
    };
    profileText += `\n🏪 Магазин: ${shop.name || "не указан"}\n`;
    profileText += `📝 Описание: ${shop.description || "не указано"}\n`;
    profileText += `📦 Товаров: ${shop.productsCount}\n`;
    profileText += `💰 Продаж: ${shop.salesCount}\n`;
    profileText += `⭐ Рейтинг: ${shop.rating.toFixed(1)} (${
      shop.reviewsCount
    } отзывов)\n`;
    profileText += `✅ Статус: ${
      shop.isApproved ? "Одобрен" : "На модерации"
    }\n`;
  }

  await ctx.reply(profileText);
};

export const handleFeed = async (ctx: MyContext) => {
  if (!ctx.from) return;

  if (!ctx.session) {
    ctx.session = { menu: null, profile: null };
  }

  await ctx.conversation.enter("productFeed");
};

export const handleCatalog = async (ctx: MyContext) => {
  await ctx.conversation.enter("catalog");
};

export const handleCart = async (ctx: MyContext) => {
  if (!ctx.session) {
    ctx.session = { menu: null, profile: null };
  }
  await ctx.conversation.enter("viewCart");
};

export const handleMyOrders = async (ctx: MyContext) => {
  await ctx.conversation.enter("viewMyOrders");
};

export const handleSearch = async (ctx: MyContext) => {
  await ctx.conversation.enter("searchProducts");
};

export const handleMyProducts = async (ctx: MyContext) => {
  if (!ctx.from) return;

  await ctx.conversation.enter("viewMyProducts");
};

export const handleAddProduct = async (ctx: MyContext) => {
  if (!ctx.from) return;

  await ctx.conversation.enter("addProduct");
};

export const handleSellerOrders = async (ctx: MyContext) => {
  if (!ctx.from) return;

  const user = await userService.getUserWithShop(ctx.from.id);
  if (!user || !user.profiles.seller.isActive) {
    await ctx.reply("❌ Эта функция доступна только продавцам");
    return;
  }

  const shop = user.profiles.seller.shopId as unknown as {
    isApproved: boolean;
  } | null;
  if (!shop || !shop.isApproved) {
    await ctx.reply(
      "⏳ Ваш магазин находится на модерации.\n\n" +
        "После одобрения администратором вы сможете получать заказы.\n\n" +
        "Обычно модерация занимает до 24 часов."
    );
    return;
  }

  await ctx.reply("📋 Заказы по вашим товарам\n\nФункционал в разработке...");
};

export const handleStatistics = async (ctx: MyContext) => {
  if (!ctx.from) return;

  const user = await userService.getUserWithShop(ctx.from.id);
  if (!user || !user.profiles.seller.isActive) {
    await ctx.reply("❌ Эта функция доступна только продавцам");
    return;
  }

  const shop = user.profiles.seller.shopId as unknown as {
    isApproved: boolean;
    productsCount: number;
    salesCount: number;
    totalRevenue: number;
    rating: number;
    reviewsCount: number;
  } | null;
  const isApproved = shop && shop.isApproved;

  let stats = `📊 Статистика\n\n`;

  if (!isApproved) {
    stats += `⏳ <b>Статус:</b> На модерации\n\n`;
    stats += `Ваш магазин проходит проверку администратором.\n`;
    stats += `После одобрения статистика будет доступна.`;
  } else {
    stats += `✅ <b>Статус:</b> Одобрен\n\n`;
    stats += `📦 <b>Товаров:</b> ${shop.productsCount || 0}\n`;
    stats += `💰 <b>Продаж:</b> ${shop.salesCount || 0}\n`;
    stats += `💵 <b>Общая выручка:</b> ${shop.totalRevenue || 0} ₽\n`;
    stats += `⭐ <b>Рейтинг:</b> ${shop.rating?.toFixed(1) || "0.0"} (${
      shop.reviewsCount || 0
    } отзывов)`;
  }

  await ctx.reply(stats, { parse_mode: "HTML" });
};

export const handleSettings = async (ctx: MyContext) => {
  if (!ctx.from) return;

  const user = await userService.getUserWithShop(ctx.from.id);
  if (!user || !user.profiles.seller.isActive || !user.profiles.seller.shopId) {
    await ctx.reply("❌ У вас нет активного магазина");
    return;
  }

  const shop = user.profiles.seller.shopId as unknown as {
    name: string;
    description: string;
  };

  const { shopSettingsKeyboard } = await import("../shared/keyboards");

  await ctx.reply(
    `⚙️ <b>Настройки магазина</b>\n\n` +
      `🏪 <b>Название:</b> ${shop.name}\n` +
      `📝 <b>Описание:</b> ${shop.description}\n\n` +
      `Выберите, что хотите изменить:`,
    {
      parse_mode: "HTML",
      reply_markup: shopSettingsKeyboard,
    }
  );
};
