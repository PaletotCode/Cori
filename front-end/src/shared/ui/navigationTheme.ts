import { StyleSheet, type ViewStyle } from "react-native";

import { typographyContract } from "./typography";

export const appColors = {
  background: "#F4F7FB",
  surface: "#FFFFFF",
  border: "#DCE6F2",
  text: "#0F172A",
  textMuted: "#64748B",
  primary: "#0F766E",
  danger: "#B42318",
} as const;

export const bottomTabContract = {
  // Regra 1: contrato explícito de quantidade recomendada de abas.
  recommendedTabsMin: 3,
  recommendedTabsMax: 5,
  absoluteTabsMax: 6,
  // Regra 2: tamanhos ergonômicos para toque e leitura mobile.
  minTouchTarget: 44,
  iconSize: 24,
  labelFontSize: 11,
} as const;

const BASE_TAB_BAR_HEIGHT = 60;
const MIN_SAFE_AREA_PADDING = 8;

export function createBottomTabBarStyle(safeAreaBottom: number): ViewStyle {
  // Regra 3: respeita a safe area do home indicator com padding dinâmico.
  const safeBottomPadding = Math.max(safeAreaBottom, MIN_SAFE_AREA_PADDING);

  return {
    height: BASE_TAB_BAR_HEIGHT + safeBottomPadding,
    paddingTop: 6,
    paddingBottom: safeBottomPadding,
    paddingHorizontal: 8,
    backgroundColor: appColors.surface,
    // Regra 8: separação clara do conteúdo com borda/sombra superior suave.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(15, 23, 42, 0.14)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 10,
    elevation: 8,
  };
}

export const navigationTheme = StyleSheet.create({
  sceneContainer: {
    backgroundColor: appColors.background,
  },
  header: {
    backgroundColor: appColors.surface,
    height: 98,
  },
  headerTitle: {
    color: appColors.text,
    fontSize: 19,
    fontWeight: typographyContract.fontWeight,
    fontFamily: typographyContract.fontFamily,
  },
  tabBarLabel: {
    fontSize: bottomTabContract.labelFontSize,
    fontWeight: typographyContract.fontWeight,
    fontFamily: typographyContract.fontFamily,
  },
  tabBarItem: {
    // Regra 2: alvo de toque acima de 44x44 por aba.
    minHeight: bottomTabContract.minTouchTarget + 8,
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
