export type StoreListener = () => void;

export interface StoreApi<TState> {
  getState: () => TState;
  setState: (updater: TState | ((previous: TState) => TState)) => void;
  subscribe: (listener: StoreListener) => () => void;
}

export function createStore<TState>(initialState: TState): StoreApi<TState> {
  let state = initialState;
  const listeners = new Set<StoreListener>();

  const getState = (): TState => state;

  const setState = (updater: TState | ((previous: TState) => TState)): void => {
    const nextState =
      typeof updater === "function"
        ? (updater as (previous: TState) => TState)(state)
        : updater;

    if (Object.is(nextState, state)) {
      return;
    }

    state = nextState;
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: StoreListener): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    getState,
    setState,
    subscribe,
  };
}
