import { IRole } from "./models";

export interface ISessionData {
  menu: IRole | null;
  profile: 'buyer' | 'seller' | null;
}
