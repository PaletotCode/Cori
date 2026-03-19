import { PatientInviteEntryScreen } from "../../../features/auth/screens/PatientInviteEntryScreen";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

export default function PatientInviteRoute() {
  return (
    <ScreenFadeIn>
      <PatientInviteEntryScreen />
    </ScreenFadeIn>
  );
}
