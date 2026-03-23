import { Redirect, Tabs } from "expo-router";
import { useCallback, useState } from "react";
import {
  Image,
  type ImageLoadEventData,
  type ImageSourcePropType,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthStore } from "../../features/auth/hooks/useAuthStore";
import { resolveProtectedRouteRedirect } from "../../features/navigation/guards";
import { PsychologistHeaderProfileMenu } from "../../features/psychologist/components/PsychologistHeaderProfileMenu";
import {
  BottomTabButton,
  BottomTabIcon,
  BottomTabLabel,
} from "../../shared/ui/BottomNavigation";
import {
  appColors,
  createBottomTabBarStyle,
  navigationTheme,
} from "../../shared/ui/navigationTheme";

const PSYCHOLOGIST_WALLPAPER_SOURCES: readonly ImageSourcePropType[] = [
  require("../../assets/wallpapers/psychologist-wallpaper.jpeg"),
  require("../../assets/wallpapers/psychologist-wallpaper.jpg"),
  require("../../assets/wallpapers/psychologist-wallpaper.png"),
];

export default function ProtectedLayout() {
  const insets = useSafeAreaInsets();
  const [wallpaperIndex, setWallpaperIndex] = useState<number>(0);
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.role);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);
  const wallpaperSource =
    PSYCHOLOGIST_WALLPAPER_SOURCES[
      Math.min(wallpaperIndex, PSYCHOLOGIST_WALLPAPER_SOURCES.length - 1)
    ];

  const handleWallpaperError = useCallback(() => {
    setWallpaperIndex((current) =>
      current < PSYCHOLOGIST_WALLPAPER_SOURCES.length - 1 ? current + 1 : current,
    );
  }, []);

  const handleWallpaperLoad = useCallback(
    (event: NativeSyntheticEvent<ImageLoadEventData>) => {
      const { width, height } = event.nativeEvent.source;
      setWallpaperIndex((current) => {
        if (current >= PSYCHOLOGIST_WALLPAPER_SOURCES.length - 1) {
          return current;
        }
        // Arquivos placeholder no repositório são 1x1 e servem apenas para manter resolução de módulo.
        // Se detectar 1x1, avança para o próximo formato disponível (.jpeg/.jpg/.png).
        if (width <= 1 || height <= 1) {
          return current + 1;
        }
        return current;
      });
    },
    [],
  );

  const redirect = resolveProtectedRouteRedirect({
    hydrated,
    status,
    role,
    onboardingCompleted,
  });

  if (redirect !== null) {
    return <Redirect href={redirect} />;
  }

  return (
    <View style={styles.layoutRoot}>
      <Image
        source={wallpaperSource}
        resizeMode="cover"
        onLoad={handleWallpaperLoad}
        onError={handleWallpaperError}
        style={styles.wallpaper}
      />
      <View style={styles.wallpaperOverlay} pointerEvents="none" />

      <Tabs
        screenOptions={{
          headerShown: true,
          headerTitleAlign: "left",
          lazy: false,
          sceneStyle: navigationTheme.sceneContainer,
          headerStyle: navigationTheme.header,
          headerTitleStyle: navigationTheme.headerTitle,
          headerRightContainerStyle: styles.headerRightContainer,
          headerShadowVisible: false,
          headerBackground: () => <View style={styles.glassHeaderBackground} />,
          tabBarBackground: () => <View style={styles.glassTabBarBackground} />,
          tabBarStyle: createBottomTabBarStyle(insets.bottom),
          tabBarItemStyle: [navigationTheme.tabBarItem, styles.tabItem],
          // Regra 5: paleta neutra + uma unica cor de destaque da marca (sem cor por aba).
          tabBarActiveTintColor: appColors.primary,
          tabBarInactiveTintColor: appColors.textMuted,
          tabBarHideOnKeyboard: true,
          // Regra 9: feedback imediato de toque com ripple + scale sutil.
          tabBarButton: (props) => <BottomTabButton {...props} />,
        }}
      >
      {/* Regra 1: 5 abas principais (entre 3 e 5). Rotas auxiliares ficam fora da barra com href:null. */}
      <Tabs.Screen
        name="psicologo/sessao"
        options={{
          title: "Painel do Psicologo",
          headerRight: () => <PsychologistHeaderProfileMenu />,
          tabBarLabel: ({ focused }) => <BottomTabLabel focused={focused} label="Painel" />,
          tabBarIcon: ({ focused }) => (
            <BottomTabIcon
              focused={focused}
              icons={{
                outline: "home-outline",
                filled: "home",
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="psicologo/agenda"
        options={{
          title: "Agenda Clinica",
          tabBarLabel: ({ focused }) => <BottomTabLabel focused={focused} label="Agenda" />,
          tabBarIcon: ({ focused }) => (
            <BottomTabIcon
              focused={focused}
              icons={{
                outline: "calendar-outline",
                filled: "calendar",
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="psicologo/pacientes"
        options={{
          title: "Gestao de Pacientes",
          tabBarLabel: ({ focused }) => <BottomTabLabel focused={focused} label="Pacientes" />,
          tabBarIcon: ({ focused }) => (
            <BottomTabIcon
              focused={focused}
              icons={{
                outline: "people-outline",
                filled: "people",
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="psicologo/atividades"
        options={{
          title: "Atividades",
          tabBarLabel: ({ focused }) => <BottomTabLabel focused={focused} label="Atividades" />,
          tabBarIcon: ({ focused }) => (
            <BottomTabIcon
              focused={focused}
              icons={{
                outline: "pulse-outline",
                filled: "pulse",
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="psicologo/formularios"
        options={{
          title: "Builder de Formularios",
          href: null,
        }}
      />
      <Tabs.Screen
        name="psicologo/triagens"
        options={{
          title: "Triagens e Convites",
          href: null,
        }}
      />
      <Tabs.Screen
        name="psicologo/configuracoes"
        options={{
          title: "Configuracoes da Clinica",
          href: null,
        }}
      />
      <Tabs.Screen
        name="psicologo/timeline"
        options={{
          title: "Timeline",
          href: null,
        }}
      />
      <Tabs.Screen
        name="psicologo/onboarding"
        options={{
          headerShown: false,
          href: null,
          tabBarStyle: styles.hiddenTabBar,
        }}
      />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  layoutRoot: {
    flex: 1,
    backgroundColor: "#0B1522",
  },
  wallpaper: {
    ...StyleSheet.absoluteFillObject,
  },
  wallpaperOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8, 18, 28, 0.28)",
  },
  glassHeaderBackground: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.20)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  glassTabBarBackground: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.22)",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
  },
  hiddenTabBar: {
    display: "none",
  },
  headerRightContainer: {
    paddingRight: 12,
  },
});
