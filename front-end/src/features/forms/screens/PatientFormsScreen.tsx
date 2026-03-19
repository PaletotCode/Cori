import { Link, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { shellStyles } from "../../../shared/ui/shellStyles";

import {
  createFormsApiClient,
  FormsApiError,
  type FormsApiClient,
} from "../api/formsApiClient";
import type { ClinicalFormDetail } from "../api/types";

const formsApiClient = createFormsApiClient();

interface PatientFormsScreenProps {
  apiClient?: FormsApiClient;
}

export function PatientFormsScreen({ apiClient = formsApiClient }: PatientFormsScreenProps) {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const tokenFromQuery = Array.isArray(params.token) ? params.token[0] : params.token;

  const [patientAccessToken, setPatientAccessToken] = useState(tokenFromQuery ?? "");
  const [patientName, setPatientName] = useState<string | null>(null);
  const [forms, setForms] = useState<ClinicalFormDetail[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [answersByForm, setAnswersByForm] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const hasToken = useMemo(() => patientAccessToken.trim().length >= 20, [patientAccessToken]);

  const selectedForm = useMemo(() => {
    if (selectedFormId === null) return null;
    return forms.find((form) => form.id === selectedFormId) ?? null;
  }, [forms, selectedFormId]);

  const selectedAnswers = useMemo(() => {
    if (selectedFormId === null) return {};
    return answersByForm[selectedFormId] ?? {};
  }, [answersByForm, selectedFormId]);

  const setAnswer = (questionId: string, value: unknown) => {
    if (selectedFormId === null) return;
    setAnswersByForm((current) => ({
      ...current,
      [selectedFormId]: {
        ...(current[selectedFormId] ?? {}),
        [questionId]: value,
      },
    }));
  };

  const loadForms = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? patientAccessToken).trim();
      if (token.length < 20) {
        setError("Informe um token de formulario valido.");
        return;
      }
      setLoading(true);
      setError(null);
      setInfo(null);
      try {
        const response = await apiClient.listPublicForms(token);
        setPatientAccessToken(token);
        setPatientName(response.patientName);
        setForms(response.forms);
        setAnswersByForm((current) => {
          const mergedAnswers: Record<string, Record<string, unknown>> = {};
          response.forms.forEach((form) => {
            if (
              form.responseData !== null &&
              typeof form.responseData === "object" &&
              !Array.isArray(form.responseData)
            ) {
              mergedAnswers[form.id] = form.responseData as Record<string, unknown>;
              return;
            }
            mergedAnswers[form.id] = current[form.id] ?? {};
          });
          return mergedAnswers;
        });
        if (response.forms.length > 0) {
          setSelectedFormId(response.forms[0].id);
        } else {
          setSelectedFormId(null);
        }
        setInfo("Formularios carregados.");
      } catch (requestError) {
        setPatientName(null);
        setForms([]);
        setSelectedFormId(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Falha ao carregar formularios do paciente.",
        );
      } finally {
        setLoading(false);
      }
    },
    [apiClient, patientAccessToken],
  );

  useEffect(() => {
    if (tokenFromQuery && tokenFromQuery.length > 0) {
      void loadForms(tokenFromQuery);
    }
  }, [loadForms, tokenFromQuery]);

  const handleAction = async (action: "open" | "partial_save" | "submit") => {
    if (selectedFormId === null) {
      setError("Selecione um formulario.");
      return;
    }
    const token = patientAccessToken.trim();
    if (token.length < 20) {
      setError("Token invalido para responder formulario.");
      return;
    }
    setActing(true);
    setError(null);
    setInfo(null);
    try {
      await apiClient.applyPublicAction(token, selectedFormId, {
        action,
        answers: action === "open" ? undefined : selectedAnswers,
      });
      const labels = {
        open: "Formulario aberto.",
        partial_save: "Progresso parcial salvo.",
        submit: "Formulario enviado com sucesso.",
      } as const;
      setInfo(labels[action]);
      await loadForms(token);
    } catch (requestError) {
      setError(
        requestError instanceof FormsApiError
          ? requestError.message
          : "Falha ao executar acao no formulario.",
      );
    } finally {
      setActing(false);
    }
  };

  const toggleCheckboxOption = (questionId: string, option: string) => {
    const current = selectedAnswers[questionId];
    const values = Array.isArray(current) ? current.filter((item) => typeof item === "string") : [];
    if (values.includes(option)) {
      setAnswer(
        questionId,
        values.filter((item) => item !== option),
      );
      return;
    }
    setAnswer(questionId, [...values, option]);
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, shellStyles.scrollContainer]}>
      <View style={[styles.card, shellStyles.surface]}>
        <Text style={styles.badge}>Paciente</Text>
        <Text style={styles.title}>Meus Formularios</Text>
        <Text style={styles.subtitle}>
          Responda parcialmente ou envie de forma final quando concluir.
        </Text>

        <Text style={styles.label}>Token de formulario</Text>
        <TextInput
          testID="patient-forms-token"
          value={patientAccessToken}
          onChangeText={setPatientAccessToken}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="cole-o-token-aqui"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <Pressable
          testID="patient-forms-load"
          disabled={!hasToken || loading}
          onPress={() => void loadForms()}
          style={[styles.primaryButton, !hasToken || loading ? styles.disabledButton : null]}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? "Carregando..." : "Carregar formularios"}
          </Text>
        </Pressable>

        {patientName ? <Text style={styles.infoLabel}>Paciente: {patientName}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}

        <Text style={styles.sectionTitle}>Lista de formularios</Text>
        {forms.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum formulario disponivel.</Text>
        ) : (
          forms.map((form) => (
            <Pressable
              key={form.id}
              testID={`patient-form-select-${form.id}`}
              onPress={() => setSelectedFormId(form.id)}
              style={[
                styles.formChip,
                selectedFormId === form.id ? styles.formChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.formChipText,
                  selectedFormId === form.id ? styles.formChipTextActive : null,
                ]}
              >
                {form.title} ({form.status})
              </Text>
            </Pressable>
          ))
        )}

        {selectedForm !== null ? (
          <>
            <Text style={styles.sectionTitle}>Responder formulario</Text>
            <Text style={styles.formTitle}>{selectedForm.title}</Text>
            {selectedForm.subtitle ? <Text style={styles.formMeta}>{selectedForm.subtitle}</Text> : null}
            {selectedForm.header ? <Text style={styles.formMeta}>{selectedForm.header}</Text> : null}

            <Pressable
              testID={`patient-form-open-${selectedForm.id}`}
              disabled={acting}
              onPress={() => void handleAction("open")}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Abrir formulario</Text>
            </Pressable>

            {selectedForm.sections.map((section) => (
              <View key={section.sectionId} style={styles.sectionBox}>
                <Text style={styles.sectionTitleText}>{section.title}</Text>
                {section.description ? <Text style={styles.sectionMeta}>{section.description}</Text> : null}

                {section.questions.map((question) => {
                  const currentValue = selectedAnswers[question.questionId];
                  return (
                    <View key={question.questionId} style={styles.questionBox}>
                      <Text style={styles.questionLabel}>
                        {question.label}
                        {question.required ? " *" : ""}
                      </Text>

                      {question.fieldType === "short_text" ||
                      question.fieldType === "long_text" ||
                      question.fieldType === "date_time" ? (
                        <TextInput
                          testID={`patient-form-answer-${question.questionId}`}
                          value={typeof currentValue === "string" ? currentValue : ""}
                          onChangeText={(value) => setAnswer(question.questionId, value)}
                          placeholder="Digite sua resposta"
                          placeholderTextColor="#64748B"
                          style={styles.input}
                        />
                      ) : null}

                      {question.fieldType === "multiple_choice" && question.options ? (
                        <View style={styles.optionsRow}>
                          {question.options.map((option) => (
                            <Pressable
                              key={`${question.questionId}-${option}`}
                              testID={`patient-form-option-${question.questionId}-${option}`}
                              onPress={() => setAnswer(question.questionId, option)}
                              style={[
                                styles.optionButton,
                                currentValue === option ? styles.optionButtonActive : null,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.optionButtonText,
                                  currentValue === option ? styles.optionButtonTextActive : null,
                                ]}
                              >
                                {option}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}

                      {question.fieldType === "checkbox" && question.options ? (
                        <View style={styles.optionsRow}>
                          {question.options.map((option) => {
                            const selected =
                              Array.isArray(currentValue) &&
                              currentValue.includes(option);
                            return (
                              <Pressable
                                key={`${question.questionId}-${option}`}
                                testID={`patient-form-check-${question.questionId}-${option}`}
                                onPress={() => toggleCheckboxOption(question.questionId, option)}
                                style={[
                                  styles.optionButton,
                                  selected ? styles.optionButtonActive : null,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.optionButtonText,
                                    selected ? styles.optionButtonTextActive : null,
                                  ]}
                                >
                                  {option}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}

                      {question.fieldType === "scale" ? (
                        <TextInput
                          testID={`patient-form-scale-${question.questionId}`}
                          value={typeof currentValue === "number" ? String(currentValue) : ""}
                          onChangeText={(value) => {
                            const parsed = Number.parseInt(value, 10);
                            setAnswer(
                              question.questionId,
                              Number.isFinite(parsed) ? parsed : value,
                            );
                          }}
                          keyboardType="numeric"
                          placeholder={`${question.scaleMin ?? 1} - ${question.scaleMax ?? 5}`}
                          placeholderTextColor="#64748B"
                          style={styles.input}
                        />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}

            <View style={styles.actionsRow}>
              <Pressable
                testID={`patient-form-partial-${selectedForm.id}`}
                disabled={acting}
                onPress={() => void handleAction("partial_save")}
                style={[styles.actionButton, styles.actionBlue]}
              >
                <Text style={styles.actionButtonText}>Salvar parcial</Text>
              </Pressable>
              <Pressable
                testID={`patient-form-submit-${selectedForm.id}`}
                disabled={acting}
                onPress={() => void handleAction("submit")}
                style={[styles.actionButton, styles.actionGreen]}
              >
                <Text style={styles.actionButtonText}>Enviar final</Text>
              </Pressable>
            </View>
          </>
        ) : null}

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
    backgroundColor: "#F3F4F6",
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
    backgroundColor: "#4338CA",
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
  disabledButton: {
    opacity: 0.55,
  },
  infoLabel: {
    color: "#312E81",
    fontWeight: "700",
    fontSize: 13,
  },
  sectionTitle: {
    marginTop: 8,
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "800",
  },
  formChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    padding: 8,
    backgroundColor: "#F8FAFC",
  },
  formChipActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#E0E7FF",
  },
  formChipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
  },
  formChipTextActive: {
    color: "#4338CA",
  },
  formTitle: {
    color: "#312E81",
    fontSize: 15,
    fontWeight: "700",
  },
  formMeta: {
    color: "#4F46E5",
    fontSize: 12,
  },
  sectionBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    backgroundColor: "#EEF2FF",
    padding: 10,
    gap: 6,
  },
  sectionTitleText: {
    color: "#312E81",
    fontWeight: "700",
    fontSize: 13,
  },
  sectionMeta: {
    color: "#4338CA",
    fontSize: 12,
  },
  questionBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 8,
    gap: 6,
  },
  questionLabel: {
    color: "#1E293B",
    fontWeight: "700",
    fontSize: 12,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
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
    borderColor: "#4F46E5",
    backgroundColor: "#E0E7FF",
  },
  optionButtonText: {
    color: "#334155",
    fontWeight: "600",
    fontSize: 12,
  },
  optionButtonTextActive: {
    color: "#4338CA",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  actionBlue: {
    backgroundColor: "#2563EB",
  },
  actionGreen: {
    backgroundColor: "#15803D",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  emptyText: {
    color: "#64748B",
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
