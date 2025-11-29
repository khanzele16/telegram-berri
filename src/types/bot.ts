import { SessionFlavor, type Context } from "grammy";
import {
  type Conversation,
  type ConversationFlavor,
} from "@grammyjs/conversations";
import { HydrateFlavor } from "@grammyjs/hydrate";
import { BotCommand } from "grammy/types";
import { ISessionData } from "./plugins";

export interface ICommand extends BotCommand {
  action: (ctx: MyContext) => Promise<void>;
  auth: boolean;
  admin: boolean;
}

export type MyContext = ConversationFlavor<
  Context & HydrateFlavor<Context> & SessionFlavor<ISessionData>
>;
export type MyConversationContext = HydrateFlavor<
  Context & SessionFlavor<ISessionData>
>;
export type MyConversation = Conversation<MyContext, MyConversationContext>;
