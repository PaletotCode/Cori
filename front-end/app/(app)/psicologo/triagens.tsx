import { Redirect } from "expo-router";

import { useAuthStore } from "../../../src/features/auth/hooks/useAuthStore";
import { resolvePsychologistTriageRedirect } from "../../../src/features/navigation/guards";
import { PsychologistTriageInvitesScreen } from "../../../src/features/triage/screens/PsychologistTriageInvitesScreen";

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

  return <PsychologistTriageInvitesScreen />;
}
