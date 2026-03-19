import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Modal, Platform, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";

import { useAuthStore } from "../../auth/hooks/useAuthStore";
import { authStore } from "../../auth/store/authStore";
import { psychologistRoutes } from "../../navigation/guards";
import { notificationsStore } from "../../notifications/store/notificationsStore";
import { useRealtimeStore } from "../../realtime/hooks/useRealtimeStore";
import { realtimeStore, type RealtimeConnectionStatus } from "../../realtime/store/realtimeStore";
import { sessionStore } from "../../session/store/sessionStore";

function buildInitials(fullName: string | null | undefined): string {
  if (typeof fullName !== "string" || fullName.trim().length === 0) {
    return "DR";
  }
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return initials.length > 0 ? initials : "DR";
}

function statusLabel(status: RealtimeConnectionStatus): string {
  if (status === "connected") {
    return "Realtime conectado";
  }
  if (status === "connecting" || status === "reconnecting") {
    return "Realtime reconectando";
  }
  if (status === "error") {
    return "Realtime com instabilidade";
  }
  return "Realtime offline";
}

export function PsychologistHeaderProfileMenu() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const realtimeStatus = useRealtimeStore((state) => state.status);
  const [open, setOpen] = useState(false);

  const initials = useMemo(() => buildInitials(profile?.fullName), [profile?.fullName]);

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  const openSettings = useCallback(() => {
    closeMenu();
    router.push(psychologistRoutes.settings);
  }, [closeMenu, router]);

  const pingRealtime = useCallback(() => {
    realtimeStore.actions.sendPing();
    closeMenu();
  }, [closeMenu]);

  const logout = useCallback(async () => {
    closeMenu();
    await authStore.actions.logout();
    sessionStore.actions.clear();
    realtimeStore.actions.clear();
    notificationsStore.actions.clear();
    router.replace("/psicologo/login");
  }, [closeMenu, router]);

  const menuTopOffset = Platform.select({
    ios: 96,
    android: (StatusBar.currentHeight ?? 0) + 56,
    default: 88,
  });

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir menu de perfil"
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.avatarButton, pressed ? styles.avatarButtonPressed : null]}
      >
        <Text style={styles.avatarText}>{initials}</Text>
      </Pressable>

      <Modal animationType="fade" transparent visible={open} onRequestClose={closeMenu}>
        <Pressable style={styles.backdrop} onPress={closeMenu} />
        <View pointerEvents="box-none" style={[styles.menuAnchor, { paddingTop: menuTopOffset }]}>
          <View style={styles.menuCard}>
            <View style={styles.menuHeader}>
              <View style={styles.menuAvatar}>
                <Text style={styles.menuAvatarText}>{initials}</Text>
              </View>
              <View style={styles.menuIdentity}>
                <Text numberOfLines={1} style={styles.menuName}>
                  {profile?.fullName?.trim() || "Psicologa"}
                </Text>
                <Text numberOfLines={1} style={styles.menuStatus}>
                  {statusLabel(realtimeStatus)}
                </Text>
              </View>
            </View>

            <Pressable accessibilityRole="button" onPress={pingRealtime} style={styles.menuItem}>
              <Ionicons name="flash-outline" size={18} color="#334155" />
              <Text style={styles.menuItemText}>Ping Realtime</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={openSettings} style={styles.menuItem}>
              <Ionicons name="settings-outline" size={18} color="#334155" />
              <Text style={styles.menuItemText}>Configuracoes</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void logout()} style={styles.menuItemDanger}>
              <Ionicons name="log-out-outline" size={18} color="#B42318" />
              <Text style={styles.menuItemDangerText}>Encerrar sessao</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginRight: 0,
  },
  avatarButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F766E",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 5,
  },
  avatarButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.14)",
  },
  menuAnchor: {
    flex: 1,
    alignItems: "flex-end",
    paddingHorizontal: 14,
  },
  menuCard: {
    width: 236,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E7EC",
    padding: 12,
    gap: 4,
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 24,
    elevation: 10,
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 8,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F4F7",
  },
  menuAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center",
  },
  menuAvatarText: {
    color: "#027A48",
    fontSize: 12,
    fontWeight: "800",
  },
  menuIdentity: {
    flex: 1,
    gap: 2,
  },
  menuName: {
    color: "#101828",
    fontSize: 13,
    fontWeight: "700",
  },
  menuStatus: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "600",
  },
  menuItem: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  menuItemText: {
    color: "#1D2939",
    fontSize: 13,
    fontWeight: "600",
  },
  menuItemDanger: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3F2",
    marginTop: 2,
  },
  menuItemDangerText: {
    color: "#B42318",
    fontSize: 13,
    fontWeight: "700",
  },
});
