import Cart from "../models/Cart";
import userService from "./user";
import Product from "../models/Product";

class CartService {
  async getCart(telegramId: number) {
    const user = await userService.getUserById(telegramId);
    if (!user) return null;

    const cart = await Cart.findOne({ userId: user._id }).populate({
      path: 'items.productId',
      select: 'name price media images',
    });

    return cart;
  }

  async getCartWithDetails(telegramId: number) {
    const user = await userService.getUserById(telegramId);
    if (!user) return null;

    const cart = await Cart.findOne({ userId: user._id }).populate({
      path: 'items.productId',
      select: 'name price media sellerId',
    });

    return cart;
  }

  async addToCart(telegramId: number, productId: string, quantity = 1, size?: string) {
    const user = await userService.getUserById(telegramId);
    if (!user) return null;

    // Проверяем доступное количество товара
    const product = await Product.findById(productId);
    if (!product) throw new Error('Товар не найден');
    if (product.quantity < quantity) {
      throw new Error(`Недостаточно товара в наличии. Доступно: ${product.quantity} шт.`);
    }

    let cart = await Cart.findOne({ userId: user._id });
    if (!cart) {
      cart = new Cart({ userId: user._id, items: [] });
    }

    const existing = cart.items.find(it => it.productId.toString() === productId && (it.size || '') === (size || ''));

    if (existing) {
      throw new Error(`Этот товар уже в корзине (${existing.quantity} шт.). Измените количество в корзине.`);
    } else {
      if (cart.items.length >= 6) {
        throw new Error('❌ Достигнут лимит корзины (максимум 6 товаров). Оформите текущий заказ или удалите товары.');
      }
      if (quantity > product.quantity) {
        throw new Error(`Недостаточно товара в наличии. Доступно: ${product.quantity} шт.`);
      }
      cart.items.push({ productId, quantity, size });
    }

    cart.updatedAt = new Date();
    await cart.save();
    return cart;
  }

  async updateItemQuantity(telegramId: number, itemId: string, delta: number) {
    const user = await userService.getUserById(telegramId);
    if (!user) return null;

    const cart = await Cart.findOne({ userId: user._id });
    if (!cart) return null;

    const item = cart.items.id(itemId);
    if (!item) return null;

    const newQuantity = (item.quantity || 0) + delta;
    
    // При увеличении количества проверяем доступность
    if (delta > 0) {
      const product = await Product.findById(item.productId);
      if (!product) throw new Error('Товар не найден');
      if (newQuantity > product.quantity) {
        throw new Error(`Недостаточно товара в наличии. Доступно: ${product.quantity} шт.`);
      }
    }

    item.quantity = newQuantity;
    if (item.quantity <= 0) {
      cart.items.pull(itemId);
    }

    cart.updatedAt = new Date();
    await cart.save();
    return cart;
  }

  async removeItem(telegramId: number, itemId: string) {
    const user = await userService.getUserById(telegramId);
    if (!user) return null;

    const cart = await Cart.findOne({ userId: user._id });
    if (!cart) return null;

  const item = cart.items.id(itemId);
  if (!item) return cart;

  cart.items.pull(itemId);
    cart.updatedAt = new Date();
    await cart.save();
    return cart;
  }

  async clearCart(telegramId: number) {
    const user = await userService.getUserById(telegramId);
    if (!user) return null;

    const cart = await Cart.findOne({ userId: user._id });
    if (!cart) return null;

  cart.items.splice(0, cart.items.length);
    cart.updatedAt = new Date();
    await cart.save();
    return cart;
  }

  async getCount(telegramId: number) {
    const cart = await this.getCart(telegramId);
    if (!cart) return 0;
    return cart.items.reduce((s, it) => s + (it.quantity || 0), 0);
  }
}

export default new CartService();
