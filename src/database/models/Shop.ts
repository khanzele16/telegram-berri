import { model, Schema } from "mongoose";

const Shop = new Schema(
  {
    ownerId: {
      type: Number,
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    logo: {
      fileId: String,
      type: { type: String, default: 'photo' }
    },
    paymentDetails: String,
    cardNumber: {
      type: String,
      required: false
    },
    
    // Статистика
    productsCount: {
      type: Number,
      default: 0
    },
    salesCount: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    reviewsCount: {
      type: Number,
      default: 0
    },
    
    // Модерация
    isApproved: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    
    // Изменения ожидающие модерации
    pendingName: {
      type: String,
      required: false,
      default: null
    },
    pendingDescription: {
      type: String,
      required: false,
      default: null
    },
    
    // Дополнительно
    categories: [{
      type: Schema.Types.ObjectId,
      ref: "Category"
    }]
  },
  {
    timestamps: true
  }
);

// Индекс для поиска
Shop.index({ name: 'text', description: 'text' });

export default model("Shop", Shop);
