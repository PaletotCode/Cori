import { PatientNotificationPreferencesScreen } from "../../../features/notifications/screens/PatientNotificationPreferencesScreen";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

export default function PatientNotificationPreferencesRoute() {
  return (
    <ScreenFadeIn>
      <PatientNotificationPreferencesScreen />
    </ScreenFadeIn>
  );
}
