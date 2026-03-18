import { Link, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { createTriageApiClient, TriageApiError } from "../../triage/api/triageApiClient";
import type {
  IntakeCustomQuestion,
  IntakePublicView,
  IntakeStatus,
} from "../../triage/api/types";

const triageApiClient = createTriageApiClient();

export function PatientInviteEntryScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const tokenFromQuery = Array.isArray(params.token) ? params.token[0] : params.token;

  const [inviteToken, setInviteToken] = useState(tokenFromQuery ?? "");
  const [inviteData, setInviteData] = useState<IntakePublicView | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [patientFullName, setPatientFullName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [consentTermsAccepted, setConsentTermsAccepted] = useState(false);
  const [consentPrivacyAccepted, setConsentPrivacyAccepted] = useState(false);

  const [loadingInvite, setLoadingInvite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSubmit = useMemo(
    () =>
      inviteData !== null &&
      inviteData.status !== "approved" &&
      inviteData.status !== "rejected" &&
      inviteData.status !== "expired" &&
      patientFullName.trim().length >= 3 &&
      consentTermsAccepted &&
      consentPrivacyAccepted &&
      customQuestionsCompleted(inviteData.customQuestions, answers),
    [inviteData, patientFullName, consentTermsAccepted, consentPrivacyAccepted, answers],
  );

  const loadInviteByToken = useCallback(async (token: string) => {
    setLoadingInvite(true);
    setError(null);
    setInfo(null);
    try {
      const intake = await triageApiClient.getPublicIntake(token);
      setInviteToken(token);
      setInviteData(intake);
      setAnswers((previous) => {
        const next: Record<string, string> = { ...previous };
        for (const question of intake.customQuestions) {
          if (next[question.questionId] === undefined) {
            next[question.questionId] = "";
          }
        }
        return next;
      });
      setInfo("Convite carregado com sucesso.");
    } catch (requestError) {
      setInviteData(null);
      setError(
        requestError instanceof Error ? requestError.message : "Falha ao carregar convite.",
      );
    } finally {
      setLoadingInvite(false);
    }
  }, []);

  useEffect(() => {
    if (tokenFromQuery && tokenFromQuery.length > 0) {
      void loadInviteByToken(tokenFromQuery);
    }
  }, [loadInviteByToken, tokenFromQuery]);

  const handleLoadInvite = async (tokenOverride?: string) => {
    const token = (tokenOverride ?? inviteToken).trim();
    if (token.length < 12) {
      setError("Informe um token de convite valido.");
      return;
    }

    await loadInviteByToken(token);
  };

  const handleSubmit = async () => {
    if (inviteData === null) {
      setError("Carregue o convite antes de enviar.");
      return;
    }
    if (!canSubmit) {
      setError("Preencha os campos obrigatorios e os consentimentos para continuar.");
      return;
    }

    const triageAnswers =
      inviteData.mode === "custom_triage"
        ? Object.fromEntries(
            Object.entries(answers)
              .map(([key, value]) => [key, value.trim()])
              .filter(([, value]) => value.length > 0),
          )
        : undefined;

    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const result = await triageApiClient.submitPublicIntake(inviteToken, {
        patientFullName: patientFullName.trim(),
        patientEmail: patientEmail.trim() || undefined,
        patientPhone: patientPhone.trim() || undefined,
        consentTermsAccepted,
        consentPrivacyAccepted,
        triageAnswers,
      });
      setInfo(`Triagem enviada com sucesso. Status atual: ${result.status}.`);
      await handleLoadInvite(inviteToken);
    } catch (requestError) {
      setError(
        requestError instanceof TriageApiError
          ? requestError.message
          : "Falha ao enviar triagem.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const currentStatus: IntakeStatus | null = inviteData?.status ?? null;
  const statusMessage =
    currentStatus === null
      ? "Aguardando token"
      : currentStatus === "pending_submission"
        ? "Aguardando envio da entrada inicial"
        : currentStatus === "submitted"
          ? "Triagem enviada e aguardando analise"
          : currentStatus === "complement_requested"
            ? "Complemento solicitado pelo psicologo"
            : currentStatus === "approved"
              ? "Entrada aprovada e paciente ativado"
              : currentStatus === "rejected"
                ? "Entrada rejeitada"
                : "Convite expirado";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>Entrada do Paciente</Text>
        <Text style={styles.title}>Convite e Triagem Inicial</Text>
        <Text style={styles.subtitle}>
          Informe o token recebido para abrir o fluxo de entrada.
        </Text>

        <Text style={styles.label}>Token do convite</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setInviteToken}
          placeholder="cole-o-token-aqui"
          placeholderTextColor="#64748B"
          style={styles.input}
          value={inviteToken}
        />

        <Pressable
          accessibilityRole="button"
          disabled={loadingInvite}
          onPress={() => void handleLoadInvite()}
          style={[styles.primaryButton, loadingInvite ? styles.disabledButton : null]}
        >
          <Text style={styles.primaryButtonText}>
            {loadingInvite ? "Carregando..." : "Abrir convite"}
          </Text>
        </Pressable>

        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>Status atual</Text>
          <Text style={styles.statusValue}>{statusMessage}</Text>
        </View>

        {inviteData ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Convite carregado</Text>
            <Text style={styles.infoText}>Modo: {inviteData.mode}</Text>
            <Text style={styles.infoText}>
              Clinica: {inviteData.practiceName ?? "Clinica nao identificada"}
            </Text>
            <Text style={styles.infoText}>
              Expira em: {new Date(inviteData.inviteExpiresAt).toLocaleString("pt-BR")}
            </Text>
            {inviteData.inviteMessage ? (
              <Text style={styles.infoText}>Mensagem: {inviteData.inviteMessage}</Text>
            ) : null}
            {inviteData.complementRequestNote ? (
              <Text style={styles.complementText}>
                Complemento solicitado: {inviteData.complementRequestNote}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Cadastro minimo</Text>
        <Text style={styles.label}>Nome completo</Text>
        <TextInput
          onChangeText={setPatientFullName}
          placeholder="Nome do paciente"
          placeholderTextColor="#64748B"
          style={styles.input}
          value={patientFullName}
        />

        <Text style={styles.label}>Email (opcional)</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={setPatientEmail}
          placeholder="paciente@email.com"
          placeholderTextColor="#64748B"
          style={styles.input}
          value={patientEmail}
        />

        <Text style={styles.label}>Telefone (opcional)</Text>
        <TextInput
          onChangeText={setPatientPhone}
          placeholder="+55 00 00000-0000"
          placeholderTextColor="#64748B"
          style={styles.input}
          value={patientPhone}
        />

        {inviteData?.requiresCustomTriage ? (
          <View style={styles.formBox}>
            <Text style={styles.sectionTitle}>Triagem inicial personalizada</Text>
            {inviteData.customQuestions.map((question) => (
              <View key={question.questionId} style={styles.questionBlock}>
                <Text style={styles.questionLabel}>
                  {question.prompt}
                  {question.required ? " *" : ""}
                </Text>
                <TextInput
                  onChangeText={(value) =>
                    setAnswers((previous) => ({
                      ...previous,
                      [question.questionId]: value,
                    }))
                  }
                  placeholder="Sua resposta"
                  placeholderTextColor="#64748B"
                  style={[styles.input, styles.multilineInput]}
                  value={answers[question.questionId] ?? ""}
                  multiline
                />
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Consentimentos</Text>
        <ConsentToggle
          checked={consentTermsAccepted}
          label="Aceito os termos de atendimento."
          onPress={() => setConsentTermsAccepted((previous) => !previous)}
        />
        <ConsentToggle
          checked={consentPrivacyAccepted}
          label="Aceito a politica de privacidade e tratamento de dados."
          onPress={() => setConsentPrivacyAccepted((previous) => !previous)}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoFeedback}>{info}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit || submitting}
          onPress={() => void handleSubmit()}
          style={[styles.submitButton, !canSubmit || submitting ? styles.disabledButton : null]}
        >
          <Text style={styles.submitButtonText}>
            {submitting ? "Enviando..." : "Enviar entrada/triagem"}
          </Text>
        </Pressable>

        <Link href="/psicologo/login" style={styles.backLink}>
          <Text style={styles.backLink}>Voltar para login do psicologo</Text>
        </Link>
      </View>
    </ScrollView>
  );
}

function ConsentToggle({
  checked,
  label,
  onPress,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.consentRow}>
      <View style={[styles.consentBox, checked ? styles.consentBoxChecked : null]} />
      <Text style={styles.consentLabel}>{label}</Text>
    </Pressable>
  );
}

function customQuestionsCompleted(
  questions: IntakeCustomQuestion[],
  answers: Record<string, string>,
): boolean {
  return questions.every((question) => {
    if (!question.required) {
      return true;
    }
    return (answers[question.questionId] ?? "").trim().length > 0;
  });
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    backgroundColor: "#F7F3EA",
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
    backgroundColor: "#FFEDD5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: "#9A3412",
    fontWeight: "700",
    fontSize: 12,
  },
  title: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: "#374151",
    fontSize: 14,
    marginBottom: 4,
  },
  sectionTitle: {
    marginTop: 6,
    color: "#1F2937",
    fontWeight: "800",
    fontSize: 15,
  },
  label: {
    marginTop: 2,
    color: "#1F2937",
    fontWeight: "600",
    fontSize: 13,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111827",
    backgroundColor: "#F9FAFB",
  },
  multilineInput: {
    minHeight: 68,
    textAlignVertical: "top",
  },
  primaryButton: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: "#0F766E",
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  submitButton: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: "#C2410C",
    paddingVertical: 12,
    alignItems: "center",
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.55,
  },
  statusBox: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    padding: 10,
  },
  statusLabel: {
    color: "#1E3A8A",
    fontWeight: "700",
    fontSize: 12,
  },
  statusValue: {
    color: "#1E40AF",
    fontSize: 13,
    marginTop: 2,
  },
  infoBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
    padding: 10,
    gap: 2,
  },
  infoTitle: {
    color: "#065F46",
    fontWeight: "700",
    fontSize: 13,
  },
  infoText: {
    color: "#065F46",
    fontSize: 12,
  },
  complementText: {
    color: "#B45309",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  formBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    padding: 10,
    gap: 8,
  },
  questionBlock: {
    gap: 4,
  },
  questionLabel: {
    color: "#1F2937",
    fontWeight: "600",
    fontSize: 13,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  consentBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#6B7280",
    backgroundColor: "#FFFFFF",
  },
  consentBoxChecked: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  consentLabel: {
    flex: 1,
    color: "#374151",
    fontSize: 13,
  },
  errorText: {
    marginTop: 4,
    color: "#B91C1C",
    fontWeight: "600",
    fontSize: 13,
  },
  infoFeedback: {
    marginTop: 4,
    color: "#0F766E",
    fontWeight: "600",
    fontSize: 13,
  },
  backLink: {
    marginTop: 10,
    color: "#C2410C",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
