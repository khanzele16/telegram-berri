import { IRole } from "./models";

// session
export interface ISessionData {
  menu: IRole | null;
  profile: 'buyer' | 'seller' | null;
}
