import { Redirect } from "expo-router";

import { useAuthStore } from "../../../src/features/auth/hooks/useAuthStore";
import { resolvePsychologistSettingsRedirect } from "../../../src/features/navigation/guards";
import { PsychologistPracticeSettingsScreen } from "../../../src/features/practice-profile/screens/PsychologistPracticeSettingsScreen";

export default function PsychologistSettingsRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolvePsychologistSettingsRedirect({
    hydrated,
    status,
    onboardingCompleted,
  });

  if (redirect !== null) {
    return <Redirect href={redirect} />;
  }

  return <PsychologistPracticeSettingsScreen />;
}
