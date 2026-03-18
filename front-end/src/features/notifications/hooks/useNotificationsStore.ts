import { useSyncExternalStore } from "react";

import { notificationsStore } from "../store/notificationsStore";

export function useNotificationsStore<TSelected>(
  selector: (state: ReturnType<typeof notificationsStore.getState>) => TSelected,
): TSelected {
  return useSyncExternalStore(
    notificationsStore.subscribe,
    () => selector(notificationsStore.getState()),
    () => selector(notificationsStore.getState()),
  );
}
