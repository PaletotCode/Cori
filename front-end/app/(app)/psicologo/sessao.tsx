import { Redirect } from "expo-router";

import { useAuthStore } from "../../../src/features/auth/hooks/useAuthStore";
import { resolvePsychologistSessionRedirect } from "../../../src/features/navigation/guards";
import { PsychologistSessionScreen } from "../../../src/features/psychologist/screens/PsychologistSessionScreen";

export default function PsychologistSessionRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolvePsychologistSessionRedirect({
    hydrated,
    status,
    onboardingCompleted,
  });

  if (redirect !== null) {
    return <Redirect href={redirect} />;
  }

  return <PsychologistSessionScreen />;
}
