import { Redirect } from "expo-router";

import { useAuthStore } from "../../../features/auth/hooks/useAuthStore";
import {
  resolvePsychologistOnboardingRedirect,
  psychologistRoutes,
} from "../../../features/navigation/guards";
import { PsychologistOnboardingScreen } from "../../../features/practice-profile/screens/PsychologistOnboardingScreen";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

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

  return (
    <ScreenFadeIn>
      <PsychologistOnboardingScreen />
    </ScreenFadeIn>
  );
}
