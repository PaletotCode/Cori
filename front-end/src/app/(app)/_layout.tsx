import { Redirect, Tabs } from "expo-router";
import { StyleSheet } from "react-native";
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

export default function ProtectedLayout() {
  const insets = useSafeAreaInsets();
  const hydrated = useAuthStore((state) => state.hydrated);
  const status = useAuthStore((state) => state.status);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const redirect = resolveProtectedRouteRedirect({
    hydrated,
    status,
    onboardingCompleted,
  });

  if (redirect !== null) {
    return <Redirect href={redirect} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitleAlign: "left",
        lazy: false,
        headerStyle: navigationTheme.header,
        headerTitleStyle: navigationTheme.headerTitle,
        headerRightContainerStyle: styles.headerRightContainer,
        headerShadowVisible: false,
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
  );
}

const styles = StyleSheet.create({
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
