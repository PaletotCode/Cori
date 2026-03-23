import { Redirect } from "expo-router";

import { useAuthStore } from "../../../features/auth/hooks/useAuthStore";
import { resolvePsychologistActivitiesRedirect } from "../../../features/navigation/guards";
import { PsychologistActivitiesScreen } from "../../../features/activities/screens/PsychologistActivitiesScreen";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

export default function PsychologistActivitiesRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.role);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolvePsychologistActivitiesRedirect({
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
      <PsychologistActivitiesScreen />
    </ScreenFadeIn>
  );
}
