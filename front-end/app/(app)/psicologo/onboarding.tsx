import { Redirect } from "expo-router";

import { useAuthStore } from "../../../src/features/auth/hooks/useAuthStore";
import {
  resolvePsychologistOnboardingRedirect,
  psychologistRoutes,
} from "../../../src/features/navigation/guards";
import { PsychologistOnboardingScreen } from "../../../src/features/practice-profile/screens/PsychologistOnboardingScreen";

export default function PsychologistOnboardingRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolvePsychologistOnboardingRedirect({
    hydrated,
    status,
    onboardingCompleted,
  });

  if (redirect !== null && redirect !== psychologistRoutes.onboarding) {
    return <Redirect href={redirect} />;
  }

  return <PsychologistOnboardingScreen />;
}
