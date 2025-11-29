import { model, Schema } from "mongoose";

const Cart = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    items: [{
      productId: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true
      },
      quantity: {
        type: Number,
        default: 1,
        min: 1
      },
      size: String,
      addedAt: {
        type: Date,
        default: Date.now
      }
    }],
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }
);

export default model("Cart", Cart);
