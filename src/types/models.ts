import { ObjectId } from "mongoose";

export type IRole = "ADMIN" | "BUYER" | "SELLER";

export interface IShop {
  _id?: ObjectId;
  ownerId: ObjectId;
  name: string;
  description: string;
  logo?: {
    fileId: string;
    type: string;
  };
  paymentDetails?: string;
  productsCount: number;
  salesCount: number;
  totalRevenue: number;
  rating: number;
  reviewsCount: number;
  isApproved: boolean;
  isActive: boolean;
  pendingName?: string | null;
  pendingDescription?: string | null;
  categories: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ISellerProfile {
  isActive: boolean;
  isApproved: boolean;
  shopId?: ObjectId;
  salesCount: number;
}

export interface IBuyerProfile {
  isActive: boolean;
  ordersCount: number;
}

export interface IUser {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  profiles: {
    buyer: IBuyerProfile;
    seller: ISellerProfile;
  };
  isBlocked: boolean;
  createdAt: Date;
}

export interface IMedia {
  fileId: string;
  mediaType: 'photo' | 'video';
}

export interface ICartItem {
  _id: ObjectId;
  productId: ObjectId;
  quantity: number;
  size?: string;
  addedAt: Date;
}

export interface ICart {
  _id: ObjectId;
  userId: ObjectId;
  items: ICartItem[];
  updatedAt: Date;
}

export interface IProduct {
  _id: ObjectId;
  shopId: ObjectId;
  sellerId: ObjectId;
  categoryId: ObjectId;
  name: string;
  description: string;
  price: number;
  media?: IMedia[];
  images?: Array<{ fileId: string; type: string }>;
  sizes?: string[];
  quantity: number;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  status: 'available' | 'out_of_stock' | 'hidden';
  viewsCount: number;
  ordersCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
