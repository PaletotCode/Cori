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

import { shellStyles } from "../../../shared/ui/shellStyles";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

import { useAuthStore } from "../../auth/hooks/useAuthStore";
import {
  createTriageApiClient,
  type TriageApiClient,
} from "../api/triageApiClient";
import type {
  IntakeInviteCreatePayload,
  IntakeInviteCreateResult,
  IntakeMode,
  IntakeQueueItem,
  IntakeReviewAction,
  TimelineEvent,
} from "../api/types";

const triageApiClient = createTriageApiClient();

interface PsychologistTriageInvitesScreenProps {
  apiClient?: TriageApiClient;
}

export function PsychologistTriageInvitesScreen({
  apiClient = triageApiClient,
}: PsychologistTriageInvitesScreenProps) {
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);

  const [mode, setMode] = useState<IntakeMode>("simple_invite");
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [inviteMessage, setInviteMessage] = useState("");
  const [customQuestionsRaw, setCustomQuestionsRaw] = useState(
    "Qual o principal motivo para iniciar terapia?\nExiste preferencia de horario?",
  );
  const [reviewNote, setReviewNote] = useState("");

  const [creating, setCreating] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<IntakeInviteCreateResult | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [actionLoadingIntakeId, setActionLoadingIntakeId] = useState<string | null>(null);
  const [queue, setQueue] = useState<IntakeQueueItem[]>([]);
  const [selectedIntakeId, setSelectedIntakeId] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedIntake = useMemo(
    () => queue.find((item) => item.intakeId === selectedIntakeId) ?? null,
    [queue, selectedIntakeId],
  );

  const customQuestions = useMemo(
    () =>
      customQuestionsRaw
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((prompt) => ({
          prompt,
          required: true,
        })),
    [customQuestionsRaw],
  );

  const loadQueue = useCallback(async () => {
    if (accessToken === null) {
      return;
    }
    setQueueLoading(true);
    setError(null);
    try {
      const data = await apiClient.getQueue(accessToken);
      setQueue(data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao carregar fila de triagens.",
      );
    } finally {
      setQueueLoading(false);
    }
  }, [accessToken, apiClient]);

  const loadTimeline = useCallback(
    async (intakeId: string) => {
      if (accessToken === null) {
        return;
      }
      try {
        const events = await apiClient.getTimelineEvents(accessToken, {
          intakeId,
          limit: 100,
        });
        setTimelineEvents(events);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Falha ao carregar eventos de timeline.",
        );
      }
    },
    [accessToken, apiClient],
  );

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const handleCreateInvite = async () => {
    if (accessToken === null) {
      setError("Sessao expirada. Entre novamente.");
      return;
    }

    const parsedExpires = Number.parseInt(expiresInHours.trim(), 10);
    if (!Number.isInteger(parsedExpires) || parsedExpires < 1 || parsedExpires > 720) {
      setError("Expiracao deve estar entre 1 e 720 horas.");
      return;
    }

    if (mode === "custom_triage" && customQuestions.length === 0) {
      setError("Triagem personalizada exige ao menos uma pergunta.");
      return;
    }

    const payload: IntakeInviteCreatePayload = {
      mode,
      expiresInHours: parsedExpires,
      inviteMessage: inviteMessage.trim() || undefined,
      customQuestions: mode === "custom_triage" ? customQuestions : undefined,
    };

    setCreating(true);
    setError(null);
    setInfo(null);
    try {
      const created = await apiClient.createInvite(accessToken, payload);
      setCreatedInvite(created);
      setInfo("Convite gerado com sucesso.");
      await loadQueue();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao gerar convite de triagem.",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleReview = async (intakeId: string, action: IntakeReviewAction) => {
    if (accessToken === null) {
      setError("Sessao expirada. Entre novamente.");
      return;
    }

    let note = reviewNote.trim();
    if (action === "reject" && note.length === 0) {
      note = "Triagem rejeitada sem aderencia aos criterios iniciais.";
    }
    if (action === "request_complement" && note.length === 0) {
      note = "Descreva melhor disponibilidade e contexto da demanda.";
    }

    setActionLoadingIntakeId(intakeId);
    setError(null);
    try {
      await apiClient.reviewIntake(accessToken, intakeId, {
        action,
        note: note.length > 0 ? note : undefined,
      });
      setInfo("Status atualizado com sucesso.");
      await loadQueue();
      await loadTimeline(intakeId);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Falha ao revisar triagem.",
      );
    } finally {
      setActionLoadingIntakeId(null);
    }
  };

  const handleSelectIntake = async (intakeId: string) => {
    setSelectedIntakeId(intakeId);
    await loadTimeline(intakeId);
  };

  return (
    <ScreenFadeIn>
      <ScrollView contentContainerStyle={[styles.container, shellStyles.scrollContainer]}>
      <View style={[styles.card, shellStyles.surface]}>
        <Text style={styles.label}>Modo</Text>
        <View style={styles.chipRow}>
          <ModeChip
            active={mode === "simple_invite"}
            label="Convite simples"
            onPress={() => setMode("simple_invite")}
          />
          <ModeChip
            active={mode === "custom_triage"}
            label="Triagem personalizada"
            onPress={() => setMode("custom_triage")}
          />
        </View>

        <Text style={styles.label}>Expiracao (horas)</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={setExpiresInHours}
          placeholder="72"
          placeholderTextColor="#64748B"
          style={styles.input}
          value={expiresInHours}
        />

        <Text style={styles.label}>Mensagem do convite (opcional)</Text>
        <TextInput
          onChangeText={setInviteMessage}
          placeholder="Mensagem inicial para o paciente."
          placeholderTextColor="#64748B"
          style={[styles.input, styles.multilineInput]}
          value={inviteMessage}
          multiline
        />

        {mode === "custom_triage" ? (
          <>
            <Text style={styles.label}>Perguntas da triagem (uma por linha)</Text>
            <TextInput
              onChangeText={setCustomQuestionsRaw}
              placeholder="Pergunta 1&#10;Pergunta 2"
              placeholderTextColor="#64748B"
              style={[styles.input, styles.multilineInput]}
              value={customQuestionsRaw}
              multiline
            />
          </>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={creating}
          onPress={handleCreateInvite}
          style={[styles.primaryButton, creating ? styles.disabledButton : null]}
        >
          <Text style={styles.primaryButtonText}>
            {creating ? "Gerando..." : "Gerar link/token seguro"}
          </Text>
        </Pressable>

        {createdInvite ? (
          <View style={styles.generatedBox}>
            <Text style={styles.generatedTitle}>Convite gerado</Text>
            <Text style={styles.generatedText}>Intake: {createdInvite.intakeId}</Text>
            <Text style={styles.generatedText}>Token: {createdInvite.inviteToken}</Text>
            <Text style={styles.generatedText}>Link: {createdInvite.inviteLink}</Text>
            <Text style={styles.generatedText}>
              Expira em: {new Date(createdInvite.inviteExpiresAt).toLocaleString("pt-BR")}
            </Text>
          </View>
        ) : null}

        <View style={styles.queueHeader}>
          <Text style={styles.sectionTitle}>Fila de Triagens Recebidas</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadQueue()}>
            <Text style={styles.refreshLink}>Atualizar</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Nota da revisao (opcional)</Text>
        <TextInput
          onChangeText={setReviewNote}
          placeholder="Usada em aprovar/rejeitar/complementar."
          placeholderTextColor="#64748B"
          style={[styles.input, styles.multilineInput]}
          value={reviewNote}
          multiline
        />

        {queueLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#0F766E" />
            <Text style={styles.loadingText}>Carregando fila...</Text>
          </View>
        ) : queue.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma triagem recebida ate o momento.</Text>
        ) : (
          queue.map((item) => {
            const actionable =
              item.status === "submitted" || item.status === "complement_requested";
            const loadingAction = actionLoadingIntakeId === item.intakeId;
            return (
              <Pressable
                accessibilityRole="button"
                key={item.intakeId}
                onPress={() => void handleSelectIntake(item.intakeId)}
                style={[
                  styles.queueItem,
                  selectedIntakeId === item.intakeId ? styles.queueItemSelected : null,
                ]}
              >
                <Text style={styles.queueTitle}>
                  {item.patientFullName ?? "Paciente aguardando submissao"}
                </Text>
                <Text style={styles.queueMeta}>
                  {item.mode} | status: {item.status}
                </Text>
                <Text style={styles.queueMeta}>Intake: {item.intakeId}</Text>
                {item.complementRequestNote ? (
                  <Text style={styles.queueMeta}>
                    Complemento solicitado: {item.complementRequestNote}
                  </Text>
                ) : null}

                {actionable ? (
                  <View style={styles.actionsRow}>
                    <InlineActionButton
                      disabled={loadingAction}
                      label="Aprovar"
                      onPress={() => void handleReview(item.intakeId, "approve")}
                      variant="approve"
                    />
                    <InlineActionButton
                      disabled={loadingAction}
                      label="Complemento"
                      onPress={() => void handleReview(item.intakeId, "request_complement")}
                      variant="complement"
                    />
                    <InlineActionButton
                      disabled={loadingAction}
                      label="Rejeitar"
                      onPress={() => void handleReview(item.intakeId, "reject")}
                      variant="reject"
                    />
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}

        {selectedIntake ? (
          <View style={styles.timelineBox}>
            <Text style={styles.sectionTitle}>Timeline do Intake Selecionado</Text>
            <Text style={styles.queueMeta}>Intake: {selectedIntake.intakeId}</Text>
            {timelineEvents.length === 0 ? (
              <Text style={styles.emptyText}>Sem eventos para este intake.</Text>
            ) : (
              timelineEvents.map((event) => (
                <View key={event.id} style={styles.timelineItem}>
                  <Text style={styles.timelineType}>{event.eventType}</Text>
                  <Text style={styles.timelineMeta}>
                    ator: {event.actorType} |{" "}
                    {new Date(event.createdAt).toLocaleString("pt-BR")}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : null}
      </View>
      </ScrollView>
    </ScreenFadeIn>
  );
}

function ModeChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.modeChip, active ? styles.modeChipActive : null]}
    >
      <Text style={[styles.modeChipText, active ? styles.modeChipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function InlineActionButton({
  label,
  disabled,
  variant,
  onPress,
}: {
  label: string;
  disabled: boolean;
  variant: "approve" | "complement" | "reject";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.inlineActionButton,
        variant === "approve"
          ? styles.approveButton
          : variant === "complement"
            ? styles.complementButton
            : styles.rejectButton,
        disabled ? styles.disabledButton : null,
      ]}
    >
      <Text style={styles.inlineActionButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: "#F2F8FA",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    gap: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  label: {
    color: "#1E293B",
    fontWeight: "600",
    fontSize: 13,
    marginTop: 4,
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
    minHeight: 72,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  modeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#94A3B8",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeChipActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  modeChipText: {
    color: "#334155",
    fontWeight: "600",
    fontSize: 13,
  },
  modeChipTextActive: {
    color: "#FFFFFF",
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: "#0F766E",
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
  generatedBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#86EFAC",
    backgroundColor: "#F0FDF4",
    padding: 10,
    gap: 3,
  },
  generatedTitle: {
    color: "#166534",
    fontWeight: "700",
  },
  generatedText: {
    color: "#14532D",
    fontSize: 12,
  },
  queueHeader: {
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    color: "#0F172A",
    fontWeight: "800",
    fontSize: 16,
  },
  refreshLink: {
    color: "#0F766E",
    fontWeight: "700",
    textDecorationLine: "underline",
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
  queueItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F8FAFC",
    padding: 10,
    gap: 4,
  },
  queueItemSelected: {
    borderColor: "#0EA5E9",
    backgroundColor: "#EFF6FF",
  },
  queueTitle: {
    color: "#0F172A",
    fontWeight: "700",
    fontSize: 14,
  },
  queueMeta: {
    color: "#334155",
    fontSize: 12,
  },
  actionsRow: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  inlineActionButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  inlineActionButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  approveButton: {
    backgroundColor: "#15803D",
  },
  complementButton: {
    backgroundColor: "#B45309",
  },
  rejectButton: {
    backgroundColor: "#B91C1C",
  },
  timelineBox: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    padding: 10,
    gap: 6,
  },
  timelineItem: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#FFFFFF",
    padding: 8,
    gap: 2,
  },
  timelineType: {
    color: "#1E3A8A",
    fontWeight: "700",
    fontSize: 12,
  },
  timelineMeta: {
    color: "#1E40AF",
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
