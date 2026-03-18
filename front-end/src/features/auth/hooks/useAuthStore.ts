import { useSyncExternalStore } from "react";

import { authStore } from "../store/authStore";

export function useAuthStore<TSelected>(selector: (state: ReturnType<typeof authStore.getState>) => TSelected): TSelected {
  return useSyncExternalStore(
    authStore.subscribe,
    () => selector(authStore.getState()),
    () => selector(authStore.getState()),
  );
}
