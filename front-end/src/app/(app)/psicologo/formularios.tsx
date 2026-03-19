import { Redirect } from "expo-router";

import { useAuthStore } from "../../../features/auth/hooks/useAuthStore";
import { resolvePsychologistFormsRedirect } from "../../../features/navigation/guards";
import { PsychologistFormsScreen } from "../../../features/forms/screens/PsychologistFormsScreen";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

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

  return (
    <ScreenFadeIn>
      <PsychologistFormsScreen />
    </ScreenFadeIn>
  );
}
