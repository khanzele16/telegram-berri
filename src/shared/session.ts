import { ISessionData } from "../types/plugins";

export function initialSessionData(): ISessionData {
  return { 
    menu: null,
    profile: null 
  };
}