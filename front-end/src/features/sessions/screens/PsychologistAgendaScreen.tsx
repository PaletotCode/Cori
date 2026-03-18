import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuthStore } from "../../auth/hooks/useAuthStore";
import { useNotificationsStore } from "../../notifications/hooks/useNotificationsStore";
import {
  createPatientsApiClient,
  type PatientsApiClient,
} from "../../patients/api/patientsApiClient";
import type { PatientListItem } from "../../patients/api/types";
import {
  createSessionsApiClient,
  type SessionsApiClient,
} from "../api/sessionsApiClient";
import type { AgendaView, SessionAgendaItem, SessionDetail } from "../api/types";

const sessionsApiClient = createSessionsApiClient();
const patientsApiClient = createPatientsApiClient();

interface PsychologistAgendaScreenProps {
  apiClient?: SessionsApiClient;
  patientsClient?: PatientsApiClient;
}

function toIsoNowPlus(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function PsychologistAgendaScreen({
  apiClient = sessionsApiClient,
  patientsClient = patientsApiClient,
}: PsychologistAgendaScreenProps) {
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);
  const latestNotificationId = useNotificationsStore(
    (state) => state.items[0]?.id ?? null,
  );

  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [agendaView, setAgendaView] = useState<AgendaView>("week");
  const [referenceDate, setReferenceDate] = useState(new Date().toISOString().slice(0, 10));
  const [agendaItems, setAgendaItems] = useState<SessionAgendaItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [timeline, setTimeline] = useState<string[]>([]);

  const [newSessionPatientId, setNewSessionPatientId] = useState("");
  const [newSessionStartAt, setNewSessionStartAt] = useState(toIsoNowPlus(24));
  const [newSessionEndAt, setNewSessionEndAt] = useState(toIsoNowPlus(25));
  const [actionReason, setActionReason] = useState("");
  const [rescheduleStartAt, setRescheduleStartAt] = useState(toIsoNowPlus(48));
  const [rescheduleEndAt, setRescheduleEndAt] = useState(toIsoNowPlus(49));

  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [applyingAction, setApplyingAction] = useState(false);
  const [runningReminderJob, setRunningReminderJob] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedPatientName = useMemo(() => {
    const patient = patients.find((item) => item.id === newSessionPatientId);
    return patient?.fullName ?? null;
  }, [newSessionPatientId, patients]);

  const loadPatients = useCallback(async () => {
    if (accessToken === null) {
      return;
    }
      const patientList = await patientsClient.list(accessToken, {
        sortBy: "full_name",
        sortOrder: "asc",
      });
    setPatients(patientList);
    if (patientList.length > 0 && newSessionPatientId.length === 0) {
      setNewSessionPatientId(patientList[0].id);
    }
  }, [accessToken, newSessionPatientId.length, patientsClient]);

  const loadSessionDetail = useCallback(
    async (sessionId: string) => {
      if (accessToken === null) {
        return;
      }
      setLoadingDetail(true);
      try {
        const [detail, events] = await Promise.all([
          apiClient.getSession(accessToken, sessionId),
          apiClient.listSessionTimelineEvents(accessToken, sessionId, 50),
        ]);
        setSelectedSession(detail);
        setTimeline(
          events.map(
            (event) =>
              `${event.eventType} | ${new Date(event.createdAt).toLocaleString("pt-BR")}`,
          ),
        );
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Falha ao carregar detalhe da sessao.",
        );
      } finally {
        setLoadingDetail(false);
      }
    },
    [accessToken, apiClient],
  );

  const loadAgenda = useCallback(async () => {
    if (accessToken === null) {
      return;
    }
    setLoadingAgenda(true);
    setError(null);
    try {
      const agenda = await apiClient.listAgenda(accessToken, {
        view: agendaView,
        referenceDate,
      });
      setAgendaItems(agenda);
      if (agenda.length > 0) {
        const sessionId = selectedSessionId && agenda.some((item) => item.id === selectedSessionId)
          ? selectedSessionId
          : agenda[0].id;
        setSelectedSessionId(sessionId);
        await loadSessionDetail(sessionId);
      } else {
        setSelectedSessionId(null);
        setSelectedSession(null);
        setTimeline([]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha ao carregar agenda.");
    } finally {
      setLoadingAgenda(false);
    }
  }, [accessToken, apiClient, agendaView, loadSessionDetail, referenceDate, selectedSessionId]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    void loadAgenda();
  }, [loadAgenda]);

  useEffect(() => {
    if (latestNotificationId !== null) {
      void loadAgenda();
    }
  }, [latestNotificationId, loadAgenda]);

  const handleCreateSession = async () => {
    if (accessToken === null) {
      setError("Sessao expirada. Entre novamente.");
      return;
    }
    if (newSessionPatientId.length === 0) {
      setError("Selecione um paciente para agendar.");
      return;
    }

    setCreatingSession(true);
    setError(null);
    setInfo(null);
    try {
      const created = await apiClient.createSession(accessToken, {
        patientId: newSessionPatientId,
        scheduledStartAt: newSessionStartAt,
        scheduledEndAt: newSessionEndAt,
        locationMode: "online",
        notes: "Sessao criada pela agenda.",
      });
      setInfo(`Sessao criada. Link de confirmacao: ${created.confirmationLink}`);
      setSelectedSessionId(created.id);
      await loadAgenda();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha ao criar sessao.");
    } finally {
      setCreatingSession(false);
    }
  };

  const handleApplyAction = async (action: "confirm" | "reschedule" | "cancel" | "complete") => {
    if (accessToken === null || selectedSessionId === null) {
      setError("Selecione uma sessao para aplicar acao.");
      return;
    }

    setApplyingAction(true);
    setError(null);
    setInfo(null);
    try {
      await apiClient.applySessionAction(accessToken, selectedSessionId, {
        action,
        scheduledStartAt: action === "reschedule" ? rescheduleStartAt : undefined,
        scheduledEndAt: action === "reschedule" ? rescheduleEndAt : undefined,
        reason: action === "cancel" || action === "reschedule" ? actionReason || undefined : undefined,
      });
      setInfo(`Acao ${action} aplicada com sucesso.`);
      await loadAgenda();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao aplicar acao da sessao.",
      );
    } finally {
      setApplyingAction(false);
    }
  };

  const handleRunReminderJob = async () => {
    if (accessToken === null) {
      return;
    }
    setRunningReminderJob(true);
    setError(null);
    setInfo(null);
    try {
      const result = await apiClient.runSessionReminderJob(accessToken);
      setInfo(
        `Lembretes processados: ${result.processed} | enviados: ${result.sent} | falhas: ${result.failed}`,
      );
      await loadAgenda();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao executar scheduler de lembretes.",
      );
    } finally {
      setRunningReminderJob(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>Agenda Clinica</Text>
        <Text style={styles.title}>Sessoes e Confirmacoes</Text>
        <Text style={styles.subtitle}>Visao dia/semana/mes com status em tempo real.</Text>

        <View style={styles.row}>
          <AgendaChip
            testID="agenda-view-day"
            active={agendaView === "day"}
            label="Dia"
            onPress={() => setAgendaView("day")}
          />
          <AgendaChip
            testID="agenda-view-week"
            active={agendaView === "week"}
            label="Semana"
            onPress={() => setAgendaView("week")}
          />
          <AgendaChip
            testID="agenda-view-month"
            active={agendaView === "month"}
            label="Mes"
            onPress={() => setAgendaView("month")}
          />
        </View>

        <TextInput
          testID="agenda-reference-date"
          value={referenceDate}
          onChangeText={setReferenceDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#64748B"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          testID="agenda-refresh"
          onPress={() => void loadAgenda()}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Atualizar agenda</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Nova Sessao</Text>
        <Text style={styles.hintText}>
          Paciente selecionado: {selectedPatientName ?? "nenhum"}
        </Text>
        <View style={styles.rowWrap}>
          {patients.map((patient) => (
            <Pressable
              accessibilityRole="button"
              key={patient.id}
              testID={`agenda-patient-${patient.id}`}
              onPress={() => setNewSessionPatientId(patient.id)}
              style={[
                styles.patientChip,
                newSessionPatientId === patient.id ? styles.patientChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.patientChipText,
                  newSessionPatientId === patient.id ? styles.patientChipTextActive : null,
                ]}
              >
                {patient.fullName}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          testID="agenda-create-start"
          value={newSessionStartAt}
          onChangeText={setNewSessionStartAt}
          placeholder="Inicio ISO"
          placeholderTextColor="#64748B"
          style={styles.input}
        />
        <TextInput
          testID="agenda-create-end"
          value={newSessionEndAt}
          onChangeText={setNewSessionEndAt}
          placeholder="Fim ISO"
          placeholderTextColor="#64748B"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          testID="agenda-create-session"
          disabled={creatingSession}
          onPress={() => void handleCreateSession()}
          style={[styles.primaryButton, creatingSession ? styles.disabledButton : null]}
        >
          <Text style={styles.primaryButtonText}>
            {creatingSession ? "Criando..." : "Criar sessao"}
          </Text>
        </Pressable>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}

        <Text style={styles.sectionTitle}>Agenda</Text>
        {loadingAgenda ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#0F766E" />
            <Text style={styles.loadingText}>Carregando agenda...</Text>
          </View>
        ) : agendaItems.length === 0 ? (
          <Text style={styles.emptyText}>Sem sessoes na janela selecionada.</Text>
        ) : (
          agendaItems.map((item) => (
            <Pressable
              accessibilityRole="button"
              key={item.id}
              testID={`agenda-item-${item.id}`}
              onPress={() => {
                setSelectedSessionId(item.id);
                void loadSessionDetail(item.id);
              }}
              style={[
                styles.itemBox,
                selectedSessionId === item.id ? styles.itemBoxSelected : null,
              ]}
            >
              <Text style={styles.itemTitle}>{item.patientName}</Text>
              <Text style={styles.itemMeta}>status: {item.status}</Text>
              <Text style={styles.itemMeta}>
                inicio: {new Date(item.scheduledStartAt).toLocaleString("pt-BR")}
              </Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionTitle}>Sessao Detalhada</Text>
        {loadingDetail ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#0F766E" />
            <Text style={styles.loadingText}>Carregando detalhes...</Text>
          </View>
        ) : selectedSession === null ? (
          <Text style={styles.emptyText}>Selecione uma sessao na agenda.</Text>
        ) : (
          <View style={styles.detailBox}>
            <Text style={styles.itemMeta}>Paciente: {selectedSession.patientName}</Text>
            <Text style={styles.itemMeta}>Status: {selectedSession.status}</Text>
            <Text style={styles.itemMeta}>
              Inicio: {new Date(selectedSession.scheduledStartAt).toLocaleString("pt-BR")}
            </Text>
            <Text style={styles.itemMeta}>
              Fim: {new Date(selectedSession.scheduledEndAt).toLocaleString("pt-BR")}
            </Text>
            <Text style={styles.itemMeta}>
              Confirmado em:{" "}
              {selectedSession.confirmedAt
                ? new Date(selectedSession.confirmedAt).toLocaleString("pt-BR")
                : "-"}
            </Text>

            <TextInput
              testID="agenda-action-reason"
              value={actionReason}
              onChangeText={setActionReason}
              placeholder="Justificativa para remarcacao/cancelamento"
              placeholderTextColor="#64748B"
              style={[styles.input, styles.multilineInput]}
              multiline
            />
            <TextInput
              testID="agenda-reschedule-start"
              value={rescheduleStartAt}
              onChangeText={setRescheduleStartAt}
              placeholder="Novo inicio ISO"
              placeholderTextColor="#64748B"
              style={styles.input}
            />
            <TextInput
              testID="agenda-reschedule-end"
              value={rescheduleEndAt}
              onChangeText={setRescheduleEndAt}
              placeholder="Novo fim ISO"
              placeholderTextColor="#64748B"
              style={styles.input}
            />

            <View style={styles.rowWrap}>
              <Pressable
                accessibilityRole="button"
                testID="session-action-confirm"
                disabled={applyingAction}
                onPress={() => void handleApplyAction("confirm")}
                style={[styles.successButton, applyingAction ? styles.disabledButton : null]}
              >
                <Text style={styles.actionButtonText}>Confirmar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                testID="session-action-reschedule"
                disabled={applyingAction}
                onPress={() => void handleApplyAction("reschedule")}
                style={[styles.warningButton, applyingAction ? styles.disabledButton : null]}
              >
                <Text style={styles.actionButtonText}>Remarcar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                testID="session-action-cancel"
                disabled={applyingAction}
                onPress={() => void handleApplyAction("cancel")}
                style={[styles.dangerButton, applyingAction ? styles.disabledButton : null]}
              >
                <Text style={styles.actionButtonText}>Cancelar</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              testID="agenda-run-reminders"
              disabled={runningReminderJob}
              onPress={() => void handleRunReminderJob()}
              style={[styles.auxButton, runningReminderJob ? styles.disabledButton : null]}
            >
              <Text style={styles.auxButtonText}>
                {runningReminderJob ? "Processando..." : "Executar lembretes agendados"}
              </Text>
            </Pressable>

            <Text style={styles.timelineTitle}>Timeline da sessao</Text>
            {timeline.length === 0 ? (
              <Text style={styles.emptyText}>Sem eventos para esta sessao.</Text>
            ) : (
              timeline.map((entry) => (
                <Text key={entry} style={styles.timelineEntry}>
                  {entry}
                </Text>
              ))
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function AgendaChip({
  active,
  label,
  onPress,
  testID,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: "#EEF6FA",
  },
  card: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 18,
    gap: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    backgroundColor: "#EDE9FE",
    color: "#5B21B6",
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
  sectionTitle: {
    marginTop: 8,
    color: "#0F172A",
    fontWeight: "800",
    fontSize: 16,
  },
  hintText: {
    color: "#475569",
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#94A3B8",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: "#7C3AED",
    backgroundColor: "#EDE9FE",
  },
  chipText: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 12,
  },
  chipTextActive: {
    color: "#5B21B6",
  },
  patientChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#94A3B8",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  patientChipActive: {
    borderColor: "#0F766E",
    backgroundColor: "#CCFBF1",
  },
  patientChipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  patientChipTextActive: {
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
  multilineInput: {
    minHeight: 70,
    textAlignVertical: "top",
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
  successButton: {
    borderRadius: 10,
    backgroundColor: "#15803D",
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  warningButton: {
    borderRadius: 10,
    backgroundColor: "#B45309",
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  dangerButton: {
    borderRadius: 10,
    backgroundColor: "#B91C1C",
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  auxButton: {
    borderRadius: 10,
    backgroundColor: "#0E7490",
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  auxButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  disabledButton: {
    opacity: 0.55,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: "#334155",
  },
  emptyText: {
    color: "#475569",
    fontSize: 13,
  },
  itemBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F8FAFC",
    padding: 10,
    gap: 3,
  },
  itemBoxSelected: {
    borderColor: "#7C3AED",
    backgroundColor: "#F5F3FF",
  },
  itemTitle: {
    color: "#0F172A",
    fontWeight: "700",
    fontSize: 14,
  },
  itemMeta: {
    color: "#334155",
    fontSize: 12,
  },
  detailBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C4B5FD",
    backgroundColor: "#FAF5FF",
    padding: 10,
    gap: 7,
  },
  timelineTitle: {
    marginTop: 4,
    color: "#5B21B6",
    fontWeight: "700",
    fontSize: 13,
  },
  timelineEntry: {
    color: "#6D28D9",
    fontSize: 12,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "600",
  },
  infoText: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "600",
  },
});
