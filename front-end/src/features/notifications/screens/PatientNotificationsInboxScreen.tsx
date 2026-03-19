import { Link, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { shellStyles } from "../../../shared/ui/shellStyles";

import {
  createNotificationsApiClient,
  NotificationsApiError,
  type NotificationsApiClient,
} from "../api/notificationsApiClient";
import type { NotificationDelivery } from "../api/types";

const notificationsApiClient = createNotificationsApiClient();

interface PatientNotificationsInboxScreenProps {
  apiClient?: NotificationsApiClient;
}

export function PatientNotificationsInboxScreen({
  apiClient = notificationsApiClient,
}: PatientNotificationsInboxScreenProps) {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const tokenFromQuery = Array.isArray(params.token) ? params.token[0] : params.token;

  const [patientAccessToken, setPatientAccessToken] = useState(tokenFromQuery ?? "");
  const [patientName, setPatientName] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationDelivery[]>([]);
  const [documentId, setDocumentId] = useState("doc-001");
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const hasToken = useMemo(() => patientAccessToken.trim().length >= 20, [patientAccessToken]);

  const loadInbox = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? patientAccessToken).trim();
      if (token.length < 20) {
        setError("Informe um token de notificacoes valido.");
        return;
      }
      setLoading(true);
      setError(null);
      setInfo(null);
      try {
        const payload = await apiClient.listPublicInbox(token, 250);
        setPatientAccessToken(token);
        setPatientName(payload.patientName);
        setNotifications(payload.notifications);
        setInfo("Inbox carregada.");
      } catch (requestError) {
        setPatientName(null);
        setNotifications([]);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Falha ao carregar inbox de notificacoes.",
        );
      } finally {
        setLoading(false);
      }
    },
    [apiClient, patientAccessToken],
  );

  useEffect(() => {
    if (tokenFromQuery && tokenFromQuery.length > 0) {
      void loadInbox(tokenFromQuery);
    }
  }, [loadInbox, tokenFromQuery]);

  const handleInboxAction = async (deliveryId: string, action: "open" | "action_taken") => {
    const token = patientAccessToken.trim();
    if (token.length < 20) {
      setError("Token invalido para atualizar notificacao.");
      return;
    }
    setActingId(deliveryId);
    setError(null);
    setInfo(null);
    try {
      const result = await apiClient.applyPublicInboxAction(token, deliveryId, action);
      setInfo(`Notificacao atualizada para status ${result.status}.`);
      await loadInbox(token);
    } catch (requestError) {
      setError(
        requestError instanceof NotificationsApiError
          ? requestError.message
          : "Falha ao atualizar notificacao.",
      );
    } finally {
      setActingId(null);
    }
  };

  const handleDocumentAction = async (action: "opened" | "acknowledged") => {
    const token = patientAccessToken.trim();
    if (token.length < 20) {
      setError("Token invalido para registrar evento de documento.");
      return;
    }
    if (documentId.trim().length < 2) {
      setError("Informe um identificador de documento valido.");
      return;
    }
    setError(null);
    setInfo(null);
    try {
      await apiClient.applyPublicDocumentAction(token, documentId.trim(), { action });
      setInfo(`Evento de documento registrado: ${action}.`);
      await loadInbox(token);
    } catch (requestError) {
      setError(
        requestError instanceof NotificationsApiError
          ? requestError.message
          : "Falha ao registrar evento de documento.",
      );
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, shellStyles.scrollContainer]}>
      <View style={[styles.card, shellStyles.surface]}>
        <Text style={styles.badge}>Paciente</Text>
        <Text style={styles.title}>Inbox de Notificacoes</Text>
        <Text style={styles.subtitle}>
          Consulte notificacoes recebidas e registre abertura/acao.
        </Text>

        <Text style={styles.label}>Token de notificacoes</Text>
        <TextInput
          testID="patient-inbox-token"
          value={patientAccessToken}
          onChangeText={setPatientAccessToken}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="cole-o-token-aqui"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <Pressable
          testID="patient-inbox-load"
          disabled={!hasToken || loading}
          onPress={() => void loadInbox()}
          style={[styles.primaryButton, !hasToken || loading ? styles.disabledButton : null]}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? "Carregando..." : "Carregar inbox"}
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Documentos v1</Text>
        <TextInput
          testID="patient-inbox-document-id"
          value={documentId}
          onChangeText={setDocumentId}
          placeholder="doc-001"
          placeholderTextColor="#64748B"
          style={styles.input}
        />
        <View style={styles.actionsRow}>
          <Pressable
            testID="patient-inbox-document-open"
            onPress={() => void handleDocumentAction("opened")}
            style={[styles.actionButton, styles.actionBlue]}
          >
            <Text style={styles.actionButtonText}>Registrar abertura</Text>
          </Pressable>
          <Pressable
            testID="patient-inbox-document-ack"
            onPress={() => void handleDocumentAction("acknowledged")}
            style={[styles.actionButton, styles.actionGreen]}
          >
            <Text style={styles.actionButtonText}>Registrar ciente</Text>
          </Pressable>
        </View>

        {patientName ? <Text style={styles.metaText}>Paciente: {patientName}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}

        {notifications.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma notificacao encontrada para este token.</Text>
        ) : (
          notifications.map((item) => (
            <View key={item.id} style={styles.notificationBox}>
              <Text style={styles.notificationTitle}>{item.title}</Text>
              <Text style={styles.notificationMeta}>
                {item.status} | {item.category}
              </Text>
              <Text style={styles.notificationBody}>{item.body}</Text>
              <View style={styles.actionsRow}>
                <Pressable
                  testID={`patient-inbox-open-${item.id}`}
                  disabled={actingId === item.id}
                  onPress={() => void handleInboxAction(item.id, "open")}
                  style={[styles.actionButton, styles.actionTeal, actingId === item.id ? styles.disabledButton : null]}
                >
                  <Text style={styles.actionButtonText}>Abrir</Text>
                </Pressable>
                <Pressable
                  testID={`patient-inbox-action-${item.id}`}
                  disabled={actingId === item.id}
                  onPress={() => void handleInboxAction(item.id, "action_taken")}
                  style={[
                    styles.actionButton,
                    styles.actionOrange,
                    actingId === item.id ? styles.disabledButton : null,
                  ]}
                >
                  <Text style={styles.actionButtonText}>Registrar acao</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Link
          href={{
            pathname: "/paciente/preferencias-notificacao",
            params: { token: patientAccessToken },
          }}
          style={styles.backLink}
        >
          <Text style={styles.backLink}>Abrir preferencias de notificacao</Text>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F8FAFC",
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
    fontSize: 13,
  },
  label: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  sectionTitle: {
    marginTop: 8,
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "800",
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
    paddingVertical: 11,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  metaText: {
    color: "#1E3A8A",
    fontWeight: "700",
    fontSize: 13,
  },
  notificationBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    padding: 10,
    gap: 4,
  },
  notificationTitle: {
    color: "#1D4ED8",
    fontWeight: "700",
    fontSize: 13,
  },
  notificationMeta: {
    color: "#334155",
    fontSize: 12,
  },
  notificationBody: {
    color: "#0F172A",
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
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionBlue: {
    backgroundColor: "#2563EB",
  },
  actionGreen: {
    backgroundColor: "#15803D",
  },
  actionTeal: {
    backgroundColor: "#0F766E",
  },
  actionOrange: {
    backgroundColor: "#C2410C",
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

