import { MyConversation, MyConversationContext } from "../types/bot";
import { getBuyerKeyboard } from "../shared/keyboards";
import buildCartPayload from "./cartViewRenderer";

export async function viewCart(
  conversation: MyConversation,
  ctx: MyConversationContext
) {
  const payload = await buildCartPayload(ctx.from!.id);
  if (payload.isEmpty) {
    const hasSeller = ctx.session?.profile === 'seller';
    await ctx.reply("🛒 Ваша корзина пуста", { reply_markup: getBuyerKeyboard(hasSeller) });
    return;
  }

  await ctx.reply(payload.text, { parse_mode: 'HTML', reply_markup: payload.reply_markup });
}
