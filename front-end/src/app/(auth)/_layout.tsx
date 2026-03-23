import { Redirect, Stack } from "expo-router";

import { useAuthStore } from "../../features/auth/hooks/useAuthStore";
import { resolveAuthRouteRedirect } from "../../features/navigation/guards";
import { appColors, navigationTheme } from "../../shared/ui/navigationTheme";
import { screenMotionContract } from "../../shared/ui/screenMotionContract";

export default function AuthLayout() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.role);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolveAuthRouteRedirect({
    hydrated,
    status,
    role,
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
          headerShown: false,
          title: "Acesso Cori",
          headerTitle: "Acesso Cori",
          headerTintColor: appColors.primary,
        }}
      />
    </Stack>
  );
}
