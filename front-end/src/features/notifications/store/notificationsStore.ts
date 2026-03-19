import { createStore } from "../../../shared/store/createStore";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  tenantId?: string | null;
  patientId?: string | null;
  eventType?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  category?: string | null;
  metadata?: Record<string, unknown> | null;
  read: boolean;
}

export interface NotificationsState {
  items: NotificationItem[];
  unreadCount: number;
}

const initialNotificationsState: NotificationsState = {
  items: [],
  unreadCount: 0,
};

const baseStore = createStore<NotificationsState>(initialNotificationsState);

export const notificationsStore = {
  ...baseStore,
  actions: {
    pushNotification(notification: Omit<NotificationItem, "read">): void {
      baseStore.setState((previous) => {
        const nextItems = [{ ...notification, read: false }, ...previous.items];
        return {
          items: nextItems,
          unreadCount: nextItems.filter((item) => !item.read).length,
        };
      });
    },

    markAllAsRead(): void {
      baseStore.setState((previous) => {
        const nextItems = previous.items.map((item) => ({
          ...item,
          read: true,
        }));

        return {
          items: nextItems,
          unreadCount: 0,
        };
      });
    },

    clear(): void {
      baseStore.setState(initialNotificationsState);
    },
  },
};
