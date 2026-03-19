import { PatientSessionsScreen } from "../../../features/sessions/screens/PatientSessionsScreen";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

export default function PatientSessionsRoute() {
  return (
    <ScreenFadeIn>
      <PatientSessionsScreen />
    </ScreenFadeIn>
  );
}
