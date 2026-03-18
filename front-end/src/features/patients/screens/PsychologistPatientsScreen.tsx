import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuthStore } from "../../auth/hooks/useAuthStore";
import {
  createPatientsApiClient,
  type PatientsApiClient,
} from "../api/patientsApiClient";
import type {
  PatientContactChannel,
  PatientContactPeriod,
  PatientCreatePayload,
  PatientDetail,
  PatientListItem,
  PatientSortBy,
  PatientUpdatePayload,
  SortOrder,
} from "../api/types";
import { buildWhatsappShortcut } from "../domain/whatsappShortcut";

const patientsApiClient = createPatientsApiClient();

interface PsychologistPatientsScreenProps {
  apiClient?: PatientsApiClient;
}

interface PatientFormState {
  fullName: string;
  preferredName: string;
  email: string;
  phone: string;
  birthDate: string;
  pronouns: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  preferredContactChannel: PatientContactChannel;
  preferredContactPeriod: "" | PatientContactPeriod;
  communicationNotes: string;
}

const EMPTY_FORM: PatientFormState = {
  fullName: "",
  preferredName: "",
  email: "",
  phone: "",
  birthDate: "",
  pronouns: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  preferredContactChannel: "whatsapp",
  preferredContactPeriod: "",
  communicationNotes: "",
};

function toFormState(patient: PatientDetail): PatientFormState {
  return {
    fullName: patient.fullName,
    preferredName: patient.preferredName ?? "",
    email: patient.email ?? "",
    phone: patient.phone ?? "",
    birthDate: patient.birthDate ?? "",
    pronouns: patient.pronouns ?? "",
    emergencyContactName: patient.emergencyContactName ?? "",
    emergencyContactPhone: patient.emergencyContactPhone ?? "",
    preferredContactChannel: patient.preferredContactChannel,
    preferredContactPeriod: patient.preferredContactPeriod ?? "",
    communicationNotes: patient.communicationNotes ?? "",
  };
}

function toCreatePayload(form: PatientFormState): PatientCreatePayload {
  return {
    fullName: form.fullName,
    preferredName: form.preferredName || undefined,
    email: form.email || undefined,
    phone: form.phone || undefined,
    birthDate: form.birthDate || undefined,
    pronouns: form.pronouns || undefined,
    emergencyContactName: form.emergencyContactName || undefined,
    emergencyContactPhone: form.emergencyContactPhone || undefined,
    preferredContactChannel: form.preferredContactChannel,
    preferredContactPeriod: form.preferredContactPeriod || undefined,
    communicationNotes: form.communicationNotes || undefined,
  };
}

function toUpdatePayload(form: PatientFormState): PatientUpdatePayload {
  return {
    fullName: form.fullName,
    preferredName: form.preferredName || undefined,
    email: form.email || undefined,
    phone: form.phone || undefined,
    birthDate: form.birthDate || undefined,
    pronouns: form.pronouns || undefined,
    emergencyContactName: form.emergencyContactName || undefined,
    emergencyContactPhone: form.emergencyContactPhone || undefined,
    preferredContactChannel: form.preferredContactChannel,
    preferredContactPeriod: form.preferredContactPeriod || undefined,
    communicationNotes: form.communicationNotes || undefined,
  };
}

export function PsychologistPatientsScreen({
  apiClient = patientsApiClient,
}: PsychologistPatientsScreenProps) {
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);

  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | PatientContactChannel>("all");
  const [sortBy, setSortBy] = useState<PatientSortBy>("updated_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [hasWhatsappOnly, setHasWhatsappOnly] = useState(false);

  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<PatientDetail | null>(null);
  const [selectedPatientForm, setSelectedPatientForm] = useState<PatientFormState>(EMPTY_FORM);
  const [changesPreview, setChangesPreview] = useState<string[]>([]);
  const [timelinePreview, setTimelinePreview] = useState<string[]>([]);

  const [createForm, setCreateForm] = useState<PatientFormState>(EMPTY_FORM);
  const [overwriteReason, setOverwriteReason] = useState("");

  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedListItem = useMemo(
    () => patients.find((item) => item.id === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  );

  const loadPatientDetail = useCallback(
    async (patientId: string) => {
      if (accessToken === null) {
        return;
      }
      setDetailLoading(true);
      setError(null);
      try {
        const [detail, changes, events] = await Promise.all([
          apiClient.get(accessToken, patientId),
          apiClient.listChanges(accessToken, patientId, 30),
          apiClient.listTimelineEvents(accessToken, patientId, 30),
        ]);
        setSelectedPatient(detail);
        setSelectedPatientForm(toFormState(detail));
        setChangesPreview(
          changes.map(
            (change) =>
              `${change.changeType} | ${new Date(change.createdAt).toLocaleString("pt-BR")} | ${
                change.changedFields.join(", ") || "sem diffs"
              }`,
          ),
        );
        setTimelinePreview(
          events.map(
            (event) =>
              `${event.eventType} | ${new Date(event.createdAt).toLocaleString("pt-BR")}`,
          ),
        );
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Falha ao carregar perfil do paciente.",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [accessToken, apiClient],
  );

  const loadPatients = useCallback(async () => {
    if (accessToken === null) {
      return;
    }

    setListLoading(true);
    setError(null);
    try {
      const list = await apiClient.list(accessToken, {
        search: search.trim() || undefined,
        preferredContactChannel: channelFilter === "all" ? undefined : channelFilter,
        hasWhatsapp: hasWhatsappOnly ? true : undefined,
        sortBy,
        sortOrder,
      });
      setPatients(list);

      if (list.length === 0) {
        setSelectedPatientId(null);
        setSelectedPatient(null);
        setSelectedPatientForm(EMPTY_FORM);
        setChangesPreview([]);
        setTimelinePreview([]);
        return;
      }

      const stillExists = selectedPatientId ? list.some((item) => item.id === selectedPatientId) : false;
      const nextSelected = stillExists ? selectedPatientId : list[0].id;
      setSelectedPatientId(nextSelected);
      if (nextSelected) {
        await loadPatientDetail(nextSelected);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Falha ao carregar lista de pacientes.",
      );
    } finally {
      setListLoading(false);
    }
  }, [
    accessToken,
    apiClient,
    channelFilter,
    hasWhatsappOnly,
    loadPatientDetail,
    search,
    selectedPatientId,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  const handleSelectPatient = async (patientId: string) => {
    setSelectedPatientId(patientId);
    await loadPatientDetail(patientId);
  };

  const handleCreatePatient = async () => {
    if (accessToken === null) {
      setError("Sessao expirada. Entre novamente.");
      return;
    }
    if (createForm.fullName.trim().length < 3) {
      setError("Nome completo do novo paciente deve ter ao menos 3 caracteres.");
      return;
    }

    setCreating(true);
    setError(null);
    setInfo(null);
    try {
      const created = await apiClient.create(accessToken, toCreatePayload(createForm));
      setInfo("Paciente criado com sucesso.");
      setCreateForm(EMPTY_FORM);
      await loadPatients();
      setSelectedPatientId(created.id);
      await loadPatientDetail(created.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha ao criar paciente.");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveProfile = async (overwrite: boolean) => {
    if (accessToken === null || selectedPatientId === null) {
      setError("Selecione um paciente para editar.");
      return;
    }
    if (selectedPatientForm.fullName.trim().length < 3) {
      setError("Nome completo do paciente deve ter ao menos 3 caracteres.");
      return;
    }
    if (overwrite && overwriteReason.trim().length === 0) {
      setError("Sobrescrita exige justificativa.");
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const payload: PatientUpdatePayload = {
        ...toUpdatePayload(selectedPatientForm),
        overwriteInitialRegistration: overwrite,
        overwriteReason: overwrite ? overwriteReason.trim() : undefined,
      };
      const updated = await apiClient.update(accessToken, selectedPatientId, payload);
      setSelectedPatient(updated);
      setSelectedPatientForm(toFormState(updated));
      setOverwriteReason("");
      setInfo(overwrite ? "Cadastro sobrescrito com historico." : "Perfil atualizado.");
      await loadPatients();
      await loadPatientDetail(selectedPatientId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleArchivePatient = async () => {
    if (accessToken === null || selectedPatientId === null) {
      setError("Selecione um paciente para arquivar.");
      return;
    }
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      await apiClient.archive(accessToken, selectedPatientId);
      setInfo("Paciente arquivado.");
      setSelectedPatientId(null);
      await loadPatients();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha ao arquivar paciente.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenWhatsapp = async () => {
    if (selectedPatient === null) {
      return;
    }
    const shortcut = buildWhatsappShortcut({
      phone: selectedPatient.phone,
      message: `Ola, ${selectedPatient.fullName}. Tudo bem?`,
      fallbackMessage: "Ola! Recebi seu contato e quero alinhar o proximo passo.",
    });
    await Linking.openURL(shortcut.url);
    setInfo(shortcut.isFallback ? "Atalho abriu fallback de WhatsApp." : "Atalho WhatsApp aberto.");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>Pacientes</Text>
        <Text style={styles.title}>Gestao de Pacientes</Text>
        <Text style={styles.subtitle}>Lista, perfil, sobrescrita e trilha de alteracoes.</Text>

        <Text style={styles.label}>Busca</Text>
        <TextInput
          testID="patients-search-input"
          value={search}
          onChangeText={setSearch}
          placeholder="Nome, email ou telefone"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <View style={styles.filtersRow}>
          <Pressable
            accessibilityRole="button"
            testID="patients-filter-all"
            onPress={() => setChannelFilter("all")}
            style={[styles.chip, channelFilter === "all" ? styles.chipActive : null]}
          >
            <Text style={[styles.chipText, channelFilter === "all" ? styles.chipTextActive : null]}>
              Todos
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="patients-filter-whatsapp"
            onPress={() => setChannelFilter("whatsapp")}
            style={[styles.chip, channelFilter === "whatsapp" ? styles.chipActive : null]}
          >
            <Text
              style={[styles.chipText, channelFilter === "whatsapp" ? styles.chipTextActive : null]}
            >
              WhatsApp
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="patients-filter-email"
            onPress={() => setChannelFilter("email")}
            style={[styles.chip, channelFilter === "email" ? styles.chipActive : null]}
          >
            <Text style={[styles.chipText, channelFilter === "email" ? styles.chipTextActive : null]}>
              Email
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="patients-sort-full-name"
            onPress={() => setSortBy("full_name")}
            style={[styles.chip, sortBy === "full_name" ? styles.chipActive : null]}
          >
            <Text style={[styles.chipText, sortBy === "full_name" ? styles.chipTextActive : null]}>
              Nome
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="patients-sort-order"
            onPress={() => setSortOrder((current) => (current === "asc" ? "desc" : "asc"))}
            style={styles.chip}
          >
            <Text style={styles.chipText}>{sortOrder === "asc" ? "ASC" : "DESC"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="patients-whatsapp-only"
            onPress={() => setHasWhatsappOnly((current) => !current)}
            style={[styles.chip, hasWhatsappOnly ? styles.chipActive : null]}
          >
            <Text style={[styles.chipText, hasWhatsappOnly ? styles.chipTextActive : null]}>
              So WhatsApp valido
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="patients-refresh"
            onPress={() => void loadPatients()}
            style={styles.refreshButton}
          >
            <Text style={styles.refreshButtonText}>Aplicar filtros</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Novo Paciente</Text>
        <TextInput
          testID="patients-create-full-name"
          value={createForm.fullName}
          onChangeText={(value) => setCreateForm((current) => ({ ...current, fullName: value }))}
          placeholder="Nome completo"
          placeholderTextColor="#64748B"
          style={styles.input}
        />
        <TextInput
          testID="patients-create-phone"
          value={createForm.phone}
          onChangeText={(value) => setCreateForm((current) => ({ ...current, phone: value }))}
          placeholder="Telefone"
          placeholderTextColor="#64748B"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          testID="patients-create-submit"
          disabled={creating}
          onPress={() => void handleCreatePatient()}
          style={[styles.primaryButton, creating ? styles.disabledButton : null]}
        >
          <Text style={styles.primaryButtonText}>{creating ? "Criando..." : "Criar paciente"}</Text>
        </Pressable>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}

        <Text style={styles.sectionTitle}>Lista de Pacientes</Text>
        {listLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#0F766E" />
            <Text style={styles.loadingText}>Carregando pacientes...</Text>
          </View>
        ) : patients.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum paciente encontrado.</Text>
        ) : (
          patients.map((patient) => (
            <Pressable
              accessibilityRole="button"
              key={patient.id}
              testID={`patients-list-item-${patient.id}`}
              onPress={() => void handleSelectPatient(patient.id)}
              style={[
                styles.patientItem,
                selectedPatientId === patient.id ? styles.patientItemSelected : null,
              ]}
            >
              <Text style={styles.patientName}>{patient.fullName}</Text>
              <Text style={styles.patientMeta}>
                canal: {patient.preferredContactChannel} | perfil: {patient.profileSource}
              </Text>
              <Text style={styles.patientMeta}>
                atualizado: {new Date(patient.updatedAt).toLocaleString("pt-BR")}
              </Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionTitle}>Perfil do Paciente</Text>
        {detailLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#0F766E" />
            <Text style={styles.loadingText}>Carregando perfil...</Text>
          </View>
        ) : selectedPatient === null ? (
          <Text style={styles.emptyText}>Selecione um paciente para ver o perfil.</Text>
        ) : (
          <View style={styles.profileBox}>
            <Text style={styles.patientMeta}>ID: {selectedPatient.id}</Text>
            <Text style={styles.patientMeta}>Tenant: {selectedPatient.tenantId}</Text>
            <Text style={styles.patientMeta}>
              WhatsApp direto: {selectedPatient.whatsappNumberValid ? "Valido" : "Invalido"}
            </Text>

            <TextInput
              testID="patients-profile-full-name"
              value={selectedPatientForm.fullName}
              onChangeText={(value) =>
                setSelectedPatientForm((current) => ({ ...current, fullName: value }))
              }
              placeholder="Nome completo"
              placeholderTextColor="#64748B"
              style={styles.input}
            />
            <TextInput
              testID="patients-profile-preferred-name"
              value={selectedPatientForm.preferredName}
              onChangeText={(value) =>
                setSelectedPatientForm((current) => ({ ...current, preferredName: value }))
              }
              placeholder="Nome preferido"
              placeholderTextColor="#64748B"
              style={styles.input}
            />
            <TextInput
              testID="patients-profile-email"
              value={selectedPatientForm.email}
              onChangeText={(value) =>
                setSelectedPatientForm((current) => ({ ...current, email: value }))
              }
              placeholder="Email"
              placeholderTextColor="#64748B"
              style={styles.input}
            />
            <TextInput
              testID="patients-profile-phone"
              value={selectedPatientForm.phone}
              onChangeText={(value) =>
                setSelectedPatientForm((current) => ({ ...current, phone: value }))
              }
              placeholder="Telefone"
              placeholderTextColor="#64748B"
              style={styles.input}
            />

            <View style={styles.chipsRow}>
              <ContactChannelChip
                active={selectedPatientForm.preferredContactChannel === "whatsapp"}
                label="WhatsApp"
                onPress={() =>
                  setSelectedPatientForm((current) => ({
                    ...current,
                    preferredContactChannel: "whatsapp",
                  }))
                }
              />
              <ContactChannelChip
                active={selectedPatientForm.preferredContactChannel === "email"}
                label="Email"
                onPress={() =>
                  setSelectedPatientForm((current) => ({
                    ...current,
                    preferredContactChannel: "email",
                  }))
                }
              />
              <ContactChannelChip
                active={selectedPatientForm.preferredContactChannel === "phone"}
                label="Telefone"
                onPress={() =>
                  setSelectedPatientForm((current) => ({
                    ...current,
                    preferredContactChannel: "phone",
                  }))
                }
              />
            </View>

            <TextInput
              testID="patients-overwrite-reason"
              value={overwriteReason}
              onChangeText={setOverwriteReason}
              placeholder="Justificativa da sobrescrita"
              placeholderTextColor="#64748B"
              style={[styles.input, styles.multilineInput]}
              multiline
            />

            <View style={styles.actionsRow}>
              <Pressable
                accessibilityRole="button"
                testID="patients-save"
                disabled={saving}
                onPress={() => void handleSaveProfile(false)}
                style={[styles.secondaryButton, saving ? styles.disabledButton : null]}
              >
                <Text style={styles.secondaryButtonText}>Salvar perfil</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                testID="patients-overwrite-save"
                disabled={saving}
                onPress={() => void handleSaveProfile(true)}
                style={[styles.warningButton, saving ? styles.disabledButton : null]}
              >
                <Text style={styles.warningButtonText}>Sobrescrever cadastro inicial</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                testID="patients-whatsapp-button"
                onPress={() => void handleOpenWhatsapp()}
                style={styles.successButton}
              >
                <Text style={styles.successButtonText}>Atalho WhatsApp</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                testID="patients-archive"
                onPress={() => void handleArchivePatient()}
                style={[styles.dangerButton, saving ? styles.disabledButton : null]}
              >
                <Text style={styles.dangerButtonText}>Arquivar paciente</Text>
              </Pressable>
            </View>

            <Text style={styles.timelineTitle}>Trilha de alteracoes</Text>
            {changesPreview.length === 0 ? (
              <Text style={styles.emptyText}>Sem alteracoes registradas.</Text>
            ) : (
              changesPreview.map((entry) => (
                <Text key={`change-${entry}`} style={styles.timelineEntry}>
                  {entry}
                </Text>
              ))
            )}

            <Text style={styles.timelineTitle}>Timeline cadastral</Text>
            {timelinePreview.length === 0 ? (
              <Text style={styles.emptyText}>Sem eventos de timeline para este paciente.</Text>
            ) : (
              timelinePreview.map((entry) => (
                <Text key={`event-${entry}`} style={styles.timelineEntry}>
                  {entry}
                </Text>
              ))
            )}
          </View>
        )}

        {selectedListItem ? (
          <Text style={styles.footerMeta}>Selecionado: {selectedListItem.fullName}</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function ContactChannelChip({
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
      style={[styles.channelChip, active ? styles.channelChipActive : null]}
    >
      <Text style={[styles.channelChipText, active ? styles.channelChipTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: "#EEF7FA",
  },
  card: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 18,
    gap: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    backgroundColor: "#E0E7FF",
    color: "#3730A3",
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
  multilineInput: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  filtersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chipsRow: {
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
    borderColor: "#1D4ED8",
    backgroundColor: "#DBEAFE",
  },
  chipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#1E3A8A",
  },
  refreshButton: {
    borderRadius: 10,
    backgroundColor: "#0F766E",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
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
    paddingHorizontal: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  successButton: {
    borderRadius: 10,
    backgroundColor: "#166534",
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  successButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  warningButton: {
    borderRadius: 10,
    backgroundColor: "#B45309",
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  warningButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  dangerButton: {
    borderRadius: 10,
    backgroundColor: "#B91C1C",
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  dangerButtonText: {
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
  patientItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F8FAFC",
    padding: 10,
    gap: 3,
  },
  patientItemSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  patientName: {
    color: "#0F172A",
    fontWeight: "700",
    fontSize: 14,
  },
  patientMeta: {
    color: "#334155",
    fontSize: 12,
  },
  profileBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#F8FBFF",
    padding: 10,
    gap: 8,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  timelineTitle: {
    marginTop: 4,
    color: "#1E3A8A",
    fontWeight: "700",
    fontSize: 13,
  },
  timelineEntry: {
    color: "#1E40AF",
    fontSize: 12,
  },
  channelChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#94A3B8",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  channelChipActive: {
    borderColor: "#0F766E",
    backgroundColor: "#CCFBF1",
  },
  channelChipText: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 12,
  },
  channelChipTextActive: {
    color: "#0F766E",
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
  footerMeta: {
    marginTop: 6,
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
  },
});
