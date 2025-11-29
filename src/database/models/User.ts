import { model, Schema } from "mongoose";
import { IUser } from "../../types/models";

const BuyerProfile = new Schema(
  {
    isActive: { type: Boolean, default: true },
    ordersCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const SellerProfile = new Schema(
  {
    isActive: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: false },
    shopId: { 
      type: Schema.Types.ObjectId, 
      ref: "Shop" 
    },
    salesCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const User = new Schema<IUser>(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
    },
    username: String,
    firstName: String,
    lastName: String,
    phoneNumber: String,
    profiles: {
      buyer: { type: BuyerProfile, default: () => ({}) },
      seller: { type: SellerProfile, default: () => ({}) },
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Методы
User.methods.activateSeller = function(shopId: string) {
  this.profiles.seller.isActive = true;
  this.profiles.seller.shopId = shopId;
};

User.methods.isSeller = function() {
  return this.profiles.seller.isActive;
};

User.methods.isBuyer = function() {
  return this.profiles.buyer.isActive;
};

export default model<IUser>("User", User);
