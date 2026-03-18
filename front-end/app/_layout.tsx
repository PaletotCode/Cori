import { Stack } from "expo-router";

import { AppBootstrap } from "../src/app/AppBootstrap";

export default function RootLayout() {
  return (
    <AppBootstrap>
      <Stack screenOptions={{ headerShown: false }} />
    </AppBootstrap>
  );
}
