import { Redirect } from "expo-router";

import { useAuthStore } from "../src/features/auth/hooks/useAuthStore";
import { resolveInitialRoute } from "../src/features/navigation/guards";

export default function IndexRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const nextRoute = resolveInitialRoute({
    hydrated,
    status,
    onboardingCompleted,
  });

  return <Redirect href={nextRoute} />;
}
