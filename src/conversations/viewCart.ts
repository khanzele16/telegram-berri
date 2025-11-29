import { Conversation } from "@grammyjs/conversations";
import { MyContext } from "../types/bot";
import { getBuyerKeyboard } from "../shared/keyboards";
import buildCartPayload from "./cartViewRenderer";

export async function viewCart(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
) {
  const payload = await buildCartPayload(ctx.from!.id);
  if (payload.isEmpty) {
    // Check if session exists and has profile, fallback to false
    const hasSeller = ctx.session?.profile === 'seller';
    await ctx.reply("🛒 Ваша корзина пуста", { reply_markup: getBuyerKeyboard(hasSeller) });
    return;
  }

  // Send one message with all items and inline keyboard
  await ctx.reply(payload.text, { parse_mode: 'HTML', reply_markup: payload.reply_markup });
}
