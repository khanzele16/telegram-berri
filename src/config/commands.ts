import { start, pendingShops, statsCommand } from "../handlers/commands";
import { ICommand } from "../types/bot";

export const commands: ICommand[] = [
  { command: "start", description: "Запустить бота", auth: false, admin: false, action: start },
  { command: "pending_shops", description: "Магазины на модерации", auth: true, admin: true, action: pendingShops },
  { command: "stats", description: "Статистика платформы", auth: true, admin: true, action: statsCommand },
];