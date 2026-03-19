import { Link } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { shellStyles } from "../../../shared/ui/shellStyles";
import { ScreenFadeIn } from "../../../shared/ui/ScreenFadeIn";

import { useAuthStore } from "../../auth/hooks/useAuthStore";
import {
  createPatientsApiClient,
  type PatientsApiClient,
} from "../../patients/api/patientsApiClient";
import type { PatientListItem } from "../../patients/api/types";
import {
  createFormsApiClient,
  FormsApiError,
  type FormsApiClient,
} from "../api/formsApiClient";
import type {
  ClinicalFormDetail,
  ClinicalFormListItem,
  ClinicalFormTimelineEvent,
  FormFieldType,
  FormQuestionPayload,
} from "../api/types";

const formsApiClient = createFormsApiClient();
const patientsApiClient = createPatientsApiClient();

interface PsychologistFormsScreenProps {
  apiClient?: FormsApiClient;
  patientsClient?: PatientsApiClient;
}

const FIELD_TYPE_OPTIONS: Array<{ label: string; value: FormFieldType }> = [
  { label: "Texto curto", value: "short_text" },
  { label: "Texto longo", value: "long_text" },
  { label: "Multipla escolha", value: "multiple_choice" },
  { label: "Checkbox", value: "checkbox" },
  { label: "Escala", value: "scale" },
  { label: "Data/hora", value: "date_time" },
];

function defaultScheduledSendAt(): string {
  return new Date(Date.now() + 15 * 60 * 1000).toISOString();
}

export function PsychologistFormsScreen({
  apiClient = formsApiClient,
  patientsClient = patientsApiClient,
}: PsychologistFormsScreenProps) {
  const accessToken = useAuthStore((state) => state.tokens?.accessToken ?? null);

  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [forms, setForms] = useState<ClinicalFormListItem[]>([]);
  const [receivedResponses, setReceivedResponses] = useState<ClinicalFormDetail[]>([]);
  const [timeline, setTimeline] = useState<ClinicalFormTimelineEvent[]>([]);
  const [selectedForm, setSelectedForm] = useState<ClinicalFormDetail | null>(null);

  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [header, setHeader] = useState("");
  const [sectionTitle, setSectionTitle] = useState("Secao principal");
  const [sectionDescription, setSectionDescription] = useState("");
  const [questions, setQuestions] = useState<FormQuestionPayload[]>([]);
  const [questionLabel, setQuestionLabel] = useState("");
  const [questionType, setQuestionType] = useState<FormFieldType>("short_text");
  const [questionRequired, setQuestionRequired] = useState(true);
  const [questionOptions, setQuestionOptions] = useState("");
  const [scaleMin, setScaleMin] = useState("1");
  const [scaleMax, setScaleMax] = useState("5");
  const [scheduledSendAt, setScheduledSendAt] = useState(defaultScheduledSendAt());
  const [reviewNote, setReviewNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actioningFormId, setActioningFormId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [lastPatientLink, setLastPatientLink] = useState<string | null>(null);
  const questionLabelRef = useRef("");
  const questionOptionsRef = useRef("");
  const scaleMinRef = useRef("1");
  const scaleMaxRef = useRef("5");

  const canCreate = useMemo(() => {
    return (
      accessToken !== null &&
      selectedPatientId.trim().length > 0 &&
      title.trim().length >= 3 &&
      questions.length > 0
    );
  }, [accessToken, selectedPatientId, title, questions.length]);

  const loadTimeline = useCallback(
    async (formId: string) => {
      if (accessToken === null) return;
      const events = await apiClient.listTimelineEvents(accessToken, formId, 200);
      setTimeline(events);
    },
    [accessToken, apiClient],
  );

  const loadFormDetail = useCallback(
    async (formId: string) => {
      if (accessToken === null) return;
      const detail = await apiClient.getForm(accessToken, formId);
      setSelectedForm(detail);
      await loadTimeline(formId);
    },
    [accessToken, apiClient, loadTimeline],
  );

  const loadData = useCallback(async () => {
    if (accessToken === null) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [patientsList, formsList, responses] = await Promise.all([
        patientsClient.list(accessToken),
        apiClient.listForms(accessToken),
        apiClient.listReceivedResponses(accessToken, 200),
      ]);
      setPatients(patientsList);
      setForms(formsList);
      setReceivedResponses(responses);
      if (patientsList.length > 0 && selectedPatientId.trim().length === 0) {
        setSelectedPatientId(patientsList[0].id);
      }
      setInfo("Central de formularios carregada.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha ao carregar formularios.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, apiClient, patientsClient, selectedPatientId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAddQuestion = () => {
    const label = questionLabelRef.current.trim();
    if (label.length < 3) {
      setError("Pergunta exige label com ao menos 3 caracteres.");
      return;
    }
    const payload: FormQuestionPayload = {
      questionId: `q_${Date.now()}`,
      label,
      fieldType: questionType,
      required: questionRequired,
    };
    if (questionType === "multiple_choice" || questionType === "checkbox") {
      const options = questionOptionsRef.current
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      if (options.length === 0) {
        setError("Perguntas de multipla escolha/checkbox exigem opcoes.");
        return;
      }
      payload.options = options;
    }
    if (questionType === "scale") {
      const min = Number.parseInt(scaleMinRef.current, 10);
      const max = Number.parseInt(scaleMaxRef.current, 10);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        setError("Escala exige limite minimo e maximo validos.");
        return;
      }
      payload.scaleMin = min;
      payload.scaleMax = max;
    }

    setQuestions((current) => [...current, payload]);
    setQuestionLabel("");
    questionLabelRef.current = "";
    setQuestionOptions("");
    questionOptionsRef.current = "";
    setScaleMin("1");
    scaleMinRef.current = "1";
    setScaleMax("5");
    scaleMaxRef.current = "5";
    setError(null);
  };

  const handleCreateForm = async () => {
    if (accessToken === null || !canCreate) {
      setError("Preencha paciente, titulo e ao menos uma pergunta.");
      return;
    }
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const created = await apiClient.createForm(accessToken, {
        patientId: selectedPatientId,
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        header: header.trim() || undefined,
        sections: [
          {
            sectionId: "s_main",
            title: sectionTitle.trim() || "Secao principal",
            description: sectionDescription.trim() || undefined,
            questions,
          },
        ],
      });
      setLastPatientLink(created.patientAccessLink);
      setSelectedForm(created);
      setQuestions([]);
      setTitle("");
      setSubtitle("");
      setHeader("");
      setSectionDescription("");
      setReviewNote("");
      await Promise.all([loadData(), loadTimeline(created.id)]);
      setInfo("Formulario criado em rascunho.");
    } catch (requestError) {
      setError(
        requestError instanceof FormsApiError
          ? requestError.message
          : "Falha ao criar formulario.",
      );
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    formId: string,
    payload: Parameters<FormsApiClient["applyPsychologistAction"]>[2],
  ) => {
    if (accessToken === null) return;
    setActioningFormId(formId);
    setError(null);
    setInfo(null);
    try {
      const updated = await apiClient.applyPsychologistAction(accessToken, formId, payload);
      setSelectedForm(updated);
      await Promise.all([loadData(), loadTimeline(formId), loadFormDetail(formId)]);
      const labels: Record<string, string> = {
        publish: "Formulario publicado.",
        send: "Formulario enviado ao paciente.",
        schedule: "Formulario agendado.",
        review: "Formulario revisado.",
      };
      setInfo(labels[payload.action]);
    } catch (requestError) {
      setError(
        requestError instanceof FormsApiError
          ? requestError.message
          : "Falha ao executar acao do formulario.",
      );
    } finally {
      setActioningFormId(null);
    }
  };

  const handleDispatch = async () => {
    if (accessToken === null) return;
    setError(null);
    setInfo(null);
    try {
      const result = await apiClient.runDispatchScheduler(accessToken);
      await loadData();
      if (selectedForm !== null) {
        await loadTimeline(selectedForm.id);
      }
      setInfo(
        `Dispatch executado. Processados: ${result.processed}. Enviados: ${result.dispatched}.`,
      );
    } catch (requestError) {
      setError(
        requestError instanceof FormsApiError
          ? requestError.message
          : "Falha ao executar dispatch de formularios.",
      );
    }
  };

  return (
    <ScreenFadeIn>
      <ScrollView contentContainerStyle={[styles.container, shellStyles.scrollContainer]}>
      <View style={[styles.card, shellStyles.surface]}>
        <Text style={styles.sectionTitle}>Builder</Text>
        <Text style={styles.label}>Paciente</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {patients.map((patient) => (
            <Pressable
              key={patient.id}
              testID={`forms-patient-${patient.id}`}
              onPress={() => setSelectedPatientId(patient.id)}
              style={[
                styles.patientChip,
                selectedPatientId === patient.id ? styles.patientChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.patientChipText,
                  selectedPatientId === patient.id ? styles.patientChipTextActive : null,
                ]}
              >
                {patient.fullName}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>Titulo</Text>
        <TextInput
          testID="forms-title"
          value={title}
          onChangeText={setTitle}
          placeholder="Ex: Formulario de check-in"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <Text style={styles.label}>Subtitulo</Text>
        <TextInput
          value={subtitle}
          onChangeText={setSubtitle}
          placeholder="Ex: acompanhamento semanal"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <Text style={styles.label}>Cabecalho</Text>
        <TextInput
          value={header}
          onChangeText={setHeader}
          placeholder="Orientacoes iniciais"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <Text style={styles.label}>Titulo da secao</Text>
        <TextInput value={sectionTitle} onChangeText={setSectionTitle} style={styles.input} />

        <Text style={styles.label}>Descricao da secao</Text>
        <TextInput
          value={sectionDescription}
          onChangeText={setSectionDescription}
          style={styles.input}
        />

        <Text style={styles.sectionTitle}>Adicionar pergunta</Text>
        <TextInput
          testID="forms-question-label"
          value={questionLabel}
          onChangeText={(value) => {
            questionLabelRef.current = value;
            setQuestionLabel(value);
          }}
          placeholder="Enunciado da pergunta"
          placeholderTextColor="#64748B"
          style={styles.input}
        />

        <View style={styles.optionsRow}>
          {FIELD_TYPE_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setQuestionType(option.value)}
              style={[
                styles.optionButton,
                questionType === option.value ? styles.optionButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  questionType === option.value ? styles.optionButtonTextActive : null,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => setQuestionRequired((previous) => !previous)}
          style={styles.toggleButton}
        >
          <Text style={styles.toggleButtonText}>
            {questionRequired ? "Campo obrigatorio: sim" : "Campo obrigatorio: nao"}
          </Text>
        </Pressable>

        {questionType === "multiple_choice" || questionType === "checkbox" ? (
          <>
            <Text style={styles.label}>Opcoes (separadas por virgula)</Text>
            <TextInput
              value={questionOptions}
              onChangeText={(value) => {
                questionOptionsRef.current = value;
                setQuestionOptions(value);
              }}
              placeholder="opcao 1, opcao 2"
              placeholderTextColor="#64748B"
              style={styles.input}
            />
          </>
        ) : null}

        {questionType === "scale" ? (
          <View style={styles.scaleRow}>
            <TextInput
              value={scaleMin}
              onChangeText={(value) => {
                scaleMinRef.current = value;
                setScaleMin(value);
              }}
              keyboardType="numeric"
              style={[styles.input, styles.scaleInput]}
            />
            <TextInput
              value={scaleMax}
              onChangeText={(value) => {
                scaleMaxRef.current = value;
                setScaleMax(value);
              }}
              keyboardType="numeric"
              style={[styles.input, styles.scaleInput]}
            />
          </View>
        ) : null}

        <Pressable testID="forms-add-question" onPress={handleAddQuestion} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Adicionar pergunta</Text>
        </Pressable>

        {questions.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma pergunta adicionada.</Text>
        ) : (
          questions.map((question) => (
            <Text key={question.questionId} style={styles.questionPreview}>
              {question.label} ({question.fieldType}) {question.required ? "*" : ""}
            </Text>
          ))
        )}

        <Pressable
          testID="forms-create"
          disabled={!canCreate || saving}
          onPress={() => void handleCreateForm()}
          style={[styles.primaryButton, !canCreate || saving ? styles.disabledButton : null]}
        >
          <Text style={styles.primaryButtonText}>
            {saving ? "Salvando..." : "Criar formulario (rascunho)"}
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Central de formularios</Text>
        {forms.map((form) => (
          <View key={form.id} testID={`form-item-${form.id}`} style={styles.formBox}>
            <Text style={styles.formTitle}>{form.title}</Text>
            <Text style={styles.formMeta}>Paciente: {form.patientName}</Text>
            <Text style={styles.formMeta}>Status: {form.status}</Text>

            <View style={styles.actionsRow}>
              <Pressable
                testID={`form-open-${form.id}`}
                disabled={actioningFormId === form.id}
                onPress={() => void loadFormDetail(form.id)}
                style={styles.actionButton}
              >
                <Text style={styles.actionButtonText}>Abrir</Text>
              </Pressable>
              <Pressable
                testID={`form-publish-${form.id}`}
                disabled={actioningFormId === form.id}
                onPress={() => void runAction(form.id, { action: "publish" })}
                style={[styles.actionButton, styles.actionBlue]}
              >
                <Text style={styles.actionButtonText}>Publicar</Text>
              </Pressable>
              <Pressable
                testID={`form-send-${form.id}`}
                disabled={actioningFormId === form.id}
                onPress={() => void runAction(form.id, { action: "send" })}
                style={[styles.actionButton, styles.actionGreen]}
              >
                <Text style={styles.actionButtonText}>Enviar</Text>
              </Pressable>
            </View>

            <TextInput
              value={scheduledSendAt}
              onChangeText={setScheduledSendAt}
              style={styles.input}
              placeholder="2026-03-18T12:00:00Z"
              placeholderTextColor="#64748B"
            />
            <Pressable
              testID={`form-schedule-${form.id}`}
              disabled={actioningFormId === form.id}
              onPress={() =>
                void runAction(form.id, {
                  action: "schedule",
                  scheduledSendAt: scheduledSendAt.trim(),
                })
              }
              style={[styles.actionButton, styles.actionOrange]}
            >
              <Text style={styles.actionButtonText}>Agendar envio</Text>
            </Pressable>

            <TextInput
              value={reviewNote}
              onChangeText={setReviewNote}
              style={styles.input}
              placeholder="Nota de revisao"
              placeholderTextColor="#64748B"
            />
            <Pressable
              testID={`form-review-${form.id}`}
              disabled={actioningFormId === form.id}
              onPress={() =>
                void runAction(form.id, {
                  action: "review",
                  reviewNote: reviewNote.trim() || undefined,
                })
              }
              style={[styles.actionButton, styles.actionTeal]}
            >
              <Text style={styles.actionButtonText}>Marcar revisado</Text>
            </Pressable>
          </View>
        ))}

        <Pressable testID="forms-dispatch" onPress={() => void handleDispatch()} style={styles.dispatchButton}>
          <Text style={styles.dispatchButtonText}>Executar dispatch de agendados</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Respostas recebidas</Text>
        {receivedResponses.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma resposta recebida ate agora.</Text>
        ) : (
          receivedResponses.map((form) => (
            <Text key={`response-${form.id}`} style={styles.responsePreview}>
              {form.title} ({form.status}) -{" "}
              {form.submittedAt ? new Date(form.submittedAt).toLocaleString("pt-BR") : "-"}
            </Text>
          ))
        )}

        <Text style={styles.sectionTitle}>Timeline do formulario</Text>
        {selectedForm === null ? (
          <Text style={styles.emptyText}>Selecione um formulario para ver timeline e respostas.</Text>
        ) : (
          <>
            <Text style={styles.formMeta}>
              Resposta atual: {selectedForm.responseData ? JSON.stringify(selectedForm.responseData) : "sem resposta"}
            </Text>
            {timeline.length === 0 ? (
              <Text style={styles.emptyText}>Sem eventos para este formulario.</Text>
            ) : (
              timeline.map((event) => (
                <Text key={event.id} style={styles.timelineEntry}>
                  {event.eventType} | {new Date(event.createdAt).toLocaleString("pt-BR")}
                </Text>
              ))
            )}
          </>
        )}

        {loading ? <Text style={styles.infoText}>Carregando...</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}
        {lastPatientLink ? <Text style={styles.linkInfo}>Link do paciente: {lastPatientLink}</Text> : null}

        <Link href="/psicologo/sessao" style={styles.backLink}>
          <Text style={styles.backLink}>Voltar para sessao do psicologo</Text>
        </Link>
      </View>
      </ScrollView>
    </ScreenFadeIn>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#EEF2FF",
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
  sectionTitle: {
    marginTop: 8,
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "800",
  },
  label: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
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
  patientChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  patientChipActive: {
    borderColor: "#4338CA",
    backgroundColor: "#E0E7FF",
  },
  patientChipText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
  },
  patientChipTextActive: {
    color: "#4338CA",
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
    fontSize: 12,
    fontWeight: "600",
  },
  optionButtonTextActive: {
    color: "#4338CA",
  },
  toggleButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0F766E",
    paddingVertical: 8,
    alignItems: "center",
  },
  toggleButtonText: {
    color: "#0F766E",
    fontWeight: "700",
    fontSize: 12,
  },
  scaleRow: {
    flexDirection: "row",
    gap: 8,
  },
  scaleInput: {
    flex: 1,
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
  questionPreview: {
    color: "#312E81",
    fontSize: 12,
    fontWeight: "600",
  },
  formBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    backgroundColor: "#EEF2FF",
    padding: 10,
    gap: 4,
  },
  formTitle: {
    color: "#312E81",
    fontSize: 14,
    fontWeight: "700",
  },
  formMeta: {
    color: "#3730A3",
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
    backgroundColor: "#1E3A8A",
  },
  actionBlue: {
    backgroundColor: "#2563EB",
  },
  actionGreen: {
    backgroundColor: "#15803D",
  },
  actionOrange: {
    backgroundColor: "#C2410C",
  },
  actionTeal: {
    backgroundColor: "#0F766E",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  dispatchButton: {
    borderRadius: 10,
    backgroundColor: "#7C2D12",
    paddingVertical: 10,
    alignItems: "center",
  },
  dispatchButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  responsePreview: {
    color: "#334155",
    fontSize: 12,
  },
  timelineEntry: {
    color: "#334155",
    fontSize: 12,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 13,
  },
  infoText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "600",
  },
  linkInfo: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "600",
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.55,
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
