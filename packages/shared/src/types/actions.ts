export type ActionType = "url" | "copy" | "command" | "webhook" | "http" | "macro" | "shortcut";

export interface DeckAction {
  id: string;
  label: string;
  icon?: string;
  type: ActionType;
  payload: ActionPayload;
  category?: string;
  color?: string;
  confirm?: boolean;
}

export type ActionPayload =
  | { type: "url"; url: string }
  | { type: "copy"; text: string }
  | { type: "command"; command: string }
  | { type: "webhook"; url: string; method?: string; body?: string }
  | { type: "http"; url: string; method: string; headers?: Record<string, string>; body?: string }
  | { type: "macro"; steps: { actionId: string; delay?: number }[] }
  | { type: "shortcut"; keys: string };
