import { Stack } from "expo-router";

import { AppBootstrap } from "../bootstrap/AppBootstrap";
import { screenMotionContract } from "../shared/ui/screenMotionContract";

export default function RootLayout() {
  return (
    <AppBootstrap>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: screenMotionContract.stackAnimation,
        }}
      />
    </AppBootstrap>
  );
}
