import { Link, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { shellStyles } from "../../../shared/ui/shellStyles";

import {
  createSessionsApiClient,
  SessionsApiError,
  type SessionsApiClient,
} from "../api/sessionsApiClient";
import type { SessionAgendaItem } from "../api/types";

const sessionsApiClient = createSessionsApiClient();

interface PatientSessionsScreenProps {
  apiClient?: SessionsApiClient;
}

export function PatientSessionsScreen({ apiClient = sessionsApiClient }: PatientSessionsScreenProps) {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const tokenFromQuery = Array.isArray(params.token) ? params.token[0] : params.token;

  const [confirmationToken, setConfirmationToken] = useState(tokenFromQuery ?? "");
  const [patientName, setPatientName] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionAgendaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmingSessionId, setConfirmingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const hasToken = useMemo(() => confirmationToken.trim().length >= 20, [confirmationToken]);

  const loadSessions = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? confirmationToken).trim();
      if (token.length < 20) {
        setError("Informe um token de confirmacao valido.");
        return;
      }

      setLoading(true);
      setError(null);
      setInfo(null);
      try {
        const payload = await apiClient.listPublicSessions(token);
        setConfirmationToken(token);
        setPatientName(payload.patientName);
        setSessions(payload.sessions);
        setInfo("Sessoes carregadas com sucesso.");
      } catch (requestError) {
        setPatientName(null);
        setSessions([]);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Falha ao carregar sessoes do paciente.",
        );
      } finally {
        setLoading(false);
      }
    },
    [apiClient, confirmationToken],
  );

  useEffect(() => {
    if (tokenFromQuery && tokenFromQuery.length > 0) {
      void loadSessions(tokenFromQuery);
    }
  }, [loadSessions, tokenFromQuery]);

  const handleConfirmPresence = async (sessionId: string) => {
    const token = confirmationToken.trim();
    if (token.length < 20) {
      setError("Token invalido para confirmar sessao.");
      return;
    }

    setConfirmingSessionId(sessionId);
    setError(null);
    setInfo(null);
    try {
      const result = await apiClient.confirmPublicSession(token, sessionId);
      setInfo(`Presenca confirmada. Status atual: ${result.status}.`);
      await loadSessions(token);
    } catch (requestError) {
      setError(
        requestError instanceof SessionsApiError
          ? requestError.message
          : "Falha ao confirmar presenca na sessao.",
      );
    } finally {
      setConfirmingSessionId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, shellStyles.scrollContainer]}>
      <View style={[styles.card, shellStyles.surface]}>
        <Text style={styles.badge}>Paciente</Text>
        <Text style={styles.title}>Minhas Sessoes</Text>
        <Text style={styles.subtitle}>
          Consulte suas sessoes e confirme presenca com o token recebido.
        </Text>

        <Text style={styles.label}>Token de confirmacao</Text>
        <TextInput
          testID="patient-sessions-token-input"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setConfirmationToken}
          placeholder="cole-o-token-aqui"
          placeholderTextColor="#64748B"
          style={styles.input}
          value={confirmationToken}
        />

        <Pressable
          accessibilityRole="button"
          testID="patient-sessions-load"
          disabled={!hasToken || loading}
          onPress={() => void loadSessions()}
          style={[styles.primaryButton, !hasToken || loading ? styles.disabledButton : null]}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? "Carregando..." : "Carregar sessoes"}
          </Text>
        </Pressable>

        {patientName ? <Text style={styles.infoLabel}>Paciente: {patientName}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}

        {sessions.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma sessao encontrada para este token.</Text>
        ) : (
          sessions.map((session) => {
            const canConfirm =
              session.status === "scheduled" || session.status === "rescheduled";
            return (
              <View key={session.id} style={styles.sessionBox}>
                <Text style={styles.sessionTitle}>{session.patientName}</Text>
                <Text style={styles.sessionMeta}>Status: {session.status}</Text>
                <Text style={styles.sessionMeta}>
                  Inicio: {new Date(session.scheduledStartAt).toLocaleString("pt-BR")}
                </Text>
                <Text style={styles.sessionMeta}>
                  Fim: {new Date(session.scheduledEndAt).toLocaleString("pt-BR")}
                </Text>

                {canConfirm ? (
                  <Pressable
                    accessibilityRole="button"
                    testID={`patient-confirm-session-${session.id}`}
                    disabled={confirmingSessionId === session.id}
                    onPress={() => void handleConfirmPresence(session.id)}
                    style={[
                      styles.confirmButton,
                      confirmingSessionId === session.id ? styles.disabledButton : null,
                    ]}
                  >
                    <Text style={styles.confirmButtonText}>
                      {confirmingSessionId === session.id
                        ? "Confirmando..."
                        : "Confirmar presenca"}
                    </Text>
                  </Pressable>
                ) : null}
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
    backgroundColor: "#DCFCE7",
    color: "#166534",
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
    backgroundColor: "#166534",
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
    color: "#14532D",
    fontWeight: "700",
    fontSize: 13,
  },
  sessionBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
    padding: 10,
    gap: 4,
  },
  sessionTitle: {
    color: "#166534",
    fontWeight: "700",
    fontSize: 14,
  },
  sessionMeta: {
    color: "#14532D",
    fontSize: 12,
  },
  confirmButton: {
    marginTop: 4,
    borderRadius: 8,
    backgroundColor: "#15803D",
    paddingVertical: 10,
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
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
    color: "#166534",
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
