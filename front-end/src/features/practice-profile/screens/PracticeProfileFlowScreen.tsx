import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuthStore } from "../../auth/hooks/useAuthStore";
import { authStore } from "../../auth/store/authStore";
import { psychologistRoutes } from "../../navigation/guards";
import {
  createPracticeProfileApiClient,
  PracticeProfileApiError,
  type PracticeProfileApiClient,
} from "../api/practiceProfileApiClient";
import type { PracticeProfileDraft, PracticeProfileStepId } from "../domain/onboardingDraft";
import {
  createInitialPracticeProfileDraft,
  draftFromPracticeProfile,
  getFirstInvalidStepIndex,
  onboardingSteps,
  toPracticeProfileUpsertPayload,
  validateDraftForStep,
  validateFullDraft,
} from "../domain/onboardingDraft";

type PracticeProfileFlowMode = "onboarding" | "settings";

interface PracticeProfileFlowScreenProps {
  mode: PracticeProfileFlowMode;
  apiClient?: PracticeProfileApiClient;
}

const defaultPracticeProfileApiClient = createPracticeProfileApiClient();

export function PracticeProfileFlowScreen({ mode, apiClient }: PracticeProfileFlowScreenProps) {
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const [draft, setDraft] = useState<PracticeProfileDraft>(createInitialPracticeProfileDraft());
  const [stepIndex, setStepIndex] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof PracticeProfileDraft, string>>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const currentStep = onboardingSteps[stepIndex];
  const currentStepValidation = useMemo(
    () => validateDraftForStep(draft, currentStep.id),
    [draft, currentStep.id],
  );
  const client = apiClient ?? defaultPracticeProfileApiClient;

  useEffect(() => {
    if (mode === "onboarding" && onboardingCompleted) {
      router.replace(psychologistRoutes.session);
    }
  }, [mode, onboardingCompleted, router]);

  useEffect(() => {
    if (accessToken === null) {
      setInitialized(true);
      return;
    }

    let cancelled = false;
    const loadProfile = async () => {
      setLoading(true);
      setGlobalError(null);
      setInfoMessage(null);

      try {
        const profile = await client.get(accessToken);
        if (cancelled) {
          return;
        }
        setDraft(draftFromPracticeProfile(profile));
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof PracticeProfileApiError && error.statusCode === 404) {
          if (mode === "settings") {
            setInfoMessage("Configuracao ainda nao criada. Salve os dados para iniciar.");
          }
        } else {
          setGlobalError(
            error instanceof Error
              ? error.message
              : "Falha ao carregar configuracao da clinica.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [accessToken, client, mode]);

  const updateDraft = <TKey extends keyof PracticeProfileDraft>(
    field: TKey,
    value: PracticeProfileDraft[TKey],
  ) => {
    setDraft((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const clearTransientMessages = () => {
    setGlobalError(null);
    setSuccessMessage(null);
  };

  const handleNext = () => {
    clearTransientMessages();
    const stepValidation = validateDraftForStep(draft, currentStep.id);
    if (!stepValidation.isValid) {
      setFieldErrors(stepValidation.fieldErrors);
      return;
    }

    setFieldErrors({});
    if (stepIndex < onboardingSteps.length - 1) {
      setStepIndex((previous) => previous + 1);
    }
  };

  const handleBack = () => {
    clearTransientMessages();
    setFieldErrors({});
    if (stepIndex > 0) {
      setStepIndex((previous) => previous - 1);
    }
  };

  const handleSave = async () => {
    clearTransientMessages();
    if (accessToken === null) {
      setGlobalError("Sessao expirada. Entre novamente.");
      return;
    }

    const validation = validateFullDraft(draft);
    if (!validation.isValid) {
      setFieldErrors(validation.fieldErrors);
      const firstInvalidStep = getFirstInvalidStepIndex(draft);
      if (firstInvalidStep !== null) {
        setStepIndex(firstInvalidStep);
      }
      return;
    }

    const payload = toPracticeProfileUpsertPayload(draft);
    if (payload === null) {
      setGlobalError("Falha ao consolidar payload de onboarding.");
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    try {
      const savedProfile = await client.upsert(accessToken, payload);
      setDraft(draftFromPracticeProfile(savedProfile));
      await authStore.actions.setOnboardingCompleted(savedProfile.onboardingCompleted);

      if (mode === "onboarding" && savedProfile.onboardingCompleted) {
        router.replace(psychologistRoutes.session);
        return;
      }

      setSuccessMessage("Configuracoes salvas com sucesso.");
    } catch (error) {
      setGlobalError(
        error instanceof Error ? error.message : "Falha ao salvar configuracao da clinica.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === "onboarding" ? "Onboarding da Clinica" : "Configuracoes da Clinica";
  const badge = mode === "onboarding" ? "Onboarding Psicologo" : "Configuracoes";
  const submitLabel =
    mode === "onboarding" ? "Concluir onboarding" : "Salvar configuracoes";

  if (!initialized || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0F766E" />
        <Text style={styles.loadingText}>Carregando configuracao da clinica...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>{badge}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{currentStep.subtitle}</Text>

        <View style={styles.stepMeta}>
          <Text style={styles.stepCounter} testID="onboarding-step-counter">
            Etapa {stepIndex + 1} de {onboardingSteps.length}
          </Text>
          <Text style={styles.stepTitle}>{currentStep.title}</Text>
        </View>

        {mode === "settings" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace(psychologistRoutes.session)}
            style={styles.linkButton}
          >
            <Text style={styles.linkButtonText}>Voltar para sessao</Text>
          </Pressable>
        ) : null}

        {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}
        {globalError ? <Text style={styles.errorText}>{globalError}</Text> : null}
        {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}

        {renderStepContent({
          stepId: currentStep.id,
          draft,
          updateDraft,
          fieldErrors,
        })}

        <View style={styles.navigationRow}>
          <Pressable
            accessibilityRole="button"
            disabled={stepIndex === 0 || submitting}
            onPress={handleBack}
            style={[styles.secondaryButton, stepIndex === 0 || submitting ? styles.disabled : null]}
            testID="onboarding-back"
          >
            <Text style={styles.secondaryButtonText}>Voltar</Text>
          </Pressable>

          {stepIndex < onboardingSteps.length - 1 ? (
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={handleNext}
              style={[styles.primaryButton, submitting ? styles.disabled : null]}
              testID="onboarding-next"
            >
              <Text style={styles.primaryButtonText}>Proxima etapa</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={handleSave}
              style={[styles.primaryButton, submitting ? styles.disabled : null]}
              testID="onboarding-submit"
            >
              <Text style={styles.primaryButtonText}>
                {submitting ? "Salvando..." : submitLabel}
              </Text>
            </Pressable>
          )}
        </View>

        {!currentStepValidation.isValid ? (
          <Text style={styles.blockText}>Preencha os campos obrigatorios para avancar.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function renderStepContent({
  stepId,
  draft,
  updateDraft,
  fieldErrors,
}: {
  stepId: PracticeProfileStepId;
  draft: PracticeProfileDraft;
  updateDraft: <TKey extends keyof PracticeProfileDraft>(
    field: TKey,
    value: PracticeProfileDraft[TKey],
  ) => void;
  fieldErrors: Partial<Record<keyof PracticeProfileDraft, string>>;
}) {
  if (stepId === "identity") {
    return (
      <View style={styles.formSection}>
        <Text style={styles.label}>Nome da clinica</Text>
        <TextInput
          onChangeText={(value) => updateDraft("practiceName", value)}
          placeholder="Clinica Aurora"
          placeholderTextColor="#6B7280"
          style={styles.input}
          testID="onboarding-practice-name"
          value={draft.practiceName}
        />
        {fieldErrors.practiceName ? <Text style={styles.errorText}>{fieldErrors.practiceName}</Text> : null}

        <Text style={styles.label}>Abordagem clinica</Text>
        <TextInput
          onChangeText={(value) => updateDraft("clinicalApproach", value)}
          placeholder="Terapia cognitivo-comportamental"
          placeholderTextColor="#6B7280"
          style={styles.input}
          testID="onboarding-clinical-approach"
          value={draft.clinicalApproach}
        />
        {fieldErrors.clinicalApproach ? (
          <Text style={styles.errorText}>{fieldErrors.clinicalApproach}</Text>
        ) : null}
      </View>
    );
  }

  if (stepId === "modality") {
    return (
      <View style={styles.formSection}>
        <Text style={styles.label}>Modalidade de atendimento</Text>
        <View style={styles.chipRow}>
          <SelectChip
            active={draft.serviceModality === "online"}
            label="Online"
            onPress={() => updateDraft("serviceModality", "online")}
            testID="onboarding-service-modality-online"
          />
          <SelectChip
            active={draft.serviceModality === "presential"}
            label="Presencial"
            onPress={() => updateDraft("serviceModality", "presential")}
            testID="onboarding-service-modality-presential"
          />
          <SelectChip
            active={draft.serviceModality === "hybrid"}
            label="Hibrido"
            onPress={() => updateDraft("serviceModality", "hybrid")}
            testID="onboarding-service-modality-hybrid"
          />
        </View>

        {draft.serviceModality !== "online" ? (
          <>
            <Text style={styles.label}>Endereco presencial</Text>
            <TextInput
              onChangeText={(value) => updateDraft("inPersonAddress", value)}
              placeholder="Rua, numero, complemento"
              placeholderTextColor="#6B7280"
              style={styles.input}
              testID="onboarding-in-person-address"
              value={draft.inPersonAddress}
            />
            {fieldErrors.inPersonAddress ? (
              <Text style={styles.errorText}>{fieldErrors.inPersonAddress}</Text>
            ) : null}
          </>
        ) : null}
      </View>
    );
  }

  if (stepId === "financial") {
    return (
      <View style={styles.formSection}>
        <Text style={styles.label}>Valor base da sessao (BRL)</Text>
        <TextInput
          keyboardType="decimal-pad"
          onChangeText={(value) => updateDraft("sessionPriceReais", value)}
          placeholder="250.00"
          placeholderTextColor="#6B7280"
          style={styles.input}
          testID="onboarding-session-price"
          value={draft.sessionPriceReais}
        />
        {fieldErrors.sessionPriceReais ? (
          <Text style={styles.errorText}>{fieldErrors.sessionPriceReais}</Text>
        ) : null}
      </View>
    );
  }

  if (stepId === "absence_policy") {
    return (
      <View style={styles.formSection}>
        <Text style={styles.label}>Janela de cancelamento tardio (horas)</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={(value) => updateDraft("lateCancellationWindowHours", value)}
          placeholder="24"
          placeholderTextColor="#6B7280"
          style={styles.input}
          testID="onboarding-late-window"
          value={draft.lateCancellationWindowHours}
        />
        {fieldErrors.lateCancellationWindowHours ? (
          <Text style={styles.errorText}>{fieldErrors.lateCancellationWindowHours}</Text>
        ) : null}

        <Text style={styles.label}>Taxa de cancelamento tardio (%)</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={(value) => updateDraft("lateCancellationFeePercent", value)}
          placeholder="40"
          placeholderTextColor="#6B7280"
          style={styles.input}
          testID="onboarding-late-fee"
          value={draft.lateCancellationFeePercent}
        />
        {fieldErrors.lateCancellationFeePercent ? (
          <Text style={styles.errorText}>{fieldErrors.lateCancellationFeePercent}</Text>
        ) : null}

        <Text style={styles.label}>Taxa de falta (% no-show)</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={(value) => updateDraft("noShowFeePercent", value)}
          placeholder="80"
          placeholderTextColor="#6B7280"
          style={styles.input}
          testID="onboarding-no-show-fee"
          value={draft.noShowFeePercent}
        />
        {fieldErrors.noShowFeePercent ? (
          <Text style={styles.errorText}>{fieldErrors.noShowFeePercent}</Text>
        ) : null}
      </View>
    );
  }

  if (stepId === "notifications") {
    return (
      <View style={styles.formSection}>
        <Text style={styles.label}>Canais ativos</Text>
        <View style={styles.chipRow}>
          <SelectChip
            active={draft.notificationEmailEnabled}
            label="Email"
            onPress={() => updateDraft("notificationEmailEnabled", !draft.notificationEmailEnabled)}
            testID="onboarding-channel-email"
          />
          <SelectChip
            active={draft.notificationWhatsappEnabled}
            label="WhatsApp"
            onPress={() =>
              updateDraft("notificationWhatsappEnabled", !draft.notificationWhatsappEnabled)
            }
            testID="onboarding-channel-whatsapp"
          />
          <SelectChip
            active={draft.notificationPushEnabled}
            label="Push"
            onPress={() => updateDraft("notificationPushEnabled", !draft.notificationPushEnabled)}
            testID="onboarding-channel-push"
          />
        </View>
        {fieldErrors.notificationEmailEnabled ? (
          <Text style={styles.errorText}>{fieldErrors.notificationEmailEnabled}</Text>
        ) : null}

        <Text style={styles.label}>Lembretes (horas antes, separados por virgula)</Text>
        <TextInput
          onChangeText={(value) => updateDraft("sessionReminderHoursBefore", value)}
          placeholder="48,24,2"
          placeholderTextColor="#6B7280"
          style={styles.input}
          testID="onboarding-reminders"
          value={draft.sessionReminderHoursBefore}
        />
        {fieldErrors.sessionReminderHoursBefore ? (
          <Text style={styles.errorText}>{fieldErrors.sessionReminderHoursBefore}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.formSection}>
      <Text style={styles.label}>Modo de triagem padrao</Text>
      <View style={styles.chipRow}>
        <SelectChip
          active={draft.defaultTriageMode === "standard"}
          label="Standard"
          onPress={() => updateDraft("defaultTriageMode", "standard")}
          testID="onboarding-triage-standard"
        />
        <SelectChip
          active={draft.defaultTriageMode === "custom"}
          label="Custom"
          onPress={() => updateDraft("defaultTriageMode", "custom")}
          testID="onboarding-triage-custom"
        />
      </View>

      {draft.defaultTriageMode === "custom" ? (
        <>
          <Text style={styles.label}>Mensagem default da triagem</Text>
          <TextInput
            multiline
            numberOfLines={4}
            onChangeText={(value) => updateDraft("defaultTriageMessage", value)}
            placeholder="Descreva seu objetivo com a terapia e disponibilidade."
            placeholderTextColor="#6B7280"
            style={[styles.input, styles.multilineInput]}
            testID="onboarding-triage-message"
            value={draft.defaultTriageMessage}
          />
          {fieldErrors.defaultTriageMessage ? (
            <Text style={styles.errorText}>{fieldErrors.defaultTriageMessage}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function SelectChip({
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
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null]}
      testID={testID}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: "#EFF6F8",
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#EFF6F8",
  },
  loadingText: {
    color: "#0F172A",
    fontWeight: "600",
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    backgroundColor: "#D1FAE5",
    color: "#065F46",
    fontWeight: "700",
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 14,
    color: "#334155",
  },
  stepMeta: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1E4EA",
    backgroundColor: "#F8FBFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  stepCounter: {
    color: "#0E7490",
    fontWeight: "700",
    fontSize: 12,
  },
  stepTitle: {
    color: "#0F172A",
    fontWeight: "700",
    fontSize: 16,
  },
  formSection: {
    gap: 8,
  },
  label: {
    marginTop: 4,
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
    minHeight: 90,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#94A3B8",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  chipActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  chipText: {
    color: "#334155",
    fontWeight: "600",
    fontSize: 13,
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  navigationRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#0F766E",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#E2E8F0",
  },
  secondaryButtonText: {
    color: "#0F172A",
    fontWeight: "700",
    fontSize: 14,
  },
  disabled: {
    opacity: 0.5,
  },
  errorText: {
    color: "#B91C1C",
    fontWeight: "600",
    fontSize: 12,
  },
  successText: {
    color: "#166534",
    fontWeight: "600",
    fontSize: 12,
  },
  infoText: {
    color: "#0E7490",
    fontWeight: "600",
    fontSize: 12,
  },
  blockText: {
    color: "#92400E",
    fontWeight: "600",
    fontSize: 12,
  },
  linkButton: {
    alignSelf: "flex-start",
  },
  linkButtonText: {
    color: "#0F766E",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
