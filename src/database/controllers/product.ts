import Product from "../models/Product";

class ProductService {
  async approveProduct(productId: string) {
    const product = await Product.findById(productId);
    if (!product) return null;

    product.isApproved = true;
    product.isActive = true;
    await product.save();

    return product;
  }

  async rejectProduct(productId: string) {
    const product = await Product.findById(productId);
    if (!product) return null;

    product.isApproved = false;
    product.isActive = false;
    await product.save();

    return product;
  }

  async getPendingProducts() {
    return await Product.find({ isApproved: false, isActive: false })
      .populate('sellerId', 'firstName lastName username telegramId')
      .populate('shopId', 'name')
      .populate('categoryId', 'name emoji')
      .sort({ createdAt: -1 });
  }

  async getProductById(productId: string) {
    return await Product.findById(productId)
      .populate('sellerId', 'firstName lastName username telegramId')
      .populate('shopId', 'name')
      .populate('categoryId', 'name emoji');
  }
}

export default new ProductService();