import User from '../models/User';
import { IUser } from '../../types/models';

class UserService {
  async findOrCreate(telegramId: number, userData: { username?: string; first_name?: string; last_name?: string }) {
    let user = await User.findOne({ telegramId });
    
    if (!user) {
      user = new User({
        telegramId,
        username: userData.username,
        firstName: userData.first_name,
        lastName: userData.last_name,
        profiles: {
          buyer: { isActive: true, ordersCount: 0 },
          seller: { isActive: false, isApproved: false, productsCount: 0, salesCount: 0 }
        }
      });
      await user.save();
    } else {
      if (userData.username && user.username !== userData.username) {
        user.username = userData.username;
        await user.save();
      }
    }
    
    return user;
  }

  async getUserById(telegramId: number) {
    return await User.findOne({ telegramId });
  }

  async getUserWithShop(telegramId: number) {
    return await User.findOne({ telegramId }).populate('profiles.seller.shopId');
  }

  async activateBuyer(telegramId: number) {
    const user = await User.findOne({ telegramId });
    if (!user) return null;
    
    user.profiles.buyer.isActive = true;
    await user.save();
    return user;
  }

  async activateSeller(telegramId: number, shopId: string) {
    const user = await User.findOne({ telegramId });
    if (!user) return null;
    
    user.profiles.seller.isActive = true;
    user.profiles.seller.shopId = shopId as unknown as typeof user.profiles.seller.shopId;
    await user.save();
    return user;
  }

  async updatePhoneNumber(telegramId: number, phoneNumber: string) {
    const user = await User.findOne({ telegramId });
    if (!user) return null;
    
    user.phoneNumber = phoneNumber;
    await user.save();
    return user;
  }

  async updateSellerInfo(telegramId: number, data: { shopName?: string; description?: string; paymentDetails?: string }) {
    const user = await User.findOne({ telegramId }).populate('profiles.seller.shopId');
    if (!user || !user.profiles.seller.isActive) return null;
    
    return user;
  }

  async approveSeller(telegramId: number) {
    const user = await User.findOne({ telegramId });
    if (!user) return null;
    
    user.profiles.seller.isApproved = true;
    await user.save();
    return user;
  }

  async incrementOrders(telegramId: number): Promise<void> {
    await User.findOneAndUpdate(
      { telegramId },
      { $inc: { 'profiles.buyer.ordersCount': 1 } }
    );
  }

  async incrementSales(telegramId: number): Promise<void> {
    await User.findOneAndUpdate(
      { telegramId },
      { $inc: { 'profiles.seller.salesCount': 1 } }
    );
  }

  async getPendingSellers() {
    return await User.find({
      'profiles.seller.isActive': true,
      'profiles.seller.isApproved': false
    }).populate('profiles.seller.shopId');
  }

  async getUserByShopId(shopId: string) {
    return await User.findOne({ 'profiles.seller.shopId': shopId });
  }

  isAdmin(telegramId: number): boolean {
    const adminId = process.env.ADMIN_ID;
    return adminId ? telegramId === parseInt(adminId) : false;
  }
}

export default new UserService();
