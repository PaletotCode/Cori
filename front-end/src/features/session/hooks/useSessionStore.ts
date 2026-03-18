import { useSyncExternalStore } from "react";

import { sessionStore } from "../store/sessionStore";

export function useSessionStore<TSelected>(selector: (state: ReturnType<typeof sessionStore.getState>) => TSelected): TSelected {
  return useSyncExternalStore(
    sessionStore.subscribe,
    () => selector(sessionStore.getState()),
    () => selector(sessionStore.getState()),
  );
}
