import { Redirect } from "expo-router";

import { useAuthStore } from "../../../features/auth/hooks/useAuthStore";
import { resolvePsychologistTriageRedirect } from "../../../features/navigation/guards";
import { PsychologistTriageInvitesScreen } from "../../../features/triage/screens/PsychologistTriageInvitesScreen";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

export default function PsychologistTriageRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolvePsychologistTriageRedirect({
    hydrated,
    status,
    onboardingCompleted,
  });

  if (redirect !== null) {
    return <Redirect href={redirect} />;
  }

  return (
    <ScreenFadeIn>
      <PsychologistTriageInvitesScreen />
    </ScreenFadeIn>
  );
}
