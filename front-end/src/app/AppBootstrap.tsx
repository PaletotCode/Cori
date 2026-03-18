import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuthStore } from "../features/auth/hooks/useAuthStore";
import { authStore } from "../features/auth/store/authStore";
import { realtimeStore } from "../features/realtime/store/realtimeStore";

interface AppBootstrapProps {
  children: React.ReactNode;
}

export function AppBootstrap({ children }: AppBootstrapProps) {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const profile = useAuthStore((state) => state.profile);
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);

  useEffect(() => {
    void authStore.actions.hydrate();
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || accessToken === null || profile === null) {
      realtimeStore.actions.disconnect();
      return;
    }

    realtimeStore.actions.connect({
      accessToken,
      channel: `tenant:${profile.tenantId}`,
    });

    return () => {
      realtimeStore.actions.disconnect();
    };
  }, [status, accessToken, profile]);

  if (!hydrated) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0F4C5C" />
        <Text style={styles.label}>Reidratando sessao...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F4EA",
    gap: 12,
  },
  label: {
    color: "#1D3557",
    fontSize: 15,
    fontWeight: "600",
  },
});
