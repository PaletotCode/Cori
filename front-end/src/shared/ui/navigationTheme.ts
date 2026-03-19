import { StyleSheet } from "react-native";
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
  tabBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 20,
    borderRadius: 32,
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    borderTopColor: "rgba(255, 255, 255, 0.92)",
    borderTopWidth: 1,
    height: 86,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 24,
    elevation: 14,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: typographyContract.fontWeight,
    fontFamily: typographyContract.fontFamily,
    textShadowColor: "rgba(15, 23, 42, 0.26)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tabBarItem: {
    marginHorizontal: 2,
    marginVertical: 3,
    paddingBottom: 3,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
});
