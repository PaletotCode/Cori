import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuthStore } from "../../auth/hooks/useAuthStore";
import { authStore } from "../../auth/store/authStore";
import { psychologistRoutes } from "../../navigation/guards";
import { useNotificationsStore } from "../../notifications/hooks/useNotificationsStore";
import { notificationsStore } from "../../notifications/store/notificationsStore";
import { useRealtimeStore } from "../../realtime/hooks/useRealtimeStore";
import { realtimeStore } from "../../realtime/store/realtimeStore";
import { sessionStore } from "../../session/store/sessionStore";

export function PsychologistSessionScreen() {
  const router = useRouter();

  const profile = useAuthStore((state) => state.profile);
  const connectionStatus = useRealtimeStore((state) => state.status);
  const channel = useRealtimeStore((state) => state.channel);
  const unreadCount = useNotificationsStore((state) => state.unreadCount);

  const handleLogout = async () => {
    await authStore.actions.logout();
    sessionStore.actions.clear();
    realtimeStore.actions.clear();
    notificationsStore.actions.clear();
    router.replace("/psicologo/login");
  };

  const handlePing = () => {
    realtimeStore.actions.sendPing();
  };

  const handleOpenSettings = () => {
    router.push(psychologistRoutes.settings);
  };

  const handleOpenTriages = () => {
    router.push(psychologistRoutes.triage);
  };

  const handleOpenPatients = () => {
    router.push(psychologistRoutes.patients);
  };

  const handleOpenAgenda = () => {
    router.push(psychologistRoutes.agenda);
  };

  const handleOpenActivities = () => {
    router.push(psychologistRoutes.activities);
  };

  const handleOpenForms = () => {
    router.push(psychologistRoutes.forms);
  };

  const handleOpenTimeline = () => {
    router.push(psychologistRoutes.timeline);
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>Sessao ativa</Text>
        <Text style={styles.title}>Area Psicologo</Text>

        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Usuario</Text>
          <Text style={styles.infoValue}>{profile?.fullName ?? "-"}</Text>
        </View>

        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Tenant</Text>
          <Text style={styles.infoValue}>{profile?.tenantId ?? "-"}</Text>
        </View>

        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Realtime</Text>
          <Text style={styles.infoValue}>
            {connectionStatus}
            {channel ? ` (${channel})` : ""}
          </Text>
        </View>

        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Notificacoes nao lidas</Text>
          <Text style={styles.infoValue}>{unreadCount}</Text>
        </View>

        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Onboarding concluido</Text>
          <Text style={styles.infoValue}>{profile?.onboardingCompleted ? "Sim" : "Nao"}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={handleOpenAgenda}
            style={styles.primaryButtonAgenda}
          >
            <Text style={styles.primaryButtonText}>Abrir agenda e sessoes</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={handleOpenActivities}
            style={styles.primaryButtonActivities}
          >
            <Text style={styles.primaryButtonText}>Abrir central de atividades</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={handleOpenForms}
            style={styles.primaryButtonForms}
          >
            <Text style={styles.primaryButtonText}>Abrir central de formularios</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={handleOpenTimeline}
            style={styles.primaryButtonTimeline}
          >
            <Text style={styles.primaryButtonText}>Abrir timeline unificada</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={handleOpenPatients}
            style={styles.primaryButtonPatients}
          >
            <Text style={styles.primaryButtonText}>Abrir gestao de pacientes</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={handleOpenTriages}
            style={styles.primaryButtonAlt}
          >
            <Text style={styles.primaryButtonText}>Abrir triagem e convites</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={handleOpenSettings}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Editar configuracoes da clinica</Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={handlePing} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Testar ping realtime</Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={handleLogout} style={styles.dangerButton}>
            <Text style={styles.dangerButtonText}>Encerrar sessao</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#ECF8F5",
    paddingHorizontal: 18,
  },
  card: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 20,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: 10,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: "#065F46",
    fontWeight: "700",
    fontSize: 12,
  },
  title: {
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "800",
  },
  infoBlock: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 10,
  },
  infoLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
  },
  infoValue: {
    color: "#1E293B",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
  actions: {
    marginTop: 6,
    gap: 8,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: "#166534",
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonAlt: {
    borderRadius: 10,
    backgroundColor: "#1D4ED8",
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonPatients: {
    borderRadius: 10,
    backgroundColor: "#EA580C",
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonAgenda: {
    borderRadius: 10,
    backgroundColor: "#7C2D12",
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonActivities: {
    borderRadius: 10,
    backgroundColor: "#1E40AF",
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonForms: {
    borderRadius: 10,
    backgroundColor: "#4338CA",
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonTimeline: {
    borderRadius: 10,
    backgroundColor: "#0E7490",
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  secondaryButton: {
    borderRadius: 10,
    backgroundColor: "#0E7490",
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  dangerButton: {
    borderRadius: 10,
    backgroundColor: "#B91C1C",
    paddingVertical: 12,
    alignItems: "center",
  },
  dangerButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
});
