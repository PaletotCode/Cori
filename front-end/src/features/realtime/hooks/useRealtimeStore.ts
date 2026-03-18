import { useSyncExternalStore } from "react";

import { realtimeStore } from "../store/realtimeStore";

export function useRealtimeStore<TSelected>(
  selector: (state: ReturnType<typeof realtimeStore.getState>) => TSelected,
): TSelected {
  return useSyncExternalStore(
    realtimeStore.subscribe,
    () => selector(realtimeStore.getState()),
    () => selector(realtimeStore.getState()),
  );
}
