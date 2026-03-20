import React from "react";

interface NavigationMock {
  isFocused: () => boolean;
  addListener: (_event: string, _listener: () => void) => () => void;
}

export const NavigationContext = React.createContext<NavigationMock | null>({
  isFocused: () => true,
  addListener: (_event: string, _listener: () => void) => {
    void _event;
    void _listener;
    return () => undefined;
  },
});
