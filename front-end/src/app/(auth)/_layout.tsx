import { Redirect, Stack } from "expo-router";

import { useAuthStore } from "../../features/auth/hooks/useAuthStore";
import { resolveAuthRouteRedirect } from "../../features/navigation/guards";
import { appColors, navigationTheme } from "../../shared/ui/navigationTheme";
import { screenMotionContract } from "../../shared/ui/screenMotionContract";

export default function AuthLayout() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolveAuthRouteRedirect({
    hydrated,
    status,
    onboardingCompleted,
  });

  if (redirect !== null) {
    return <Redirect href={redirect} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitleAlign: "left",
        headerStyle: navigationTheme.header,
        headerTitleStyle: navigationTheme.headerTitle,
        headerShadowVisible: false,
        contentStyle: navigationTheme.sceneContainer,
        animation: screenMotionContract.stackAnimation,
      }}
    >
      <Stack.Screen
        name="psicologo/login"
        options={{
          title: "Login",
          headerTitle: "Acesso do Psicologo",
          headerTintColor: appColors.primary,
        }}
      />
      <Stack.Screen
        name="paciente"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
