import { InlineKeyboard, Keyboard } from "grammy";

export const registerKeyboard = new InlineKeyboard()
  .text("🛒 Стать покупателем", "register:buyer")
  .row()
  .text("🏪 Стать продавцом", "register:seller")
  .row()
  .text("🎭 Стать и покупателем, и продавцом", "register:both");

export function getBuyerKeyboard(hasSeller: boolean = false) {
  const keyboard = new Keyboard()
    .text("✨ Лента")
    .row()
    .text("📦 Каталог")
    .text("🛒 Корзина")
    .row()
    .text("🔍 Поиск")
    .text("📋 Мои заказы")
    .row()
    .text("👤 Профиль")
    .row();

  if (hasSeller) {
    keyboard.text("🏪 Перейти в продавцы");
  } else {
    keyboard.text("🏪 Стать продавцом");
  }

  return keyboard.resized();
}

export function getSellerKeyboard(hasBuyer: boolean = true) {
  const keyboard = new Keyboard()
    .text("📦 Мои товары")
    .text("➕ Добавить товар")
    .row()
    .text("📋 Заказы")
    .text("📊 Статистика")
    .row()
    .text("👤 Профиль")
    .text("⚙️ Настройки");

  if (hasBuyer) {
    keyboard.row().text("👤 Перейти в покупатели");
  }

  return keyboard.resized();
}

export const shopSettingsKeyboard = new InlineKeyboard()
  .text("📝 Изменить название", "shop:edit_name")
  .row()
  .text("📄 Изменить описание", "shop:edit_description")
  .row()
  .text("◀️ Назад", "shop:back");
