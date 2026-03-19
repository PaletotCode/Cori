import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { PsychologistHeaderProfileMenu } from "../../../psychologist/components/PsychologistHeaderProfileMenu";
import { typographyContract } from "../../../../shared/ui/typography";

import type { AppleCalendarMode, AppleCalendarScope } from "./types";

interface AgendaHeaderActionsProps {
  scope: AppleCalendarScope;
  mode: AppleCalendarMode;
  onToday: () => void;
  onOpenCreate: () => void;
  onToggleScope: () => void;
  onPrev: () => void;
  onNext: () => void;
  onModeChange: (mode: AppleCalendarMode) => void;
}

const modeOptions: Array<{ mode: AppleCalendarMode; label: string }> = [
  { mode: "compact", label: "Compacto" },
  { mode: "stack", label: "Empilhado" },
  { mode: "details", label: "Detalhes" },
  { mode: "list", label: "Lista" },
];

export function AgendaHeaderActions({
  scope,
  mode,
  onToday,
  onOpenCreate,
  onToggleScope,
  onPrev,
  onNext,
  onModeChange,
}: AgendaHeaderActionsProps) {
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" onPress={onToday} style={styles.todayButton}>
        <Text style={styles.todayButtonText}>Hoje</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => setMenuVisible(true)}
        style={styles.iconButton}
      >
        <Ionicons name="options-outline" size={18} color="#334155" />
      </Pressable>

      <Pressable accessibilityRole="button" onPress={onOpenCreate} style={styles.iconButton}>
        <Ionicons name="add-outline" size={20} color="#334155" />
      </Pressable>

      <PsychologistHeaderProfileMenu />

      <Modal animationType="fade" transparent visible={menuVisible} onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)} />
        <View pointerEvents="box-none" style={styles.menuAnchor}>
          <View style={styles.menuCard}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onToggleScope();
                setMenuVisible(false);
              }}
              style={styles.menuItem}
            >
              <Text style={styles.menuItemLabel}>{scope === "year" ? "Trocar para mes" : "Trocar para ano"}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onPrev();
                setMenuVisible(false);
              }}
              style={styles.menuItem}
            >
              <Text style={styles.menuItemLabel}>{scope === "year" ? "Ano anterior" : "Mes anterior"}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onNext();
                setMenuVisible(false);
              }}
              style={styles.menuItem}
            >
              <Text style={styles.menuItemLabel}>{scope === "year" ? "Proximo ano" : "Proximo mes"}</Text>
            </Pressable>

            <View style={styles.divider} />

            {modeOptions.map((option) => (
              <Pressable
                accessibilityRole="button"
                key={option.mode}
                onPress={() => {
                  onModeChange(option.mode);
                  setMenuVisible(false);
                }}
                style={styles.menuItem}
              >
                <Text style={[styles.menuItemLabel, option.mode === mode ? styles.menuItemLabelActive : null]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  todayButton: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  todayButtonText: {
    color: "#334155",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.16)",
  },
  menuAnchor: {
    flex: 1,
    paddingTop: 96,
    paddingHorizontal: 14,
    alignItems: "flex-end",
  },
  menuCard: {
    width: 220,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    shadowColor: "#0F172A",
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 18,
    elevation: 8,
  },
  menuItem: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  menuItemLabel: {
    color: "#334155",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
  menuItemLabelActive: {
    color: "#0369A1",
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
    marginVertical: 4,
  },
});
