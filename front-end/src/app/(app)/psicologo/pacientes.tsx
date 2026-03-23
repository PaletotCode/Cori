import { Redirect } from "expo-router";

import { useAuthStore } from "../../../features/auth/hooks/useAuthStore";
import { resolvePsychologistPatientsRedirect } from "../../../features/navigation/guards";
import { PsychologistPatientsScreen } from "../../../features/patients/screens/PsychologistPatientsScreen";

export default function PsychologistPatientsRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.role);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolvePsychologistPatientsRedirect({
    hydrated,
    status,
    role,
    onboardingCompleted,
  });

  if (redirect !== null) {
    return <Redirect href={redirect} />;
  }

  return <PsychologistPatientsScreen />;
}
