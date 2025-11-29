import { model, Schema } from "mongoose";

const Category = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    emoji: {
      type: String,
      required: true
    },
    description: String,
    order: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

export default model("Category", Category);
