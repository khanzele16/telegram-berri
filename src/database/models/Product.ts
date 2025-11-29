import { model, Schema } from "mongoose";

const Product = new Schema(
  {
    shopId: {
      type: Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
      index: true,
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    media: [
      {
        fileId: String,
        mediaType: { type: String, enum: ["photo", "video"], default: "photo" },
      },
    ],
    images: [
      {
        fileId: String,
        type: { type: String, default: "photo" },
      },
    ],
    sizes: [String],
    quantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    location: {
      latitude: Number,
      longitude: Number,
      address: String,
    },
    status: {
      type: String,
      enum: ["available", "out_of_stock", "hidden"],
      default: "available",
    },
    viewsCount: {
      type: Number,
      default: 0,
    },
    ordersCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

Product.index({ name: "text", description: "text" });

export default model("Product", Product);
