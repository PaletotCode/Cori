import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useMemo, useRef, useState, type ComponentProps } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { typographyContract } from "../../../../shared/ui/typography";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

interface FilterChipItem {
  key: string;
  label: string;
  active: boolean;
  icon: IoniconName;
  tintColor: string;
}

interface PatientTimelineFilterChipsProps {
  chips: FilterChipItem[];
  onToggle: (key: string) => void;
  onCheckAll: () => void;
}

export const PatientTimelineFilterChips = memo(function PatientTimelineFilterChips({
  chips,
  onToggle,
  onCheckAll,
}: PatientTimelineFilterChipsProps) {
  const [expanded, setExpanded] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;
  const selectedCount = useMemo(() => chips.filter((chip) => chip.active).length, [chips]);

  const openPanel = useCallback(() => {
    animation.stopAnimation();
    animation.setValue(0);
    setExpanded(true);
    Animated.timing(animation, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [animation]);

  const closePanel = useCallback(() => {
    Animated.timing(animation, {
      toValue: 0,
      duration: 190,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setExpanded(false);
      }
    });
  }, [animation]);

  return (
    <View style={styles.wrap}>
      <View style={styles.triggerRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => (expanded ? closePanel() : openPanel())}
          style={[styles.filterButton, expanded ? styles.filterButtonActive : null]}
        >
          <Ionicons name="funnel-outline" size={17} color="#0F766E" />
          <Text style={styles.filterButtonText}>Filtros ({selectedCount}/{chips.length})</Text>
          <Ionicons
            name={expanded ? "chevron-up-outline" : "chevron-down-outline"}
            size={15}
            color="#0F766E"
          />
        </Pressable>
      </View>

      {expanded ? (
        <Modal
          transparent
          visible={expanded}
          animationType="none"
          onRequestClose={closePanel}
        >
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={closePanel} />
            <Animated.View
              style={[
                styles.panel,
                {
                  opacity: animation,
                  transform: [
                    {
                      translateY: animation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-12, 0],
                      }),
                    },
                    {
                      scale: animation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.96, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Filtros da timeline</Text>
                <View style={styles.panelHeaderActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={onCheckAll}
                    style={styles.checkAllButton}
                  >
                    <Text style={styles.checkAllButtonText}>Check All</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={closePanel} style={styles.panelCloseButton}>
                    <Ionicons name="close" size={16} color="#334155" />
                  </Pressable>
                </View>
              </View>
              {chips.map((chip) => (
                <Pressable
                  key={chip.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: chip.active }}
                  onPress={() => onToggle(chip.key)}
                  style={styles.optionRow}
                >
                  <View style={styles.optionLeft}>
                    <View style={[styles.optionIconWrap, { backgroundColor: `${chip.tintColor}1A` }]}>
                      <Ionicons name={chip.icon} size={15} color={chip.tintColor} />
                    </View>
                    <Text style={styles.optionLabel}>{chip.label}</Text>
                  </View>

                  <View style={[styles.checkbox, chip.active ? styles.checkboxActive : null]}>
                    {chip.active ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
                  </View>
                </Pressable>
              ))}
            </Animated.View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  triggerRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  filterButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterButtonActive: {
    borderColor: "#34D399",
    backgroundColor: "#D1FAE5",
  },
  filterButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#065F46",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  panel: {
    width: "84%",
    maxWidth: 340,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 4,
    shadowColor: "#0F172A",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 7,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 188,
    paddingHorizontal: 14,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.18)",
  },
  panelHeader: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  panelHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  panelTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  checkAllButton: {
    minHeight: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  checkAllButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#1D4ED8",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "700",
  },
  panelCloseButton: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  optionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    borderColor: "#0F766E",
    backgroundColor: "#0F766E",
  },
});
