import { Redirect } from "expo-router";

import { useAuthStore } from "../../../features/auth/hooks/useAuthStore";
import { resolvePsychologistSettingsRedirect } from "../../../features/navigation/guards";
import { PsychologistPracticeSettingsScreen } from "../../../features/practice-profile/screens/PsychologistPracticeSettingsScreen";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

export default function PsychologistSettingsRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.role);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolvePsychologistSettingsRedirect({
    hydrated,
    status,
    role,
    onboardingCompleted,
  });

  if (redirect !== null) {
    return <Redirect href={redirect} />;
  }

  return (
    <ScreenFadeIn>
      <PsychologistPracticeSettingsScreen />
    </ScreenFadeIn>
  );
}
