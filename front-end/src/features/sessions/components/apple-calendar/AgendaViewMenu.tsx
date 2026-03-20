import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { typographyContract } from "../../../../shared/ui/typography";

import type { AppleCalendarMode } from "./types";

interface AgendaViewMenuProps {
  visible: boolean;
  activeMode: AppleCalendarMode;
  onClose: () => void;
  onSelectMode: (mode: AppleCalendarMode) => void;
}

const modeOptions: Array<{
  mode: AppleCalendarMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { mode: "stack", label: "Empilhado", icon: "layers-outline" },
  { mode: "details", label: "Detalhes", icon: "albums-outline" },
  { mode: "list", label: "Lista", icon: "list-outline" },
];

export function AgendaViewMenu({ visible, activeMode, onClose, onSelectMode }: AgendaViewMenuProps) {
  if (!visible) {
    return null;
  }

  return (
    <Pressable style={styles.overlay} onPress={onClose}>
      <Pressable
        accessibilityRole="menu"
        style={styles.menuCard}
        onPress={(event) => {
          event.stopPropagation();
        }}
      >
        {modeOptions.map((option, index) => {
          const active = option.mode === activeMode;
          return (
            <Pressable
              accessibilityRole="menuitem"
              key={option.mode}
              onPress={() => {
                onSelectMode(option.mode);
                onClose();
              }}
              style={[styles.itemRow, index > 0 ? styles.itemRowDivider : null]}
            >
              <View style={styles.itemLeft}>
                <Ionicons
                  name={option.icon}
                  size={19}
                  color={active ? "#101828" : "#344054"}
                />
                <Text style={[styles.itemLabel, active ? styles.itemLabelActive : null]}>
                  {option.label}
                </Text>
              </View>
              {active ? <Ionicons name="checkmark" size={22} color="#101828" /> : null}
            </Pressable>
          );
        })}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.08)",
    justifyContent: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 118,
    zIndex: 40,
  },
  menuCard: {
    alignSelf: "flex-end",
    width: 272,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "rgba(246, 247, 250, 0.98)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: "#101828",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 28,
    elevation: 8,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    gap: 10,
  },
  itemRowDivider: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  itemLabel: {
    color: "#344054",
    fontSize: 17,
    lineHeight: 22,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  itemLabelActive: {
    color: "#101828",
  },
});
