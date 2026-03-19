import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import { useAuthStore } from "../../features/auth/hooks/useAuthStore";
import { resolveProtectedRouteRedirect } from "../../features/navigation/guards";
import { PsychologistHeaderProfileMenu } from "../../features/psychologist/components/PsychologistHeaderProfileMenu";
import { appColors, navigationTheme } from "../../shared/ui/navigationTheme";
import { screenMotionContract } from "../../shared/ui/screenMotionContract";

function TabIcon({
  focused,
  name,
  accentColor,
}: {
  focused: boolean;
  name: keyof typeof Ionicons.glyphMap;
  accentColor: string;
}) {
  const motionProgress = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const colorProgress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    const motionAnimation = Animated.timing(motionProgress, {
      toValue: focused ? 1 : 0,
      duration: focused
        ? screenMotionContract.tabIconFocusDurationMs
        : screenMotionContract.tabIconBlurDurationMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    const colorAnimation = Animated.timing(colorProgress, {
      toValue: focused ? 1 : 0,
      duration: focused
        ? screenMotionContract.tabIconFocusDurationMs
        : screenMotionContract.tabIconBlurDurationMs,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    });

    motionAnimation.start();
    colorAnimation.start();

    return () => {
      motionAnimation.stop();
      colorAnimation.stop();
    };
  }, [focused, colorProgress, motionProgress]);

  return (
    <Animated.View
      style={[
        styles.iconWrap,
        {
          backgroundColor: colorProgress.interpolate({
            inputRange: [0, 1],
            outputRange: ["rgba(255,255,255,0)", `${accentColor}26`],
          }),
          shadowColor: accentColor,
          shadowOpacity: colorProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.08, 0.2],
          }),
          transform: [
            {
              translateY: motionProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -1.5],
              }),
            },
            {
              scale: motionProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.03],
              }),
            },
          ],
        },
      ]}
    >
      <Animated.View
        style={{
          transform: [
            {
              translateY: motionProgress.interpolate({
                inputRange: [0, 0.65, 1],
                outputRange: [0, -2.5, -1.5],
              }),
            },
            {
              scale: motionProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.04],
              }),
            },
          ],
        }}
      >
        <Ionicons
          name={name}
          size={20}
          color={focused ? accentColor : appColors.textMuted}
          style={styles.iconGlyph}
        />
      </Animated.View>
    </Animated.View>
  );
}

export default function ProtectedLayout() {
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
        headerStyle: navigationTheme.header,
        headerTitleStyle: navigationTheme.headerTitle,
        headerRightContainerStyle: styles.headerRightContainer,
        headerShadowVisible: false,
        tabBarStyle: navigationTheme.tabBar,
        tabBarLabelStyle: navigationTheme.tabBarLabel,
        tabBarItemStyle: [navigationTheme.tabBarItem, styles.tabItem],
        tabBarActiveTintColor: appColors.primary,
        tabBarInactiveTintColor: appColors.textMuted,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="psicologo/sessao"
        options={{
          title: "Painel do Psicologo",
          headerRight: () => <PsychologistHeaderProfileMenu />,
          tabBarLabel: "Painel",
          tabBarActiveTintColor: "#0F766E",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name="home-outline" accentColor="#0F766E" />
          ),
        }}
      />
      <Tabs.Screen
        name="psicologo/agenda"
        options={{
          title: "Agenda Clinica",
          tabBarLabel: "Agenda",
          tabBarActiveTintColor: "#0369A1",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name="calendar-outline" accentColor="#0369A1" />
          ),
        }}
      />
      <Tabs.Screen
        name="psicologo/pacientes"
        options={{
          title: "Gestao de Pacientes",
          tabBarLabel: "Pacientes",
          tabBarActiveTintColor: "#B54708",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name="people-outline" accentColor="#B54708" />
          ),
        }}
      />
      <Tabs.Screen
        name="psicologo/atividades"
        options={{
          title: "Atividades Terapeuticas",
          tabBarLabel: "Ativ.",
          tabBarActiveTintColor: "#4338CA",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name="pulse-outline" accentColor="#4338CA" />
          ),
        }}
      />
      <Tabs.Screen
        name="psicologo/formularios"
        options={{
          title: "Builder de Formularios",
          tabBarLabel: "Forms",
          tabBarActiveTintColor: "#7C3AED",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              name="document-text-outline"
              accentColor="#7C3AED"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="psicologo/timeline"
        options={{
          title: "Timeline e Notificacoes",
          tabBarLabel: "Timeline",
          tabBarActiveTintColor: "#C026D3",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name="time-outline" accentColor="#C026D3" />
          ),
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
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  iconGlyph: {
    textShadowColor: "rgba(15, 23, 42, 0.26)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  hiddenTabBar: {
    display: "none",
  },
  headerRightContainer: {
    paddingRight: 12,
  },
});
