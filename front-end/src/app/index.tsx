import { Redirect } from "expo-router";

import { useAuthStore } from "../features/auth/hooks/useAuthStore";
import { resolveInitialRoute } from "../features/navigation/guards";

export default function IndexRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.role);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const nextRoute = resolveInitialRoute({
    hydrated,
    status,
    role,
    onboardingCompleted,
  });

  return <Redirect href={nextRoute} />;
}
