import { PatientActivitiesScreen } from "../../../features/activities/screens/PatientActivitiesScreen";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

export default function PatientActivitiesRoute() {
  return (
    <ScreenFadeIn>
      <PatientActivitiesScreen />
    </ScreenFadeIn>
  );
}
