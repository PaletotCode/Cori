import { Link, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { shellStyles } from "../../../shared/ui/shellStyles";

import {
  createNotificationsApiClient,
  NotificationsApiError,
  type NotificationsApiClient,
} from "../api/notificationsApiClient";

const notificationsApiClient = createNotificationsApiClient();

interface PatientNotificationPreferencesScreenProps {
  apiClient?: NotificationsApiClient;
}

interface PreferencesDraft {
  enabled: boolean;
  inboxEnabled: boolean;
  pushEnabled: boolean;
  realtimeEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  maxNotificationsPerHour: string;
}

function toDraft(payload: {
  enabled: boolean;
  inboxEnabled: boolean;
  pushEnabled: boolean;
  realtimeEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  maxNotificationsPerHour: number;
}): PreferencesDraft {
  return {
    enabled: payload.enabled,
    inboxEnabled: payload.inboxEnabled,
    pushEnabled: payload.pushEnabled,
    realtimeEnabled: payload.realtimeEnabled,
    quietHoursStart: payload.quietHoursStart === null ? "" : String(payload.quietHoursStart),
    quietHoursEnd: payload.quietHoursEnd === null ? "" : String(payload.quietHoursEnd),
    maxNotificationsPerHour: String(payload.maxNotificationsPerHour),
  };
}

export function PatientNotificationPreferencesScreen({
  apiClient = notificationsApiClient,
}: PatientNotificationPreferencesScreenProps) {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const tokenFromQuery = Array.isArray(params.token) ? params.token[0] : params.token;

  const [patientAccessToken, setPatientAccessToken] = useState(tokenFromQuery ?? "");
  const [draft, setDraft] = useState<PreferencesDraft>({
    enabled: true,
    inboxEnabled: true,
    pushEnabled: true,
    realtimeEnabled: true,
    quietHoursStart: "",
    quietHoursEnd: "",
    maxNotificationsPerHour: "20",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const hasToken = useMemo(() => patientAccessToken.trim().length >= 20, [patientAccessToken]);

  const loadPreferences = useCallback(
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
        const preferences = await apiClient.getPublicPreferences(token);
        setPatientAccessToken(token);
        setDraft(toDraft(preferences));
        setInfo("Preferencias carregadas.");
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Falha ao carregar preferencias.",
        );
      } finally {
        setLoading(false);
      }
    },
    [apiClient, patientAccessToken],
  );

  useEffect(() => {
    if (tokenFromQuery && tokenFromQuery.length > 0) {
      void loadPreferences(tokenFromQuery);
    }
  }, [loadPreferences, tokenFromQuery]);

  const toggleField = (key: "enabled" | "inboxEnabled" | "pushEnabled" | "realtimeEnabled") => {
    setDraft((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleSave = async () => {
    const token = patientAccessToken.trim();
    if (token.length < 20) {
      setError("Token invalido para salvar preferencias.");
      return;
    }

    const maxPerHour = Number.parseInt(draft.maxNotificationsPerHour, 10);
    if (!Number.isFinite(maxPerHour) || maxPerHour < 1) {
      setError("Frequencia maxima por hora invalida.");
      return;
    }

    const quietStart =
      draft.quietHoursStart.trim().length > 0
        ? Number.parseInt(draft.quietHoursStart, 10)
        : null;
    const quietEnd =
      draft.quietHoursEnd.trim().length > 0 ? Number.parseInt(draft.quietHoursEnd, 10) : null;
    if (
      (quietStart !== null && (!Number.isFinite(quietStart) || quietStart < 0 || quietStart > 23)) ||
      (quietEnd !== null && (!Number.isFinite(quietEnd) || quietEnd < 0 || quietEnd > 23))
    ) {
      setError("Janela de silencio exige horas de 0 a 23.");
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const updated = await apiClient.updatePublicPreferences(token, {
        eventCategory: "all",
        enabled: draft.enabled,
        inboxEnabled: draft.inboxEnabled,
        pushEnabled: draft.pushEnabled,
        realtimeEnabled: draft.realtimeEnabled,
        quietHoursStart: quietStart,
        quietHoursEnd: quietEnd,
        maxNotificationsPerHour: maxPerHour,
      });
      setDraft(toDraft(updated));
      setInfo("Preferencias salvas com sucesso.");
    } catch (requestError) {
      setError(
        requestError instanceof NotificationsApiError
          ? requestError.message
          : "Falha ao salvar preferencias.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, shellStyles.scrollContainer]}>
      <View style={[styles.card, shellStyles.surface]}>
        <Text style={styles.badge}>Paciente</Text>
        <Text style={styles.title}>Preferencias de Notificacao</Text>
        <Text style={styles.subtitle}>
          Ajuste canais, janela de silencio e frequencia maxima por hora.
        </Text>

        <Text style={styles.label}>Token de notificacoes</Text>
        <TextInput
          testID="patient-notification-preferences-token"
          value={patientAccessToken}
          onChangeText={setPatientAccessToken}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="cole-o-token-aqui"
          placeholderTextColor="#64748B"
          style={styles.input}
        />
        <Pressable
          testID="patient-notification-preferences-load"
          disabled={!hasToken || loading}
          onPress={() => void loadPreferences()}
          style={[styles.primaryButton, !hasToken || loading ? styles.disabledButton : null]}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? "Carregando..." : "Carregar preferencias"}
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Canais e regra geral</Text>
        <Pressable
          testID="pref-toggle-enabled"
          onPress={() => toggleField("enabled")}
          style={styles.toggleButton}
        >
          <Text style={styles.toggleButtonText}>
            Regra ativa: {draft.enabled ? "sim" : "nao"}
          </Text>
        </Pressable>
        <Pressable
          testID="pref-toggle-inbox"
          onPress={() => toggleField("inboxEnabled")}
          style={styles.toggleButton}
        >
          <Text style={styles.toggleButtonText}>
            Inbox habilitada: {draft.inboxEnabled ? "sim" : "nao"}
          </Text>
        </Pressable>
        <Pressable
          testID="pref-toggle-push"
          onPress={() => toggleField("pushEnabled")}
          style={styles.toggleButton}
        >
          <Text style={styles.toggleButtonText}>Push habilitado: {draft.pushEnabled ? "sim" : "nao"}</Text>
        </Pressable>
        <Pressable
          testID="pref-toggle-realtime"
          onPress={() => toggleField("realtimeEnabled")}
          style={styles.toggleButton}
        >
          <Text style={styles.toggleButtonText}>
            Realtime habilitado: {draft.realtimeEnabled ? "sim" : "nao"}
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Janela de silencio (0-23)</Text>
        <TextInput
          testID="pref-quiet-start"
          value={draft.quietHoursStart}
          onChangeText={(value) => setDraft((current) => ({ ...current, quietHoursStart: value }))}
          keyboardType="number-pad"
          placeholder="hora inicio"
          placeholderTextColor="#64748B"
          style={styles.input}
        />
        <TextInput
          testID="pref-quiet-end"
          value={draft.quietHoursEnd}
          onChangeText={(value) => setDraft((current) => ({ ...current, quietHoursEnd: value }))}
          keyboardType="number-pad"
          placeholder="hora fim"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <Text style={styles.sectionTitle}>Frequencia maxima por hora</Text>
        <TextInput
          testID="pref-max-per-hour"
          value={draft.maxNotificationsPerHour}
          onChangeText={(value) =>
            setDraft((current) => ({ ...current, maxNotificationsPerHour: value }))
          }
          keyboardType="number-pad"
          placeholder="20"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <Pressable
          testID="pref-save"
          disabled={saving}
          onPress={() => void handleSave()}
          style={[styles.secondaryButton, saving ? styles.disabledButton : null]}
        >
          <Text style={styles.secondaryButtonText}>{saving ? "Salvando..." : "Salvar preferencias"}</Text>
        </Pressable>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}

        <Link
          href={{
            pathname: "/paciente/inbox",
            params: { token: patientAccessToken },
          }}
          style={styles.backLink}
        >
          <Text style={styles.backLink}>Voltar para inbox</Text>
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
    backgroundColor: "#DBEAFE",
    color: "#1D4ED8",
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
  toggleButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  toggleButtonText: {
    color: "#1E293B",
    fontWeight: "700",
    fontSize: 13,
  },
  secondaryButton: {
    borderRadius: 10,
    backgroundColor: "#0369A1",
    paddingVertical: 11,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.6,
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

