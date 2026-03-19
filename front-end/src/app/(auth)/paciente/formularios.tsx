import { PatientFormsScreen } from "../../../features/forms/screens/PatientFormsScreen";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

export default function PatientFormsRoute() {
  return (
    <ScreenFadeIn>
      <PatientFormsScreen />
    </ScreenFadeIn>
  );
}
