import { Redirect } from "expo-router";

import { useAuthStore } from "../../../features/auth/hooks/useAuthStore";
import {
  psychologistRoutes,
  resolvePsychologistFormsRedirect,
} from "../../../features/navigation/guards";

export default function PsychologistFormsRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolvePsychologistFormsRedirect({
    hydrated,
    status,
    onboardingCompleted,
  });

  if (redirect !== null) {
    return <Redirect href={redirect} />;
  }

  return <Redirect href={psychologistRoutes.activities} />;
}
