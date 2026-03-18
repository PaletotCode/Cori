import { createStore } from "../../../shared/store/createStore";

export type ActiveArea = "psychologist" | "patient" | null;

export interface SessionState {
  activeArea: ActiveArea;
  patientInviteCode: string | null;
}

const initialSessionState: SessionState = {
  activeArea: null,
  patientInviteCode: null,
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

    setPatientInviteCode(patientInviteCode: string | null): void {
      baseStore.setState((previous) => ({
        ...previous,
        patientInviteCode,
      }));
    },

    clear(): void {
      baseStore.setState(initialSessionState);
    },
  },
};

export type SessionStore = typeof sessionStore;
