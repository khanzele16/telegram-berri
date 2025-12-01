import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  handleSwitchToBuyer,
  handleSwitchToSeller,
  handleBecomeSeller,
  handleProfile,
  handleFeed,
  handleCatalog,
  handleCart,
  handleMyOrders,
  handleSearch,
  handleMyProducts,
  handleAddProduct,
  handleSellerOrders,
  handleStatistics,
  handleSettings,
} from "./handlers/text";
import {
  buyerRegistration,
  sellerRegistration,
  bothRegistration,
  searchProducts,
} from "./conversations/registration";
import { commands } from "./config/commands";
import { ISessionData } from "./types/plugins";
import { catalog } from "./conversations/catalog";
import { productFeed } from "./conversations/feed";
import { checkout } from "./conversations/checkout";
import { viewCart } from "./conversations/viewCart";
import { freeStorage } from "@grammyjs/storage-free";
import { initialSessionData } from "./shared/session";
import { initializeCategories } from "./database/seed";
import { addProduct } from "./conversations/addProduct";
import { viewMyOrders } from "./conversations/viewMyOrders";
import { viewMyProducts } from "./conversations/viewProducts";
import { MyContext, MyConversationContext } from "./types/bot";
import { callbackQueryHandler } from "./handlers/callbackQuery";
import { approveOrderConversation } from "./conversations/approveOrder";
import { conversations, createConversation } from "@grammyjs/conversations";
import {
  Bot,
  GrammyError,
  HttpError,
  InlineKeyboard,
  NextFunction,
  session,
} from "grammy";
import {
  editShopName,
  editShopDescription,
} from "./conversations/shopSettings";
import User from "./database/models/User";
import { addCategoryConversation } from "./conversations/addCategory";

dotenv.config({ path: "src/.env" });

const bot = new Bot<MyContext>(process.env.BOT_TOKEN as string);

bot.api.setMyCommands(
  commands
    .filter((command) => !command.admin)
    .map((command) => ({
      command: command.command,
      description: command.description,
    }))
);

if (process.env.ADMIN_ID) {
  bot.api.setMyCommands(
    commands.map((command) => ({
      command: command.command,
      description: command.description,
    })),
    { scope: { type: "chat", chat_id: parseInt(process.env.ADMIN_ID) } }
  );
}

mongoose
  .connect(process.env.MONGO_URL as string, { dbName: "berriDB" })
  .then(async () => {
    console.log("✅ База данных подключена успешно");
    await initializeCategories();
  })
  .catch((err) => {
    console.error("❌ Ошибка подключения к базе данных:", err);
    process.exit(1);
  });

bot.use(
  session({
    initial: initialSessionData,
    // @ts-ignore
    storage: freeStorage<ISessionData>(bot.token),
  })
);

bot.use(conversations());

commands.forEach((command) => {
  bot.command(command.command, async (ctx, next: NextFunction) => {
    await ctx.conversation.exitAll();
    return next();
  });
});

bot.use(createConversation(buyerRegistration));
bot.use(createConversation(sellerRegistration));
bot.use(createConversation(bothRegistration));
bot.use(createConversation(searchProducts));
bot.use(createConversation(addProduct));
bot.use(createConversation(viewMyProducts));
bot.use(createConversation(productFeed));
bot.use(createConversation(catalog));
bot.use(createConversation(viewCart));
bot.use(createConversation(editShopName));
bot.use(createConversation(editShopDescription));
bot.use(createConversation(checkout));
bot.use(createConversation(viewMyOrders));
bot.use(createConversation(approveOrderConversation));
bot.use(createConversation(addCategoryConversation));

bot.on("callback_query:data", callbackQueryHandler);

bot.on("pre_checkout_query", async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on("message:successful_payment", async (ctx) => {
  const payment = ctx.message.successful_payment;
  const orderNumber = payment.invoice_payload;

  try {
    const Order = (await import("./database/models/Order")).default;
    const Product = (await import("./database/models/Product")).default;
    const cartService = (await import("./database/controllers/cart")).default;

    const order = await Order.findOne({ orderNumber });

    if (order) {
      await order.updateOne({
        status: "paid",
        paymentStatus: "succeeded",
        paymentId: payment.telegram_payment_charge_id,
        paidAt: new Date(),
        "buyerContact.phone": payment.order_info?.phone_number || "",
      });

      for (const item of order.items) {
        if (item.productId && item.quantity) {
          try {
            await Product.findByIdAndUpdate(
              item.productId,
              { $inc: { quantity: -(item.quantity || 0) } },
              { new: true }
            );
          } catch (e) {
            console.error(
              `Failed to decrease quantity for product ${item.productId}:`,
              e
            );
          }
        }
      }
      await cartService.clearCart(ctx.from.id);
      await ctx.reply(
        "✅ <b>Оплата прошла успешно!</b>\n\n" +
          `💳 Заказ: ${orderNumber}\n` +
          `💰 Сумма: ${payment.total_amount / 100} ₽\n\n` +
          "⏳ Заказ отправлен на модерацию администратору.\n" +
          "📦 Отследить статус можно в '📋 Мои заказы'",
        { parse_mode: "HTML" }
      );

      for (const item of order.items) {
        if (item.sellerId) {
          try {
            const seller = await User.findById(item.sellerId);
            if (seller && seller.telegramId) {
              const buyerUsername = ctx.from?.username
                ? `@${ctx.from.username}`
                : ctx.from?.first_name || "Покупатель";
              const itemTotal = (item.price || 0) * (item.quantity || 0);

              await ctx.api.sendMessage(
                seller.telegramId,
                "🔔 <b>Новый заказ!</b>\n\n" +
                  `💳 Заказ: ${orderNumber}\n` +
                  `📦 Товар: ${item.name}\n` +
                  `📊 Количество: ${item.quantity || 0} шт.\n` +
                  `💰 Сумма: ${itemTotal} ₽\n` +
                  `👤 Покупатель: ${buyerUsername}\n\n` +
                  "⏳ Ожидайте одобрения администратора для получения выплаты.",
                { parse_mode: "HTML" }
              );
            }
          } catch (e) {
            console.error(`Failed to notify seller ${item.sellerId}:`, e);
          }
        }
      }

      const adminId = process.env.ADMIN_ID;
      if (adminId) {
        try {
          const buyer = await User.findOne({ telegramId: ctx.from.id });
          const buyerLink = ctx.from?.username
            ? `@${ctx.from.username}`
            : `<a href="tg://user?id=${ctx.from.id}">${
                ctx.from?.first_name || "Покупатель"
              }</a>`;

          const buyerPhone =
            buyer?.phoneNumber ||
            payment.order_info?.phone_number ||
            "не указан";

          let message = "🔔 <b>НОВАЯ ПОКУПКА - ТРЕБУЕТСЯ ПРОВЕРКА</b>\n\n";
          message += `💳 Заказ: <code>${orderNumber}</code>\n`;
          message += `💰 Сумма: ${payment.total_amount / 100} ₽\n`;
          message += `📅 Дата: ${new Date().toLocaleString("ru-RU")}\n\n`;
          message += `👤 <b>Покупатель:</b>\n`;
          message += `├ Ссылка: ${buyerLink}\n`;
          message += `├ ID: <code>${ctx.from.id}</code>\n`;
          message += `└ Телефон: ${buyerPhone}\n\n`;
          message += `📦 <b>Товары:</b>\n`;

          for (const item of order.items) {
            const seller = await User.findById(item.sellerId);
            const sellerLink = seller?.username
              ? `@${seller.username}`
              : seller?.telegramId
              ? `<a href="tg://user?id=${seller.telegramId}">${
                  seller.firstName || "Продавец"
                }</a>`
              : "Неизвестен";
            const sellerPhone = seller?.phoneNumber || "не указан";
            const itemTotal = (item.price || 0) * (item.quantity || 0);
            const sellerAmount = Math.round(itemTotal * 0.9);

            message += `\n🏷️ ${item.name}\n`;
            message += `├ Количество: ${item.quantity || 0} шт.\n`;
            message += `├ Цена: ${item.price || 0} ₽\n`;
            message += `├ Сумма: ${itemTotal} ₽\n`;
            message += `├ <b>Продавец:</b> ${sellerLink}\n`;
            message += `├ ID продавца: <code>${
              seller?.telegramId || "N/A"
            }</code>\n`;
            message += `├ Телефон продавца: ${sellerPhone}\n`;
            message += `└ К выплате: ${sellerAmount} ₽ (90%)\n`;
          }

          const keyboard = new InlineKeyboard()
            .text("✅ Одобрить сделку", `approve_order:${order._id}`)
            .text("❌ Отклонить", `reject_order:${order._id}`);

          await ctx.api.sendMessage(Number(adminId), message, {
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
        } catch (e) {
          console.error("Failed to notify admin:", e);
        }
      }
    }
  } catch (error) {
    console.error("Error processing successful payment:", error);
  }
});

bot.hears("👤 Перейти в покупатели", handleSwitchToBuyer);
bot.hears("🏪 Перейти в продавцы", handleSwitchToSeller);
bot.hears("🏪 Стать продавцом", handleBecomeSeller);
bot.hears("👤 Профиль", handleProfile);

bot.hears("✨ Лента", handleFeed);
bot.hears("📦 Каталог", handleCatalog);
bot.hears("🛒 Корзина", handleCart);
bot.hears("📋 Мои заказы", handleMyOrders);
bot.hears("🔍 Поиск", handleSearch);

bot.hears("📦 Мои товары", handleMyProducts);
bot.hears("➕ Добавить товар", handleAddProduct);
bot.hears("📋 Заказы", handleSellerOrders);
bot.hears("📊 Статистика", handleStatistics);
bot.hears("⚙️ Настройки", handleSettings);

commands.map((command) => bot.command(command.command, command.action));

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

bot.start();
