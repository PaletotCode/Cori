import { Redirect } from "expo-router";

import { useAuthStore } from "../../../src/features/auth/hooks/useAuthStore";
import { resolvePsychologistAgendaRedirect } from "../../../src/features/navigation/guards";
import { PsychologistAgendaScreen } from "../../../src/features/sessions/screens/PsychologistAgendaScreen";

export default function PsychologistAgendaRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolvePsychologistAgendaRedirect({
    hydrated,
    status,
    onboardingCompleted,
  });

  if (redirect !== null) {
    return <Redirect href={redirect} />;
  }

  return <PsychologistAgendaScreen />;
}
