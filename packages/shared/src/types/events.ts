import type { DeckNotification } from "./notifications";
import type { DeckAction } from "./actions";

export interface ServerToClientEvents {
  "notification:new": (notification: DeckNotification) => void;
  "config:actions": (actions: DeckAction[]) => void;
}

export interface ClientToServerEvents {
  "action:execute": (actionId: string) => void;
}
