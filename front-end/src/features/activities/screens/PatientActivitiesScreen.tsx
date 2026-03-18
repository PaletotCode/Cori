import { Link, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  ActivitiesApiError,
  createActivitiesApiClient,
  type ActivitiesApiClient,
} from "../api/activitiesApiClient";
import type { ActivityItem } from "../api/types";

const activitiesApiClient = createActivitiesApiClient();

interface PatientActivitiesScreenProps {
  apiClient?: ActivitiesApiClient;
}

export function PatientActivitiesScreen({ apiClient = activitiesApiClient }: PatientActivitiesScreenProps) {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const tokenFromQuery = Array.isArray(params.token) ? params.token[0] : params.token;

  const [patientAccessToken, setPatientAccessToken] = useState(tokenFromQuery ?? "");
  const [patientName, setPatientName] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [actingActivityId, setActingActivityId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const hasToken = useMemo(() => patientAccessToken.trim().length >= 20, [patientAccessToken]);

  const loadActivities = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? patientAccessToken).trim();
      if (token.length < 20) {
        setError("Informe um token de atividades valido.");
        return;
      }

      setLoading(true);
      setError(null);
      setInfo(null);
      try {
        const payload = await apiClient.listPublicActivities(token);
        setPatientAccessToken(token);
        setPatientName(payload.patientName);
        setActivities(payload.activities);
        setInfo("Atividades carregadas com sucesso.");
      } catch (requestError) {
        setPatientName(null);
        setActivities([]);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Falha ao carregar atividades do paciente.",
        );
      } finally {
        setLoading(false);
      }
    },
    [apiClient, patientAccessToken],
  );

  useEffect(() => {
    if (tokenFromQuery && tokenFromQuery.length > 0) {
      void loadActivities(tokenFromQuery);
    }
  }, [loadActivities, tokenFromQuery]);

  const handleAction = async (
    activityId: string,
    action: "open" | "start" | "pause" | "complete",
  ) => {
    const token = patientAccessToken.trim();
    if (token.length < 20) {
      setError("Token invalido para executar a atividade.");
      return;
    }

    setActingActivityId(activityId);
    setError(null);
    setInfo(null);
    try {
      const result = await apiClient.applyPublicAction(token, activityId, {
        action,
        feedbackNote: action === "complete" ? feedbackNote.trim() || undefined : undefined,
      });
      setInfo(`Atividade atualizada para status: ${result.activity.status}.`);
      if (action === "complete") {
        setFeedbackNote("");
      }
      await loadActivities(token);
    } catch (requestError) {
      setError(
        requestError instanceof ActivitiesApiError
          ? requestError.message
          : "Falha ao executar acao da atividade.",
      );
    } finally {
      setActingActivityId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>Paciente</Text>
        <Text style={styles.title}>Minhas Atividades</Text>
        <Text style={styles.subtitle}>
          Abra, inicie, pause e conclua atividades recebidas pelo seu psicologo.
        </Text>

        <Text style={styles.label}>Token de atividades</Text>
        <TextInput
          testID="patient-activities-token-input"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setPatientAccessToken}
          placeholder="cole-o-token-aqui"
          placeholderTextColor="#64748B"
          style={styles.input}
          value={patientAccessToken}
        />

        <Pressable
          accessibilityRole="button"
          testID="patient-activities-load"
          disabled={!hasToken || loading}
          onPress={() => void loadActivities()}
          style={[styles.primaryButton, !hasToken || loading ? styles.disabledButton : null]}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? "Carregando..." : "Carregar atividades"}
          </Text>
        </Pressable>

        <Text style={styles.label}>Feedback opcional para conclusao</Text>
        <TextInput
          testID="patient-activities-feedback"
          value={feedbackNote}
          onChangeText={setFeedbackNote}
          placeholder="Como foi executar esta atividade?"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        {patientName ? <Text style={styles.infoLabel}>Paciente: {patientName}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}

        {activities.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma atividade encontrada para este token.</Text>
        ) : (
          activities.map((activity) => {
            const canOpen = !["completed", "canceled"].includes(activity.status);
            const canStart = ["assigned", "opened", "paused", "overdue"].includes(activity.status);
            const canPause = activity.status === "in_progress";
            const canComplete = !["completed", "canceled"].includes(activity.status);

            return (
              <View key={activity.id} style={styles.activityBox}>
                <Text style={styles.activityTitle}>{activity.title}</Text>
                <Text style={styles.activityMeta}>Tipo: {activity.activityType}</Text>
                <Text style={styles.activityMeta}>Status: {activity.status}</Text>
                <Text style={styles.activityMeta}>
                  Prazo: {new Date(activity.dueAt).toLocaleString("pt-BR")}
                </Text>
                <Text style={styles.activityMeta}>
                  Tempo em execucao: {activity.executionElapsedSeconds}s
                </Text>

                <View style={styles.actionsRow}>
                  {canOpen ? (
                    <Pressable
                      accessibilityRole="button"
                      testID={`patient-activity-open-${activity.id}`}
                      disabled={actingActivityId === activity.id}
                      onPress={() => void handleAction(activity.id, "open")}
                      style={[
                        styles.actionButton,
                        styles.actionButtonBlue,
                        actingActivityId === activity.id ? styles.disabledButton : null,
                      ]}
                    >
                      <Text style={styles.actionButtonText}>Abrir</Text>
                    </Pressable>
                  ) : null}

                  {canStart ? (
                    <Pressable
                      accessibilityRole="button"
                      testID={`patient-activity-start-${activity.id}`}
                      disabled={actingActivityId === activity.id}
                      onPress={() => void handleAction(activity.id, "start")}
                      style={[
                        styles.actionButton,
                        styles.actionButtonTeal,
                        actingActivityId === activity.id ? styles.disabledButton : null,
                      ]}
                    >
                      <Text style={styles.actionButtonText}>Iniciar/Retomar</Text>
                    </Pressable>
                  ) : null}

                  {canPause ? (
                    <Pressable
                      accessibilityRole="button"
                      testID={`patient-activity-pause-${activity.id}`}
                      disabled={actingActivityId === activity.id}
                      onPress={() => void handleAction(activity.id, "pause")}
                      style={[
                        styles.actionButton,
                        styles.actionButtonOrange,
                        actingActivityId === activity.id ? styles.disabledButton : null,
                      ]}
                    >
                      <Text style={styles.actionButtonText}>Pausar</Text>
                    </Pressable>
                  ) : null}

                  {canComplete ? (
                    <Pressable
                      accessibilityRole="button"
                      testID={`patient-activity-complete-${activity.id}`}
                      disabled={actingActivityId === activity.id}
                      onPress={() => void handleAction(activity.id, "complete")}
                      style={[
                        styles.actionButton,
                        styles.actionButtonGreen,
                        actingActivityId === activity.id ? styles.disabledButton : null,
                      ]}
                    >
                      <Text style={styles.actionButtonText}>Concluir</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        <Link href="/psicologo/login" style={styles.backLink}>
          <Text style={styles.backLink}>Voltar para login do psicologo</Text>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    backgroundColor: "#F4F7EA",
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  card: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 18,
    gap: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    backgroundColor: "#E0E7FF",
    color: "#1E40AF",
    fontWeight: "700",
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  title: {
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: "#334155",
    fontSize: 14,
  },
  label: {
    color: "#1E293B",
    fontWeight: "600",
    fontSize: 13,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    color: "#0F172A",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: "#1E40AF",
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.55,
  },
  infoLabel: {
    color: "#1E3A8A",
    fontWeight: "700",
    fontSize: 13,
  },
  activityBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    padding: 10,
    gap: 4,
  },
  activityTitle: {
    color: "#1E3A8A",
    fontWeight: "700",
    fontSize: 14,
  },
  activityMeta: {
    color: "#1D4ED8",
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  actionButton: {
    borderRadius: 8,
    backgroundColor: "#334155",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionButtonBlue: {
    backgroundColor: "#2563EB",
  },
  actionButtonTeal: {
    backgroundColor: "#0F766E",
  },
  actionButtonOrange: {
    backgroundColor: "#C2410C",
  },
  actionButtonGreen: {
    backgroundColor: "#15803D",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  emptyText: {
    color: "#475569",
    fontSize: 13,
  },
  errorText: {
    color: "#B91C1C",
    fontWeight: "600",
    fontSize: 12,
  },
  infoText: {
    color: "#1E3A8A",
    fontWeight: "600",
    fontSize: 12,
  },
  backLink: {
    marginTop: 8,
    color: "#0F766E",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
