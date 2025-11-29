import Shop from '../models/Shop';
import { IShop } from '../../types/models';

class ShopService {
  async createShop(ownerId: number, name: string, description: string, cardNumber?: string) {
    const shop = new Shop({
      ownerId,
      name,
      description,
      cardNumber,
      productsCount: 0,
      salesCount: 0,
      totalRevenue: 0,
      rating: 0,
      reviewsCount: 0,
      isApproved: false,
      isActive: true
    });
    
    await shop.save();
    return shop;
  }

  async getShopById(shopId: string) {
    return await Shop.findById(shopId);
  }

  async getShopByOwnerId(ownerId: number) {
    return await Shop.findOne({ ownerId });
  }

  async updateShop(shopId: string, data: Partial<IShop>) {
    return await Shop.findByIdAndUpdate(shopId, data, { new: true });
  }

  async approveShop(shopId: string) {
    return await Shop.findByIdAndUpdate(
      shopId,
      { isApproved: true },
      { new: true }
    );
  }

  async incrementProducts(shopId: string): Promise<void> {
    await Shop.findByIdAndUpdate(shopId, { $inc: { productsCount: 1 } });
  }

  async incrementProductsCount(shopId: string): Promise<void> {
    await this.incrementProducts(shopId);
  }

  async decrementProducts(shopId: string): Promise<void> {
    await Shop.findByIdAndUpdate(shopId, { $inc: { productsCount: -1 } });
  }

  async incrementSales(shopId: string, amount: number): Promise<void> {
    await Shop.findByIdAndUpdate(shopId, {
      $inc: {
        salesCount: 1,
        totalRevenue: amount
      }
    });
  }

  async searchShops(query: string) {
    return await Shop.find({
      $text: { $search: query },
      isActive: true,
      isApproved: true
    }).limit(20);
  }

  async getAllShops(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    return await Shop.find({ isActive: true, isApproved: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('ownerId', 'firstName lastName username');
  }

  async getPendingShops() {
    return await Shop.find({ isApproved: false, isActive: true })
      .populate('ownerId', 'firstName lastName username phoneNumber');
  }

  async rejectShop(shopId: string) {
    return await Shop.findByIdAndUpdate(
      shopId,
      { isActive: false, isApproved: false },
      { new: true }
    );
  }

  // Модерация изменений
  async submitNameChange(shopId: string, newName: string) {
    return await Shop.findByIdAndUpdate(
      shopId,
      { pendingName: newName },
      { new: true }
    );
  }

  async submitDescriptionChange(shopId: string, newDescription: string) {
    return await Shop.findByIdAndUpdate(
      shopId,
      { pendingDescription: newDescription },
      { new: true }
    );
  }

  async approveNameChange(shopId: string) {
    const shop = await Shop.findById(shopId);
    if (!shop || !shop.pendingName) return null;
    
    shop.name = shop.pendingName;
    shop.set('pendingName', null);
    await shop.save();
    return shop;
  }

  async approveDescriptionChange(shopId: string) {
    const shop = await Shop.findById(shopId);
    if (!shop || !shop.pendingDescription) return null;
    
    shop.description = shop.pendingDescription;
    shop.set('pendingDescription', null);
    await shop.save();
    return shop;
  }

  async rejectNameChange(shopId: string) {
    return await Shop.findByIdAndUpdate(
      shopId,
      { $unset: { pendingName: 1 } },
      { new: true }
    );
  }

  async rejectDescriptionChange(shopId: string) {
    return await Shop.findByIdAndUpdate(
      shopId,
      { $unset: { pendingDescription: 1 } },
      { new: true }
    );
  }
}

export default new ShopService();
