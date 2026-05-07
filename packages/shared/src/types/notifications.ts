export type NotificationLevel = "info" | "success" | "warning" | "error";

export interface DeckNotification {
  id: string;
  title: string;
  message?: string;
  level: NotificationLevel;
  timestamp: number;
  source?: string;
  read: boolean;
}
