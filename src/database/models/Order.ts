import { model, Schema } from "mongoose";

const Order = new Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true
    },
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    items: [{
      productId: {
        type: Schema.Types.ObjectId,
        ref: "Product"
      },
      sellerId: {
        type: Schema.Types.ObjectId,
        ref: "User"
      },
      name: String,
      price: Number,
      quantity: Number,
      size: String,
      image: String
    }],
    totalAmount: {
      type: Number,
      required: true
    },
    commissionAmount: {
      type: Number,
      required: true
    },
    sellerAmount: {
      type: Number,
      required: true
    },
    commissionPercent: {
      type: Number,
      default: 10
    },
    paymentId: String,
    yookassaPaymentId: String,
    paymentStatus: {
      type: String,
      enum: ['pending', 'waiting_for_capture', 'succeeded', 'canceled'],
      default: 'pending'
    },
    paymentUrl: String,
    paymentMethod: String,
    status: {
      type: String,
      enum: ['pending', 'paid', 'processing', 'completed', 'cancelled'],
      default: 'pending'
    },
    buyerContact: {
      phone: String,
      username: String
    },
    adminApproved: {
      type: Boolean,
      default: false
    },
    approvedAt: Date,
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },
    rejectedAt: Date,
    rejectionReason: String,
    payoutId: String,
    payoutStatus: {
      type: String,
      enum: ['pending', 'succeeded', 'canceled'],
      default: 'pending'
    },
    paidAt: Date,
    completedAt: Date
  },
  {
    timestamps: true
  }
);

export default model("Order", Order);
