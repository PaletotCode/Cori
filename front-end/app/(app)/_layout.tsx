import { Redirect, Stack } from "expo-router";

import { useAuthStore } from "../../src/features/auth/hooks/useAuthStore";
import { resolveProtectedRouteRedirect } from "../../src/features/navigation/guards";

export default function ProtectedLayout() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolveProtectedRouteRedirect({
    hydrated,
    status,
    onboardingCompleted,
  });

  if (redirect !== null) {
    return <Redirect href={redirect} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
