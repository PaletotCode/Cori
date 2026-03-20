import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useNotificationsStore } from "../../../features/notifications/hooks/useNotificationsStore";
import {
  BottomTabButton,
  BottomTabIcon,
  BottomTabLabel,
} from "../../../shared/ui/BottomNavigation";
import {
  appColors,
  createBottomTabBarStyle,
  navigationTheme,
} from "../../../shared/ui/navigationTheme";

export default function PatientTabsLayout() {
  const insets = useSafeAreaInsets();
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const inboxBadgeCount = unreadCount > 0 ? unreadCount : undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTitleAlign: "left",
        lazy: false,
        headerStyle: navigationTheme.header,
        headerTitleStyle: navigationTheme.headerTitle,
        headerShadowVisible: false,
        tabBarStyle: createBottomTabBarStyle(insets.bottom),
        tabBarItemStyle: [navigationTheme.tabBarItem, styles.tabItem],
        // Regra 5: mantem fundo neutro e uma unica cor de destaque da marca.
        tabBarActiveTintColor: appColors.primary,
        tabBarInactiveTintColor: appColors.textMuted,
        tabBarHideOnKeyboard: true,
        // Regra 9: feedback imediato de toque com ripple + scale sutil.
        tabBarButton: (props) => <BottomTabButton {...props} />,
      }}
    >
      {/* Regra 1: 5 abas principais, sem itens utilitarios/pouco frequentes na barra inferior. */}
      <Tabs.Screen
        name="sessoes"
        options={{
          title: "Sessoes",
          headerTitle: "Sessoes",
          tabBarLabel: ({ focused }) => <BottomTabLabel focused={focused} label="Sessoes" />,
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
        name="atividades"
        options={{
          title: "Atividades",
          headerTitle: "Atividades",
          tabBarLabel: ({ focused }) => <BottomTabLabel focused={focused} label="Ativ." />,
          tabBarIcon: ({ focused }) => (
            <BottomTabIcon
              focused={focused}
              icons={{
                outline: "checkmark-done-outline",
                filled: "checkmark-done",
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="formularios"
        options={{
          title: "Formularios",
          headerTitle: "Formularios",
          tabBarLabel: ({ focused }) => <BottomTabLabel focused={focused} label="Forms" />,
          tabBarIcon: ({ focused }) => (
            <BottomTabIcon
              focused={focused}
              icons={{
                outline: "document-text-outline",
                filled: "document-text",
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          headerTitle: "Inbox de Notificacoes",
          tabBarLabel: ({ focused }) => <BottomTabLabel focused={focused} label="Inbox" />,
          tabBarIcon: ({ focused }) => (
            // Regra 7: badge ligado ao contador de notificacoes nao lidas.
            <BottomTabIcon
              focused={focused}
              badgeCount={inboxBadgeCount}
              icons={{
                outline: "mail-outline",
                filled: "mail",
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="preferencias-notificacao"
        options={{
          title: "Preferencias",
          headerTitle: "Preferencias de Notificacao",
          tabBarLabel: ({ focused }) => <BottomTabLabel focused={focused} label="Ajustes" />,
          tabBarIcon: ({ focused }) => (
            <BottomTabIcon
              focused={focused}
              icons={{
                outline: "settings-outline",
                filled: "settings",
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="convite"
        options={{
          title: "Convite",
          headerTitle: "Convite e Triagem",
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
});
