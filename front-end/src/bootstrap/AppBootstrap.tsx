import { Lora_400Regular } from "@expo-google-fonts/lora";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useAuthStore } from "../features/auth/hooks/useAuthStore";
import { InAppNotificationsOverlay } from "../features/notifications/components/InAppNotificationsOverlay";
import { authStore } from "../features/auth/store/authStore";
import { realtimeStore } from "../features/realtime/store/realtimeStore";
import { applyGlobalTypographyContract } from "../shared/ui/typography";

interface AppBootstrapProps {
  children: React.ReactNode;
}

export function AppBootstrap({ children }: AppBootstrapProps) {
  const [fontsLoaded] = useFonts({
    Lora_400Regular,
  });
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const profile = useAuthStore((state) => state.profile);
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);

  useEffect(() => {
    if (fontsLoaded) {
      applyGlobalTypographyContract();
    }
  }, [fontsLoaded]);

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

  if (!fontsLoaded || !hydrated) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0F4C5C" />
        <Text style={styles.label}>{fontsLoaded ? "Reidratando sessao..." : "Carregando fontes..."}</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.appRoot}>
        {children}
        <InAppNotificationsOverlay />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
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
