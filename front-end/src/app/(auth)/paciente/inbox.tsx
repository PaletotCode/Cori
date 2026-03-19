import { PatientNotificationsInboxScreen } from "../../../features/notifications/screens/PatientNotificationsInboxScreen";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

export default function PatientInboxRoute() {
  return (
    <ScreenFadeIn>
      <PatientNotificationsInboxScreen />
    </ScreenFadeIn>
  );
}
