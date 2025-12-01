import cartService from "../database/controllers/cart";
import Product from "../database/models/Product";
import { InlineKeyboard } from "grammy";

export async function buildCartPayload(telegramId: number) {
  const cart = await cartService.getCart(telegramId);
  if (!cart || cart.items.length === 0) {
    return { isEmpty: true, text: "🛒 Ваша корзина пуста" };
  }
  const ids = cart.items.map(it => {
    const prod = it.productId;
    if (prod && typeof prod === 'object' && prod._id) {
      return prod._id.toString();
    }
    return prod ? prod.toString() : null;
  }).filter(id => id !== null);

  const products = await Product.find({ _id: { $in: ids }, isActive: true }).lean();
  const prodMap = new Map(products.map(p => [p._id.toString(), p]));

  let total = 0;
  const lines: string[] = [];
  const keyboard = new InlineKeyboard();

  for (const item of cart.items) {
    const prod = item.productId;
    let product: typeof products[0] | undefined;
    let pid: string | undefined;

    if (prod && typeof prod === 'object' && '_id' in prod) {
      pid = (prod as unknown as { _id: { toString: () => string } })._id.toString();
      product = prodMap.get(pid) || (prod as unknown as typeof products[0]);
    } else if (prod && typeof prod !== 'object') {
      pid = (prod as unknown as { toString: () => string }).toString();
      product = prodMap.get(pid);
    }

    if (!product || !product.name || !pid) {
      continue;
    }

    const qty = item.quantity || 1;
    const price = product.price || 0;
    const subtotal = qty * price;
    total += subtotal;

    const name = product.name || 'Товар';
    lines.push(`• <b>${name}</b>\n  Цена: ${price} ₽ x ${qty} = ${subtotal} ₽`);

    keyboard
      .text('➕', `cart_increase:${item._id}`)
      .text('➖', `cart_decrease:${item._id}`)
      .text('🗑', `cart_remove:${item._id}`)
      .row();
  }

  if (lines.length === 0) {
    return { isEmpty: true, text: "🛒 Ваша корзина пуста" };
  }

  const header = `🛒 <b>Ваша корзина</b>\n\n`;
  const body = lines.join('\n\n');
  const summary = `\n\n💳 <b>Итого:</b> ${total} ₽`;

  keyboard.row()
    .text('💳 Оформить заказ', 'cart_checkout')
    .text('🗑 Очистить корзину', 'cart_clear');

  return { isEmpty: false, text: header + body + summary, reply_markup: keyboard };
}

export default buildCartPayload;
