import { PsychologistLoginScreen } from "../../../features/auth/screens/PsychologistLoginScreen";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

export default function PsychologistLoginRoute() {
  return (
    <ScreenFadeIn>
      <PsychologistLoginScreen />
    </ScreenFadeIn>
  );
}
