import { Link } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuthStore } from "../../auth/hooks/useAuthStore";
import {
  createPatientsApiClient,
  type PatientsApiClient,
} from "../../patients/api/patientsApiClient";
import type { PatientListItem } from "../../patients/api/types";
import {
  createNotificationsApiClient,
  NotificationsApiError,
  type NotificationsApiClient,
} from "../api/notificationsApiClient";
import type {
  NotificationDelivery,
  NotificationPreferences,
  UnifiedTimelineEvent,
} from "../api/types";

const notificationsApiClient = createNotificationsApiClient();
const patientsApiClient = createPatientsApiClient();

interface PsychologistTimelineScreenProps {
  apiClient?: NotificationsApiClient;
  patientsClient?: PatientsApiClient;
}

const TIMELINE_FILTERS = [
  "sessions",
  "activities",
  "forms",
  "documents",
  "notifications",
  "app_usage",
] as const;

export function PsychologistTimelineScreen({
  apiClient = notificationsApiClient,
  patientsClient = patientsApiClient,
}: PsychologistTimelineScreenProps) {
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);

  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [timeline, setTimeline] = useState<UnifiedTimelineEvent[]>([]);
  const [deliveries, setDeliveries] = useState<NotificationDelivery[]>([]);
  const [patientPreferences, setPatientPreferences] = useState<NotificationPreferences | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, boolean>>({
    sessions: true,
    activities: true,
    forms: true,
    documents: true,
    notifications: true,
    app_usage: true,
  });
  const [documentId, setDocumentId] = useState("doc-001");
  const [documentTitle, setDocumentTitle] = useState("Documento clinico compartilhado");
  const [loading, setLoading] = useState(false);
  const [sharingDocument, setSharingDocument] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedCategories = useMemo(() => {
    return TIMELINE_FILTERS.filter((item) => selectedFilters[item]);
  }, [selectedFilters]);

  const loadTimeline = useCallback(async () => {
    if (accessToken === null || selectedPatientId.trim().length === 0) {
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const [timelinePayload, notificationsPayload, prefs] = await Promise.all([
        apiClient.listUnifiedTimeline(accessToken, selectedPatientId, {
          categories: selectedCategories,
          limit: 250,
        }),
        apiClient.listPatientNotifications(accessToken, selectedPatientId, 250),
        apiClient.getPatientPreferences(accessToken, selectedPatientId),
      ]);
      setTimeline(timelinePayload);
      setDeliveries(notificationsPayload);
      setPatientPreferences(prefs);
      setInfo("Timeline consolidada carregada.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao carregar timeline do paciente.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, apiClient, selectedCategories, selectedPatientId]);

  const loadPatients = useCallback(async () => {
    if (accessToken === null) {
      return;
    }
    setError(null);
    try {
      const list = await patientsClient.list(accessToken);
      setPatients(list);
      if (list.length > 0 && selectedPatientId.trim().length === 0) {
        setSelectedPatientId(list[0].id);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Falha ao listar pacientes.",
      );
    }
  }, [accessToken, patientsClient, selectedPatientId]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    if (selectedPatientId.trim().length > 0) {
      void loadTimeline();
    }
  }, [loadTimeline, selectedPatientId]);

  const toggleFilter = (filter: (typeof TIMELINE_FILTERS)[number]) => {
    setSelectedFilters((current) => ({
      ...current,
      [filter]: !current[filter],
    }));
  };

  const handleShareDocument = async () => {
    if (accessToken === null || selectedPatientId.trim().length === 0) {
      return;
    }
    if (documentId.trim().length < 2 || documentTitle.trim().length < 2) {
      setError("Documento exige identificador e titulo validos.");
      return;
    }
    setSharingDocument(true);
    setError(null);
    setInfo(null);
    try {
      await apiClient.shareDocument(accessToken, selectedPatientId, documentId.trim(), {
        documentTitle: documentTitle.trim(),
      });
      setInfo("Documento compartilhado e registrado na timeline.");
      await loadTimeline();
    } catch (requestError) {
      setError(
        requestError instanceof NotificationsApiError
          ? requestError.message
          : "Falha ao compartilhar documento.",
      );
    } finally {
      setSharingDocument(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>Psicologo</Text>
        <Text style={styles.title}>Timeline Individual Unificada</Text>
        <Text style={styles.subtitle}>
          Filtros por categoria e rastreio de notificacoes por paciente.
        </Text>

        <Text style={styles.sectionTitle}>Paciente</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {patients.map((patient) => (
            <Pressable
              key={patient.id}
              testID={`timeline-patient-${patient.id}`}
              onPress={() => setSelectedPatientId(patient.id)}
              style={[
                styles.chip,
                selectedPatientId === patient.id ? styles.chipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedPatientId === patient.id ? styles.chipTextActive : null,
                ]}
              >
                {patient.fullName}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>Filtros de timeline</Text>
        <View style={styles.filtersRow}>
          {TIMELINE_FILTERS.map((filter) => (
            <Pressable
              key={filter}
              testID={`timeline-filter-${filter}`}
              onPress={() => toggleFilter(filter)}
              style={[
                styles.filterButton,
                selectedFilters[filter] ? styles.filterButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  selectedFilters[filter] ? styles.filterButtonTextActive : null,
                ]}
              >
                {filter}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable testID="timeline-load" onPress={() => void loadTimeline()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>
            {loading ? "Carregando..." : "Atualizar timeline"}
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Documentos v1</Text>
        <TextInput
          testID="timeline-document-id"
          value={documentId}
          onChangeText={setDocumentId}
          placeholder="doc-001"
          placeholderTextColor="#64748B"
          style={styles.input}
        />
        <TextInput
          testID="timeline-document-title"
          value={documentTitle}
          onChangeText={setDocumentTitle}
          placeholder="Titulo do documento"
          placeholderTextColor="#64748B"
          style={styles.input}
        />
        <Pressable
          testID="timeline-share-document"
          disabled={sharingDocument || selectedPatientId.length === 0}
          onPress={() => void handleShareDocument()}
          style={[styles.secondaryButton, sharingDocument ? styles.disabledButton : null]}
        >
          <Text style={styles.secondaryButtonText}>
            {sharingDocument ? "Compartilhando..." : "Compartilhar documento"}
          </Text>
        </Pressable>

        {patientPreferences ? (
          <Text style={styles.metaText}>
            Preferencias do paciente: max/h {patientPreferences.maxNotificationsPerHour} | fonte{" "}
            {patientPreferences.source}
          </Text>
        ) : null}

        <Text style={styles.sectionTitle}>Eventos da timeline</Text>
        {timeline.length === 0 ? (
          <Text style={styles.emptyText}>Sem eventos para os filtros atuais.</Text>
        ) : (
          timeline.map((event) => (
            <View key={event.id} style={styles.timelineEntry}>
              <Text style={styles.timelineTitle}>
                {event.category} | {event.eventType}
              </Text>
              <Text style={styles.timelineMeta}>
                {new Date(event.createdAt).toLocaleString("pt-BR")} | {event.actorType}
              </Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Tracking de notificacoes</Text>
        {deliveries.length === 0 ? (
          <Text style={styles.emptyText}>Sem notificacoes rastreadas para este paciente.</Text>
        ) : (
          deliveries.map((delivery) => (
            <View key={delivery.id} style={styles.notificationEntry}>
              <Text style={styles.notificationTitle}>{delivery.title}</Text>
              <Text style={styles.notificationMeta}>
                {delivery.status} | {delivery.category} | {new Date(delivery.createdAt).toLocaleString("pt-BR")}
              </Text>
            </View>
          ))
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}

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
    backgroundColor: "#EFF6FF",
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
    fontSize: 23,
    fontWeight: "800",
  },
  subtitle: {
    color: "#334155",
    fontSize: 13,
  },
  sectionTitle: {
    marginTop: 8,
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "800",
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipActive: {
    borderColor: "#1D4ED8",
    backgroundColor: "#1E40AF",
  },
  chipText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  filtersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  filterButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterButtonActive: {
    borderColor: "#0E7490",
    backgroundColor: "#0E7490",
  },
  filterButtonText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  filterButtonTextActive: {
    color: "#FFFFFF",
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
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    color: "#0F172A",
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  metaText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
  },
  timelineEntry: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#F8FAFF",
    padding: 10,
    gap: 2,
  },
  timelineTitle: {
    color: "#1E3A8A",
    fontWeight: "700",
    fontSize: 13,
  },
  timelineMeta: {
    color: "#334155",
    fontSize: 12,
  },
  notificationEntry: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BAE6FD",
    backgroundColor: "#ECFEFF",
    padding: 10,
    gap: 2,
  },
  notificationTitle: {
    color: "#155E75",
    fontWeight: "700",
    fontSize: 13,
  },
  notificationMeta: {
    color: "#0F172A",
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

