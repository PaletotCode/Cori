import { Redirect } from "expo-router";

import { useAuthStore } from "../../../src/features/auth/hooks/useAuthStore";
import {
  resolvePsychologistTimelineRedirect,
} from "../../../src/features/navigation/guards";
import { PsychologistTimelineScreen } from "../../../src/features/notifications/screens/PsychologistTimelineScreen";

export default function PsychologistTimelineRoute() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolvePsychologistTimelineRedirect({
    hydrated,
    status,
    onboardingCompleted,
  });

  if (redirect !== null) {
    return <Redirect href={redirect} />;
  }

  return <PsychologistTimelineScreen />;
}

