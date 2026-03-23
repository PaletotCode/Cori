import { Redirect } from "expo-router";

import { useAuthStore } from "../../../features/auth/hooks/useAuthStore";
import { resolvePsychologistSessionRedirect } from "../../../features/navigation/guards";
import { PsychologistSessionScreen } from "../../../features/psychologist/screens/PsychologistSessionScreen";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

export default function PsychologistSessionRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.role);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolvePsychologistSessionRedirect({
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
      <PsychologistSessionScreen />
    </ScreenFadeIn>
  );
}
