import { Lora_400Regular, useFonts } from '@expo-google-fonts/lora';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import '../global.css';

import { useColorScheme } from '@/components/useColorScheme';

import { useAuthStore } from '../store/authStore';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(app)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Cori: Lora_400Regular,
    'Cori-Medium': require('@expo-google-fonts/lora/500Medium/Lora_500Medium.ttf'),
    'Cori-SemiBold': require('@expo-google-fonts/lora/600SemiBold/Lora_600SemiBold.ttf'),
    'Cori-Bold': require('@expo-google-fonts/lora/700Bold/Lora_700Bold.ttf'),
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  const { checkAuth } = useAuthStore();

  useEffect(() => {
    // Check local storage for existing session when app mounts
    checkAuth();
  }, []);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { psicologo, isLoading } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';
    const inAppGroup = segments[0] === '(app)';

    if (!psicologo) {
      if (!inAuthGroup) {
        // Redireciona para login de forma impositiva se não estiver logado
        router.replace('/(auth)/login' as any);
      }
    } else {
      // Usuário está logado
      if (!psicologo.onboarding_concluido) {
        if (!inOnboardingGroup) {
          // Bloqueia e força o onboarding
          router.replace('/(onboarding)/wizard' as any);
        }
      } else {
        // Já fez onboarding
        if (!inAppGroup) {
          // Se tentar acessar auth ou onboarding tendo sessão, redireciona para agenda principal
          router.replace('/(app)/agenda' as any);
        }
      }
    }
  }, [psicologo, isLoading, segments]);

  if (isLoading) {
    // We could render an animated splash screen here instead
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
