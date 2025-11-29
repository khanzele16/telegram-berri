import dotenv from "dotenv";
import mongoose from "mongoose";
import Product from "./src/database/models/Product";

dotenv.config({ path: "src/.env" });

async function approveAllProducts() {
  try {
    await mongoose.connect(process.env.MONGO_URL as string, { dbName: "berriDB" });
    console.log("✅ Подключено к базе данных");

    const result = await Product.updateMany(
      { isApproved: false },
      { 
        $set: { 
          isApproved: true,
          isActive: true 
        } 
      }
    );

    console.log(`✅ Одобрено товаров: ${result.modifiedCount}`);
    
    const totalProducts = await Product.countDocuments();
    const approvedProducts = await Product.countDocuments({ isApproved: true });
    
    console.log(`📊 Всего товаров: ${totalProducts}`);
    console.log(`✅ Одобренных товаров: ${approvedProducts}`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  }
}

approveAllProducts();
