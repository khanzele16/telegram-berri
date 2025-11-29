import { NextFunction } from "grammy";
import { MyContext } from "../../types/bot";
import User from "../models/User";

export const register = async (
  ctx: MyContext,
  next: NextFunction
): Promise<boolean> => {
  try {
    if (!ctx.from) {
      console.log("Почему-то ctx.from отсутствует");
      return false;
    }
    const isUserExist = await User.findOne({ telegramId: ctx.from.id });
    if (isUserExist) {
      return false;
    }
    const user = new User({
      telegramId: ctx.from.id,
      username: ctx.from.username,
    });
    await user.save();
    return true;
  } catch (err) {
    console.error("❌ Error in user registration:", err);
    throw err;
  }
};

export const registerRole = async (ctx: MyContext) => {
  try {
    if (!ctx.from) {
      console.log("Почему-то ctx.from отсутствует");
      return false;
    }
    const isUserExist = await User.findOne({ telegramId: ctx.from.id });
    return true;
  } catch (err) {
    console.error("❌ Error in user registration:", err);
    throw err;
  }
};
