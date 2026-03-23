import { createStore } from "../../../shared/store/createStore";

export type ActiveArea = "psychologist" | null;

export interface SessionState {
  activeArea: ActiveArea;
}

const initialSessionState: SessionState = {
  activeArea: null,
};

const baseStore = createStore<SessionState>(initialSessionState);

export const sessionStore = {
  ...baseStore,
  actions: {
    setActiveArea(activeArea: ActiveArea): void {
      baseStore.setState((previous) => ({
        ...previous,
        activeArea,
      }));
    },

    clear(): void {
      baseStore.setState(initialSessionState);
    },
  },
};

export type SessionStore = typeof sessionStore;
