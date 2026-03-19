import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { appColors } from "./navigationTheme";

interface AppModalSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

// Reutilizavel para qualquer modal residual sem quebrar o padrao de espaco visual.
export function AppModalSheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: AppModalSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.dragHandle} />
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>

          <View style={styles.content}>{children}</View>

          <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Fechar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: appColors.surface,
    paddingTop: 12,
    paddingBottom: 28,
    paddingHorizontal: 20, // regra de padding confortavel no padrao iOS
    gap: 16,
  },
  dragHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    marginBottom: 10,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: appColors.text,
  },
  subtitle: {
    fontSize: 14,
    color: appColors.textMuted,
  },
  content: {
    gap: 12,
  },
  closeButton: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appColors.primary,
    minHeight: 48,
  },
  closeButtonText: {
    color: appColors.surface,
    fontSize: 15,
    fontWeight: "700",
  },
});
