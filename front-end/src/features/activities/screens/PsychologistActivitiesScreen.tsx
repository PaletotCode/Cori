import { Link } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuthStore } from "../../auth/hooks/useAuthStore";
import {
  ActivitiesApiError,
  createActivitiesApiClient,
  type ActivitiesApiClient,
} from "../api/activitiesApiClient";
import type {
  ActivityCreatePayload,
  ActivityDetail,
  ActivityItem,
  ActivityTimelineEvent,
  ActivityType,
} from "../api/types";
import {
  createPatientsApiClient,
  type PatientsApiClient,
} from "../../patients/api/patientsApiClient";
import type { PatientListItem } from "../../patients/api/types";

const activitiesApiClient = createActivitiesApiClient();
const patientsApiClient = createPatientsApiClient();

interface PsychologistActivitiesScreenProps {
  apiClient?: ActivitiesApiClient;
  patientsClient?: PatientsApiClient;
}

const ACTIVITY_TYPE_OPTIONS: Array<{ label: string; value: ActivityType }> = [
  { label: "Tarefa simples", value: "simple_task" },
  { label: "Meditacao guiada", value: "guided_meditation" },
  { label: "Habito", value: "habit" },
  { label: "Leitura/documento", value: "document_reading" },
];

const RECURRENCE_OPTIONS: Array<{ label: string; value: "none" | "daily" | "weekly" }> = [
  { label: "Sem recorrencia", value: "none" },
  { label: "Diaria", value: "daily" },
  { label: "Semanal", value: "weekly" },
];

function defaultDueAt(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

export function PsychologistActivitiesScreen({
  apiClient = activitiesApiClient,
  patientsClient = patientsApiClient,
}: PsychologistActivitiesScreenProps) {
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);

  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [timeline, setTimeline] = useState<ActivityTimelineEvent[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);

  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("simple_task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueAt());
  const [recurrenceRule, setRecurrenceRule] = useState<"none" | "daily" | "weekly">("none");
  const [recurrenceInterval, setRecurrenceInterval] = useState("1");

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [lastAccessLink, setLastAccessLink] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      accessToken !== null &&
      selectedPatientId.trim().length > 0 &&
      title.trim().length >= 3 &&
      dueAt.trim().length >= 10
    );
  }, [accessToken, dueAt, selectedPatientId, title]);

  const resetForm = useCallback(() => {
    setEditingActivityId(null);
    setActivityType("simple_task");
    setTitle("");
    setDescription("");
    setInstructions("");
    setDocumentUrl("");
    setDueAt(defaultDueAt());
    setRecurrenceRule("none");
    setRecurrenceInterval("1");
  }, []);

  const loadActivities = useCallback(async () => {
    if (accessToken === null) {
      return;
    }
    const nextActivities = await apiClient.listActivities(accessToken);
    setActivities(nextActivities);
  }, [accessToken, apiClient]);

  const loadTimeline = useCallback(
    async (activityId: string) => {
      if (accessToken === null) return;
      const events = await apiClient.listTimelineEvents(accessToken, activityId, 200);
      setTimeline(events);
    },
    [accessToken, apiClient],
  );

  const loadInitialData = useCallback(async () => {
    if (accessToken === null) {
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const [patientsList, activitiesList] = await Promise.all([
        patientsClient.list(accessToken),
        apiClient.listActivities(accessToken),
      ]);
      setPatients(patientsList);
      setActivities(activitiesList);
      if (patientsList.length > 0 && selectedPatientId.trim().length === 0) {
        setSelectedPatientId(patientsList[0].id);
      }
      setInfo("Central de atividades carregada.");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Falha ao carregar atividades.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, apiClient, patientsClient, selectedPatientId]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const mapFormToPayload = (): ActivityCreatePayload => {
    const payload: ActivityCreatePayload = {
      patientId: selectedPatientId.trim(),
      activityType,
      title: title.trim(),
      dueAt: dueAt.trim(),
      recurrenceRule,
      recurrenceInterval: Number.isFinite(Number(recurrenceInterval))
        ? Math.max(1, Number.parseInt(recurrenceInterval, 10))
        : 1,
    };
    if (description.trim().length > 0) payload.description = description.trim();
    if (instructions.trim().length > 0) payload.instructions = instructions.trim();
    if (documentUrl.trim().length > 0) payload.documentUrl = documentUrl.trim();
    return payload;
  };

  const populateFormFromDetail = (detail: ActivityDetail) => {
    setEditingActivityId(detail.id);
    setSelectedPatientId(detail.patientId);
    setActivityType(detail.activityType);
    setTitle(detail.title);
    setDescription(detail.description ?? "");
    setInstructions(detail.instructions ?? "");
    setDocumentUrl(detail.documentUrl ?? "");
    setDueAt(detail.dueAt);
    setRecurrenceRule(detail.recurrenceRule);
    setRecurrenceInterval(String(detail.recurrenceInterval));
  };

  const handleCreateOrUpdate = async () => {
    if (accessToken === null || !canSubmit) {
      setError("Preencha paciente, titulo e prazo para salvar a atividade.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      if (editingActivityId === null) {
        const created = await apiClient.createActivity(accessToken, mapFormToPayload());
        setInfo("Atividade criada e atribuida com sucesso.");
        setLastAccessLink(created.patientAccessLink);
        setSelectedActivityId(created.id);
        await Promise.all([loadActivities(), loadTimeline(created.id)]);
        resetForm();
      } else {
        const updated = await apiClient.updateActivity(accessToken, editingActivityId, {
          activityType,
          title: title.trim(),
          description: description.trim() || undefined,
          instructions: instructions.trim() || undefined,
          documentUrl: documentUrl.trim() || undefined,
          dueAt: dueAt.trim(),
          recurrenceRule,
          recurrenceInterval: Number.parseInt(recurrenceInterval, 10) || 1,
        });
        setInfo("Atividade editada com sucesso.");
        setSelectedActivityId(updated.id);
        await Promise.all([loadActivities(), loadTimeline(updated.id)]);
        resetForm();
      }
    } catch (requestError) {
      setError(
        requestError instanceof ActivitiesApiError
          ? requestError.message
          : "Falha ao salvar atividade.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (activityId: string) => {
    if (accessToken === null) {
      return;
    }
    setActioningId(activityId);
    setError(null);
    try {
      const detail = await apiClient.getActivity(accessToken, activityId);
      populateFormFromDetail(detail);
      setSelectedActivityId(activityId);
      await loadTimeline(activityId);
      setInfo("Modo de edicao ativado.");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Falha ao carregar atividade.",
      );
    } finally {
      setActioningId(null);
    }
  };

  const handlePsychologistAction = async (
    activityId: string,
    action: "resend" | "cancel" | "reopen",
  ) => {
    if (accessToken === null) {
      return;
    }
    setActioningId(activityId);
    setError(null);
    setInfo(null);
    try {
      const response = await apiClient.applyPsychologistAction(accessToken, activityId, {
        action,
      });
      setSelectedActivityId(response.id);
      await Promise.all([loadActivities(), loadTimeline(activityId)]);
      const labels = {
        resend: "Atividade reenviada.",
        cancel: "Atividade cancelada.",
        reopen: "Atividade reaberta.",
      } as const;
      setInfo(labels[action]);
    } catch (requestError) {
      setError(
        requestError instanceof ActivitiesApiError
          ? requestError.message
          : "Falha ao aplicar acao na atividade.",
      );
    } finally {
      setActioningId(null);
    }
  };

  const handleRunOverdue = async () => {
    if (accessToken === null) return;
    setError(null);
    setInfo(null);
    try {
      const result = await apiClient.runOverdueScheduler(accessToken);
      setInfo(
        `Scheduler overdue executado. Processadas: ${result.processed}. Atrasadas: ${result.markedOverdue}.`,
      );
      await loadActivities();
      if (selectedActivityId) {
        await loadTimeline(selectedActivityId);
      }
    } catch (requestError) {
      setError(
        requestError instanceof ActivitiesApiError
          ? requestError.message
          : "Falha ao rodar scheduler de overdue.",
      );
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>Psicologo</Text>
        <Text style={styles.title}>Central de Atividades</Text>
        <Text style={styles.subtitle}>
          Crie atividades, atribua por paciente e acompanhe a execucao pela timeline.
        </Text>

        <Text style={styles.sectionTitle}>Criar / editar atividade</Text>
        <Text style={styles.label}>Paciente</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.patientChips}>
          {patients.map((patient) => (
            <Pressable
              key={patient.id}
              testID={`activities-form-patient-${patient.id}`}
              accessibilityRole="button"
              onPress={() => setSelectedPatientId(patient.id)}
              style={[
                styles.patientChip,
                selectedPatientId === patient.id ? styles.patientChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.patientChipText,
                  selectedPatientId === patient.id ? styles.patientChipTextActive : null,
                ]}
              >
                {patient.fullName}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>Tipo</Text>
        <View style={styles.optionsRow}>
          {ACTIVITY_TYPE_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              onPress={() => setActivityType(option.value)}
              style={[
                styles.optionButton,
                activityType === option.value ? styles.optionButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  activityType === option.value ? styles.optionButtonTextActive : null,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Titulo</Text>
        <TextInput
          testID="activities-form-title"
          value={title}
          onChangeText={setTitle}
          placeholder="Ex: Respiracao 4-7-8"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <Text style={styles.label}>Descricao</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Contexto clinico da atividade"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <Text style={styles.label}>Instrucoes</Text>
        <TextInput
          value={instructions}
          onChangeText={setInstructions}
          placeholder="Passo a passo para o paciente"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <Text style={styles.label}>Documento URL (opcional)</Text>
        <TextInput
          value={documentUrl}
          autoCapitalize="none"
          onChangeText={setDocumentUrl}
          placeholder="https://..."
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <Text style={styles.label}>Prazo (ISO)</Text>
        <TextInput
          testID="activities-form-due-at"
          autoCapitalize="none"
          value={dueAt}
          onChangeText={setDueAt}
          placeholder="2026-03-20T14:00:00Z"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <Text style={styles.label}>Recorrencia</Text>
        <View style={styles.optionsRow}>
          {RECURRENCE_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              onPress={() => setRecurrenceRule(option.value)}
              style={[
                styles.optionButton,
                recurrenceRule === option.value ? styles.optionButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  recurrenceRule === option.value ? styles.optionButtonTextActive : null,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {recurrenceRule !== "none" ? (
          <>
            <Text style={styles.label}>Intervalo</Text>
            <TextInput
              value={recurrenceInterval}
              onChangeText={setRecurrenceInterval}
              keyboardType="numeric"
              style={styles.input}
            />
          </>
        ) : null}

        <Pressable
          accessibilityRole="button"
          testID="activities-create-submit"
          disabled={!canSubmit || submitting}
          onPress={() => void handleCreateOrUpdate()}
          style={[styles.primaryButton, !canSubmit || submitting ? styles.disabledButton : null]}
        >
          <Text style={styles.primaryButtonText}>
            {submitting
              ? "Salvando..."
              : editingActivityId
                ? "Salvar edicao de atividade"
                : "Criar e atribuir atividade"}
          </Text>
        </Pressable>

        {editingActivityId ? (
          <Pressable
            accessibilityRole="button"
            onPress={resetForm}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Cancelar edicao</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          testID="activities-run-overdue"
          onPress={() => void handleRunOverdue()}
          style={styles.tertiaryButton}
        >
          <Text style={styles.tertiaryButtonText}>Rodar scheduler de overdue</Text>
        </Pressable>

        {loading ? <Text style={styles.infoText}>Carregando dados...</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}
        {lastAccessLink ? (
          <Text style={styles.linkInfoText}>Link do paciente: {lastAccessLink}</Text>
        ) : null}

        <Text style={styles.sectionTitle}>Central de atividades</Text>
        {activities.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma atividade cadastrada.</Text>
        ) : (
          activities.map((activity) => (
            <View key={activity.id} testID={`activity-item-${activity.id}`} style={styles.activityBox}>
              <Text style={styles.activityTitle}>{activity.title}</Text>
              <Text style={styles.activityMeta}>Paciente: {activity.patientName}</Text>
              <Text style={styles.activityMeta}>Tipo: {activity.activityType}</Text>
              <Text style={styles.activityMeta}>Status: {activity.status}</Text>
              <Text style={styles.activityMeta}>
                Prazo: {new Date(activity.dueAt).toLocaleString("pt-BR")}
              </Text>
              <Text style={styles.activityMeta}>
                Tempo em execucao: {activity.executionElapsedSeconds}s
              </Text>

              <View style={styles.actionsRow}>
                <Pressable
                  accessibilityRole="button"
                  testID={`activity-action-edit-${activity.id}`}
                  disabled={actioningId === activity.id}
                  onPress={() => void handleEdit(activity.id)}
                  style={[styles.actionButton, actioningId === activity.id ? styles.disabledButton : null]}
                >
                  <Text style={styles.actionButtonText}>Editar</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  testID={`activity-action-resend-${activity.id}`}
                  disabled={actioningId === activity.id}
                  onPress={() => void handlePsychologistAction(activity.id, "resend")}
                  style={[
                    styles.actionButton,
                    styles.actionButtonBlue,
                    actioningId === activity.id ? styles.disabledButton : null,
                  ]}
                >
                  <Text style={styles.actionButtonText}>Reenviar</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  testID={`activity-action-cancel-${activity.id}`}
                  disabled={actioningId === activity.id}
                  onPress={() => void handlePsychologistAction(activity.id, "cancel")}
                  style={[
                    styles.actionButton,
                    styles.actionButtonRed,
                    actioningId === activity.id ? styles.disabledButton : null,
                  ]}
                >
                  <Text style={styles.actionButtonText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  testID={`activity-action-reopen-${activity.id}`}
                  disabled={actioningId === activity.id}
                  onPress={() => void handlePsychologistAction(activity.id, "reopen")}
                  style={[
                    styles.actionButton,
                    styles.actionButtonTeal,
                    actioningId === activity.id ? styles.disabledButton : null,
                  ]}
                >
                  <Text style={styles.actionButtonText}>Reabrir</Text>
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSelectedActivityId(activity.id);
                  void loadTimeline(activity.id);
                }}
                style={styles.timelineButton}
              >
                <Text style={styles.timelineButtonText}>Ver timeline desta atividade</Text>
              </Pressable>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Timeline de atividade</Text>
        {selectedActivityId === null ? (
          <Text style={styles.emptyText}>Selecione uma atividade para ver os eventos.</Text>
        ) : timeline.length === 0 ? (
          <Text style={styles.emptyText}>Sem eventos para a atividade selecionada.</Text>
        ) : (
          timeline.map((event) => (
            <View key={event.id} style={styles.timelineEntry}>
              <Text style={styles.timelineType}>{event.eventType}</Text>
              <Text style={styles.timelineMeta}>
                {new Date(event.createdAt).toLocaleString("pt-BR")} | ator: {event.actorType}
              </Text>
            </View>
          ))
        )}

        <Link href="/psicologo/sessao" style={styles.backLink}>
          <Text style={styles.backLink}>Voltar para sessao do psicologo</Text>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 14,
    paddingVertical: 20,
  },
  card: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 16,
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
    backgroundColor: "#DBEAFE",
    color: "#1D4ED8",
    fontWeight: "700",
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  title: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: "#374151",
    fontSize: 13,
  },
  sectionTitle: {
    marginTop: 8,
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "800",
  },
  label: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  patientChips: {
    maxHeight: 44,
  },
  patientChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  patientChipActive: {
    borderColor: "#1D4ED8",
    backgroundColor: "#DBEAFE",
  },
  patientChipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
  },
  patientChipTextActive: {
    color: "#1D4ED8",
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#F8FAFC",
  },
  optionButtonActive: {
    borderColor: "#0F766E",
    backgroundColor: "#CCFBF1",
  },
  optionButtonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
  },
  optionButtonTextActive: {
    color: "#0F766E",
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
    backgroundColor: "#1D4ED8",
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
    backgroundColor: "#0F766E",
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  tertiaryButton: {
    borderRadius: 10,
    backgroundColor: "#7C2D12",
    paddingVertical: 10,
    alignItems: "center",
  },
  tertiaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  disabledButton: {
    opacity: 0.55,
  },
  infoText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "600",
  },
  linkInfoText: {
    color: "#0E7490",
    fontSize: 12,
    fontWeight: "600",
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 13,
  },
  activityBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    backgroundColor: "#EEF2FF",
    padding: 10,
    gap: 4,
  },
  activityTitle: {
    color: "#1E3A8A",
    fontSize: 14,
    fontWeight: "700",
  },
  activityMeta: {
    color: "#1E40AF",
    fontSize: 12,
  },
  actionsRow: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  actionButton: {
    borderRadius: 8,
    backgroundColor: "#0F766E",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionButtonBlue: {
    backgroundColor: "#2563EB",
  },
  actionButtonRed: {
    backgroundColor: "#B91C1C",
  },
  actionButtonTeal: {
    backgroundColor: "#0E7490",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  timelineButton: {
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1D4ED8",
    paddingVertical: 8,
    alignItems: "center",
  },
  timelineButtonText: {
    color: "#1D4ED8",
    fontWeight: "700",
    fontSize: 12,
  },
  timelineEntry: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 8,
    backgroundColor: "#F8FAFC",
  },
  timelineType: {
    color: "#0F172A",
    fontWeight: "700",
    fontSize: 12,
  },
  timelineMeta: {
    color: "#334155",
    fontSize: 12,
  },
  backLink: {
    marginTop: 6,
    color: "#0F766E",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
