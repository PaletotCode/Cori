/* eslint-disable react/prop-types */

import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { typographyContract } from "../../../../shared/ui/typography";
import type { PatientListItem } from "../../../patients/api/types";
import type { AgendaAssignMode, AgendaAssignSheetProps } from "./AgendaAssignSheet.types";
import { useAgendaAssignSheetState } from "./useAgendaAssignSheetState";

function truncateValue(value: string | null | undefined, maxLength = 120): string {
  if (value === null || value === undefined || value.trim().length === 0) {
    return "Sem detalhes adicionais.";
  }
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function SubmitButtonLabel({ mode, loading }: { mode: AgendaAssignMode; loading: boolean }) {
  if (mode === "session") {
    return (
      <Text style={styles.submitButtonText}>
        {loading ? "Atribuindo sessao..." : "Atribuir sessao"}
      </Text>
    );
  }
  if (mode === "activity") {
    return (
      <Text style={styles.submitButtonText}>
        {loading ? "Atribuindo atividade..." : "Atribuir atividade"}
      </Text>
    );
  }
  return (
    <Text style={styles.submitButtonText}>
      {loading ? "Atribuindo formulario..." : "Atribuir formulario"}
    </Text>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <Text style={styles.fieldErrorText}>{message}</Text>;
}

function PatientChips({
  patients,
  selectedPatientId,
  onSelect,
}: {
  patients: PatientListItem[];
  selectedPatientId: string;
  onSelect: (patientId: string) => void;
}) {
  const renderItem = useCallback(
    ({ item }: { item: PatientListItem }) => {
      const active = item.id === selectedPatientId;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Selecionar paciente ${item.fullName}`}
          testID={`agenda-assign-patient-${item.id}`}
          onPress={() => onSelect(item.id)}
          style={[styles.chip, active ? styles.chipActive : null]}
        >
          <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
            {item.fullName}
          </Text>
        </Pressable>
      );
    },
    [onSelect, selectedPatientId],
  );

  return (
    <FlatList
      horizontal
      data={patients}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.chipsListContent}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );
}

export function AgendaAssignSheet({
  visible,
  selectedDateKey,
  patients,
  activityTemplates,
  formTemplates,
  loadingTemplates,
  flowStatusByMode,
  errorMessageByMode,
  onClose,
  onAssignSession,
  onAssignActivity,
  onAssignForm,
  onOpenActivitiesTemplates,
  onOpenFormTemplates,
}: AgendaAssignSheetProps) {
  const [mounted, setMounted] = useState(visible);
  const modalMotion = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const contentResizeScale = useRef(new Animated.Value(1)).current;
  const contentResizeTranslateY = useRef(new Animated.Value(0)).current;
  const contentHeightRef = useRef(0);
  const assignModeHeightsRef = useRef<{ activity: number; form: number }>({
    activity: 0,
    form: 0,
  });
  const [sharedAssignBodyHeight, setSharedAssignBodyHeight] = useState(0);

  const {
    mode,
    setMode,
    sessionDraft,
    setSessionDraft,
    activityDraft,
    setActivityDraft,
    formDraft,
    setFormDraft,
    sessionErrors,
    activityErrors,
    formErrors,
    validateCurrentMode,
    selectedActivityTemplate,
    selectedFormTemplate,
  } = useAgendaAssignSheetState({
    visible,
    selectedDateKey,
    patients,
    activityTemplates,
    formTemplates,
  });

  useEffect(() => {
    if (visible) {
      setMounted(true);
      modalMotion.setValue(0);
      Animated.timing(modalMotion, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!mounted) {
      return;
    }

    Animated.timing(modalMotion, {
      toValue: 0,
      duration: 190,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [mounted, modalMotion, visible]);

  const overlayOpacity = useMemo(
    () =>
      modalMotion.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    [modalMotion],
  );

  const modalTranslateY = useMemo(
    () =>
      modalMotion.interpolate({
        inputRange: [0, 1],
        outputRange: [24, 0],
      }),
    [modalMotion],
  );

  const modalScale = useMemo(
    () =>
      modalMotion.interpolate({
        inputRange: [0, 1],
        outputRange: [0.96, 1],
      }),
    [modalMotion],
  );

  const animateHeightTransition = useCallback(
    (direction: "grow" | "shrink") => {
      contentResizeScale.stopAnimation();
      contentResizeTranslateY.stopAnimation();
      contentResizeScale.setValue(direction === "grow" ? 0.982 : 1.018);
      contentResizeTranslateY.setValue(direction === "grow" ? 10 : -8);
      Animated.parallel([
        Animated.timing(contentResizeScale, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentResizeTranslateY, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    },
    [contentResizeScale, contentResizeTranslateY],
  );

  const handleContentSizeChange = useCallback(
    (_width: number, nextHeight: number) => {
      if (!visible) {
        contentHeightRef.current = nextHeight;
        return;
      }

      if (mode === "activity" || mode === "form") {
        const previousModeHeight = assignModeHeightsRef.current[mode];
        if (Math.abs(previousModeHeight - nextHeight) > 2) {
          assignModeHeightsRef.current[mode] = nextHeight;
          const nextSharedHeight = Math.max(
            assignModeHeightsRef.current.activity,
            assignModeHeightsRef.current.form,
          );
          setSharedAssignBodyHeight((currentHeight) =>
            Math.abs(currentHeight - nextSharedHeight) > 2 ? nextSharedHeight : currentHeight,
          );
        }
      }

      const previousHeight = contentHeightRef.current;
      contentHeightRef.current = nextHeight;
      if (previousHeight <= 0) {
        return;
      }
      const delta = nextHeight - previousHeight;
      if (Math.abs(delta) > 6) {
        animateHeightTransition(delta > 0 ? "grow" : "shrink");
      }
    },
    [animateHeightTransition, mode, visible],
  );

  useEffect(() => {
    if (!visible) {
      contentHeightRef.current = 0;
      assignModeHeightsRef.current.activity = 0;
      assignModeHeightsRef.current.form = 0;
      setSharedAssignBodyHeight(0);
      contentResizeScale.setValue(1);
      contentResizeTranslateY.setValue(0);
    }
  }, [contentResizeScale, contentResizeTranslateY, visible]);

  const scrollViewStyle = useMemo(() => {
    if ((mode === "activity" || mode === "form") && sharedAssignBodyHeight > 0) {
      return { height: sharedAssignBodyHeight };
    }
    return undefined;
  }, [mode, sharedAssignBodyHeight]);

  const loadingCurrentMode = flowStatusByMode[mode] === "loading";
  const backendErrorMessage = errorMessageByMode[mode] ?? null;

  const handleSubmit = useCallback(async () => {
    if (loadingCurrentMode) {
      return;
    }
    if (!validateCurrentMode()) {
      return;
    }
    if (mode === "session") {
      await onAssignSession(sessionDraft);
      return;
    }
    if (mode === "activity") {
      await onAssignActivity(activityDraft);
      return;
    }
    await onAssignForm(formDraft);
  }, [
    activityDraft,
    formDraft,
    loadingCurrentMode,
    mode,
    onAssignActivity,
    onAssignForm,
    onAssignSession,
    sessionDraft,
    validateCurrentMode,
  ]);

  const renderActivityTemplateCard = useCallback(
    ({ item }: { item: (typeof activityTemplates)[number] }) => {
      const active = item.id === activityDraft.templateId;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Selecionar template de atividade ${item.title}`}
          testID={`agenda-assign-activity-template-${item.id}`}
          onPress={() => setActivityDraft((current) => ({ ...current, templateId: item.id }))}
          style={[styles.templateCard, active ? styles.templateCardActive : null]}
        >
          <Text style={[styles.templateTitle, active ? styles.templateTitleActive : null]}>
            {item.title}
          </Text>
          <Text style={styles.templateMeta}>Tipo: {item.activityType}</Text>
          <Text style={styles.templateMeta}>
            {truncateValue(item.instructions ?? item.description, 88)}
          </Text>
        </Pressable>
      );
    },
    [activityDraft.templateId, setActivityDraft],
  );

  const renderFormTemplateCard = useCallback(
    ({ item }: { item: (typeof formTemplates)[number] }) => {
      const active = item.id === formDraft.templateId;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Selecionar template de formulario ${item.title}`}
          testID={`agenda-assign-form-template-${item.id}`}
          onPress={() => setFormDraft((current) => ({ ...current, templateId: item.id }))}
          style={[styles.templateCard, active ? styles.templateCardActive : null]}
        >
          <Text style={[styles.templateTitle, active ? styles.templateTitleActive : null]}>
            {item.title}
          </Text>
          <Text style={styles.templateMeta}>{truncateValue(item.subtitle, 88)}</Text>
        </Pressable>
      );
    },
    [formDraft.templateId, setFormDraft],
  );

  if (!mounted) {
    return null;
  }

  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.modalOverlay, { opacity: overlayOpacity }]}>
        <Pressable style={styles.modalBackdropTapZone} onPress={onClose} />
        <Animated.View
          style={[
            styles.modalCard,
            {
              opacity: overlayOpacity,
              transform: [
                { translateY: modalTranslateY },
                { scale: modalScale },
                { translateY: contentResizeTranslateY },
                { scaleY: contentResizeScale },
              ],
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Acoes da agenda</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar modal de atribuicao"
              onPress={onClose}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close-outline" size={18} color="#344054" />
            </Pressable>
          </View>

          <View style={styles.modalSection}>
            <Text style={styles.modalLabel}>Fluxo</Text>
            <View style={styles.modeRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Selecionar fluxo de sessao"
                testID="agenda-assign-tab-session"
                onPress={() => setMode("session")}
                style={[styles.modeButton, mode === "session" ? styles.modeButtonActive : null]}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    mode === "session" ? styles.modeButtonTextActive : null,
                  ]}
                >
                  Atribuir Sessao
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Selecionar fluxo de atividade"
                testID="agenda-assign-tab-activity"
                onPress={() => setMode("activity")}
                style={[styles.modeButton, mode === "activity" ? styles.modeButtonActive : null]}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    mode === "activity" ? styles.modeButtonTextActive : null,
                  ]}
                >
                  Atribuir Atividade
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Selecionar fluxo de formulario"
                testID="agenda-assign-tab-form"
                onPress={() => setMode("form")}
                style={[styles.modeButton, mode === "form" ? styles.modeButtonActive : null]}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    mode === "form" ? styles.modeButtonTextActive : null,
                  ]}
                >
                  Atribuir Formulario
                </Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentContainer}
            onContentSizeChange={handleContentSizeChange}
            style={scrollViewStyle}
          >
            {mode === "session" ? (
              <>
                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Paciente</Text>
                  <PatientChips
                    patients={patients}
                    selectedPatientId={sessionDraft.patientId}
                    onSelect={(patientId) =>
                      setSessionDraft((current) => ({ ...current, patientId }))
                    }
                  />
                  <FieldError message={sessionErrors.patientId} />
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Data e horario</Text>
                  <TextInput
                    testID="agenda-assign-session-date"
                    value={sessionDraft.dateKey}
                    onChangeText={(value) =>
                      setSessionDraft((current) => ({ ...current, dateKey: value }))
                    }
                    placeholder="Data (YYYY-MM-DD)"
                    placeholderTextColor="#98A2B3"
                    style={styles.input}
                    autoCapitalize="none"
                  />
                  <FieldError message={sessionErrors.dateKey} />
                  <View style={styles.inlineInputRow}>
                    <View style={styles.inlineInputCell}>
                      <TextInput
                        testID="agenda-assign-session-start"
                        value={sessionDraft.startTime}
                        onChangeText={(value) =>
                          setSessionDraft((current) => ({ ...current, startTime: value }))
                        }
                        placeholder="Inicio (HH:mm)"
                        placeholderTextColor="#98A2B3"
                        style={styles.input}
                        autoCapitalize="none"
                      />
                      <FieldError message={sessionErrors.startTime} />
                    </View>
                    <View style={styles.inlineInputCell}>
                      <TextInput
                        testID="agenda-assign-session-end"
                        value={sessionDraft.endTime}
                        onChangeText={(value) =>
                          setSessionDraft((current) => ({ ...current, endTime: value }))
                        }
                        placeholder="Fim (HH:mm)"
                        placeholderTextColor="#98A2B3"
                        style={styles.input}
                        autoCapitalize="none"
                      />
                      <FieldError message={sessionErrors.endTime} />
                    </View>
                  </View>
                  <TextInput
                    testID="agenda-assign-session-notes"
                    value={sessionDraft.notes}
                    onChangeText={(value) =>
                      setSessionDraft((current) => ({ ...current, notes: value }))
                    }
                    placeholder="Observacao opcional"
                    placeholderTextColor="#98A2B3"
                    style={[styles.input, styles.notesInput]}
                    multiline
                  />
                </View>
              </>
            ) : null}

            {mode === "activity" ? (
              <>
                <View style={styles.modalSection}>
                  <View style={styles.sectionInlineHeader}>
                    <Text style={styles.modalLabel}>Template de atividade</Text>
                    {loadingTemplates ? <Text style={styles.helperText}>Carregando...</Text> : null}
                  </View>
                  {activityTemplates.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyStateText}>
                        Nenhum template encontrado para atividade.
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Abrir tela de templates de atividade"
                        onPress={onOpenActivitiesTemplates}
                        testID="agenda-assign-open-activity-templates"
                        style={styles.secondaryCtaButton}
                      >
                        <Text style={styles.secondaryCtaButtonText}>
                          Criar template de atividade
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <FlatList
                        data={activityTemplates}
                        keyExtractor={(item) => item.id}
                        renderItem={renderActivityTemplateCard}
                        contentContainerStyle={styles.templateListContent}
                        style={styles.templateList}
                        showsVerticalScrollIndicator={false}
                      />
                      <FieldError message={activityErrors.templateId} />
                    </>
                  )}
                </View>

                {selectedActivityTemplate !== null ? (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Preview do template</Text>
                    <Text style={styles.previewTitle}>{selectedActivityTemplate.title}</Text>
                    <Text style={styles.previewMeta}>
                      Tipo: {selectedActivityTemplate.activityType}
                    </Text>
                    <Text style={styles.previewMeta}>
                      {truncateValue(
                        selectedActivityTemplate.instructions ??
                          selectedActivityTemplate.description,
                        150,
                      )}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Paciente</Text>
                  <PatientChips
                    patients={patients}
                    selectedPatientId={activityDraft.patientId}
                    onSelect={(patientId) =>
                      setActivityDraft((current) => ({ ...current, patientId }))
                    }
                  />
                  <FieldError message={activityErrors.patientId} />
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Envio</Text>
                  <View style={styles.modeRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Enviar atividade imediatamente"
                      testID="agenda-assign-activity-send-immediate"
                      onPress={() =>
                        setActivityDraft((current) => ({ ...current, sendMode: "immediate" }))
                      }
                      style={[
                        styles.modeButton,
                        activityDraft.sendMode === "immediate" ? styles.modeButtonActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeButtonText,
                          activityDraft.sendMode === "immediate"
                            ? styles.modeButtonTextActive
                            : null,
                        ]}
                      >
                        Immediate
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Agendar envio de atividade"
                      testID="agenda-assign-activity-send-scheduled"
                      onPress={() =>
                        setActivityDraft((current) => ({ ...current, sendMode: "scheduled" }))
                      }
                      style={[
                        styles.modeButton,
                        activityDraft.sendMode === "scheduled" ? styles.modeButtonActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeButtonText,
                          activityDraft.sendMode === "scheduled"
                            ? styles.modeButtonTextActive
                            : null,
                        ]}
                      >
                        Scheduled
                      </Text>
                    </Pressable>
                  </View>
                  {activityDraft.sendMode === "scheduled" ? (
                    <View style={styles.inlineInputRow}>
                      <View style={styles.inlineInputCell}>
                        <TextInput
                          value={activityDraft.scheduledDateKey}
                          onChangeText={(value) =>
                            setActivityDraft((current) => ({ ...current, scheduledDateKey: value }))
                          }
                          placeholder="Data envio"
                          testID="agenda-assign-activity-scheduled-date"
                          placeholderTextColor="#98A2B3"
                          style={styles.input}
                          autoCapitalize="none"
                        />
                        <FieldError message={activityErrors.scheduledDateKey} />
                      </View>
                      <View style={styles.inlineInputCell}>
                        <TextInput
                          value={activityDraft.scheduledTime}
                          onChangeText={(value) =>
                            setActivityDraft((current) => ({ ...current, scheduledTime: value }))
                          }
                          placeholder="Hora envio"
                          testID="agenda-assign-activity-scheduled-time"
                          placeholderTextColor="#98A2B3"
                          style={styles.input}
                          autoCapitalize="none"
                        />
                        <FieldError message={activityErrors.scheduledTime} />
                      </View>
                    </View>
                  ) : null}
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Prazo da atividade</Text>
                  <View style={styles.inlineInputRow}>
                    <View style={styles.inlineInputCell}>
                      <TextInput
                        value={activityDraft.dueDateKey}
                        onChangeText={(value) =>
                          setActivityDraft((current) => ({ ...current, dueDateKey: value }))
                        }
                        placeholder="Data prazo"
                        testID="agenda-assign-activity-due-date"
                        placeholderTextColor="#98A2B3"
                        style={styles.input}
                        autoCapitalize="none"
                      />
                      <FieldError message={activityErrors.dueDateKey} />
                    </View>
                    <View style={styles.inlineInputCell}>
                      <TextInput
                        value={activityDraft.dueTime}
                        onChangeText={(value) =>
                          setActivityDraft((current) => ({ ...current, dueTime: value }))
                        }
                        placeholder="Hora prazo"
                        testID="agenda-assign-activity-due-time"
                        placeholderTextColor="#98A2B3"
                        style={styles.input}
                        autoCapitalize="none"
                      />
                      <FieldError message={activityErrors.dueTime} />
                    </View>
                  </View>
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Overrides opcionais</Text>
                  <TextInput
                    value={activityDraft.overrideTitle}
                    onChangeText={(value) =>
                      setActivityDraft((current) => ({ ...current, overrideTitle: value }))
                    }
                    placeholder="Titulo customizado (opcional)"
                    testID="agenda-assign-activity-override-title"
                    placeholderTextColor="#98A2B3"
                    style={styles.input}
                  />
                  <TextInput
                    value={activityDraft.overrideDescription}
                    onChangeText={(value) =>
                      setActivityDraft((current) => ({ ...current, overrideDescription: value }))
                    }
                    placeholder="Descricao customizada (opcional)"
                    testID="agenda-assign-activity-override-description"
                    placeholderTextColor="#98A2B3"
                    style={styles.input}
                  />
                  <TextInput
                    value={activityDraft.overrideInstructions}
                    onChangeText={(value) =>
                      setActivityDraft((current) => ({ ...current, overrideInstructions: value }))
                    }
                    placeholder="Instrucoes customizadas (opcional)"
                    testID="agenda-assign-activity-override-instructions"
                    placeholderTextColor="#98A2B3"
                    style={[styles.input, styles.notesInput]}
                    multiline
                  />
                </View>
              </>
            ) : null}

            {mode === "form" ? (
              <>
                <View style={styles.modalSection}>
                  <View style={styles.sectionInlineHeader}>
                    <Text style={styles.modalLabel}>Template de formulario</Text>
                    {loadingTemplates ? <Text style={styles.helperText}>Carregando...</Text> : null}
                  </View>
                  {formTemplates.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyStateText}>
                        Nenhum template encontrado para formulario.
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Abrir tela de templates de formulario"
                        onPress={onOpenFormTemplates}
                        testID="agenda-assign-open-form-templates"
                        style={styles.secondaryCtaButton}
                      >
                        <Text style={styles.secondaryCtaButtonText}>
                          Criar template de formulario
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <FlatList
                        data={formTemplates}
                        keyExtractor={(item) => item.id}
                        renderItem={renderFormTemplateCard}
                        contentContainerStyle={styles.templateListContent}
                        style={styles.templateList}
                        showsVerticalScrollIndicator={false}
                      />
                      <FieldError message={formErrors.templateId} />
                    </>
                  )}
                </View>

                {selectedFormTemplate !== null ? (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Preview do template</Text>
                    <Text style={styles.previewTitle}>{selectedFormTemplate.title}</Text>
                    <Text style={styles.previewMeta}>
                      {truncateValue(selectedFormTemplate.subtitle, 150)}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Paciente</Text>
                  <PatientChips
                    patients={patients}
                    selectedPatientId={formDraft.patientId}
                    onSelect={(patientId) => setFormDraft((current) => ({ ...current, patientId }))}
                  />
                  <FieldError message={formErrors.patientId} />
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Envio</Text>
                  <View style={styles.modeRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Enviar formulario imediatamente"
                      testID="agenda-assign-form-send-immediate"
                      onPress={() =>
                        setFormDraft((current) => ({ ...current, sendMode: "immediate" }))
                      }
                      style={[
                        styles.modeButton,
                        formDraft.sendMode === "immediate" ? styles.modeButtonActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeButtonText,
                          formDraft.sendMode === "immediate" ? styles.modeButtonTextActive : null,
                        ]}
                      >
                        Immediate
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Agendar envio de formulario"
                      testID="agenda-assign-form-send-scheduled"
                      onPress={() =>
                        setFormDraft((current) => ({ ...current, sendMode: "scheduled" }))
                      }
                      style={[
                        styles.modeButton,
                        formDraft.sendMode === "scheduled" ? styles.modeButtonActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeButtonText,
                          formDraft.sendMode === "scheduled" ? styles.modeButtonTextActive : null,
                        ]}
                      >
                        Scheduled
                      </Text>
                    </Pressable>
                  </View>
                  {formDraft.sendMode === "scheduled" ? (
                    <View style={styles.inlineInputRow}>
                      <View style={styles.inlineInputCell}>
                        <TextInput
                          value={formDraft.scheduledDateKey}
                          onChangeText={(value) =>
                            setFormDraft((current) => ({ ...current, scheduledDateKey: value }))
                          }
                          placeholder="Data envio"
                          testID="agenda-assign-form-scheduled-date"
                          placeholderTextColor="#98A2B3"
                          style={styles.input}
                          autoCapitalize="none"
                        />
                        <FieldError message={formErrors.scheduledDateKey} />
                      </View>
                      <View style={styles.inlineInputCell}>
                        <TextInput
                          value={formDraft.scheduledTime}
                          onChangeText={(value) =>
                            setFormDraft((current) => ({ ...current, scheduledTime: value }))
                          }
                          placeholder="Hora envio"
                          testID="agenda-assign-form-scheduled-time"
                          placeholderTextColor="#98A2B3"
                          style={styles.input}
                          autoCapitalize="none"
                        />
                        <FieldError message={formErrors.scheduledTime} />
                      </View>
                    </View>
                  ) : null}
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Overrides opcionais</Text>
                  <TextInput
                    value={formDraft.overrideTitle}
                    onChangeText={(value) =>
                      setFormDraft((current) => ({ ...current, overrideTitle: value }))
                    }
                    placeholder="Titulo customizado (opcional)"
                    testID="agenda-assign-form-override-title"
                    placeholderTextColor="#98A2B3"
                    style={styles.input}
                  />
                  <TextInput
                    value={formDraft.overrideSubtitle}
                    onChangeText={(value) =>
                      setFormDraft((current) => ({ ...current, overrideSubtitle: value }))
                    }
                    placeholder="Subtitulo customizado (opcional)"
                    testID="agenda-assign-form-override-subtitle"
                    placeholderTextColor="#98A2B3"
                    style={styles.input}
                  />
                </View>
              </>
            ) : null}

            {backendErrorMessage ? (
              <Text style={styles.errorText}>{backendErrorMessage}</Text>
            ) : null}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirmar atribuicao da agenda"
            testID="agenda-assign-submit"
            disabled={loadingCurrentMode}
            onPress={() => {
              void handleSubmit();
            }}
            style={[styles.submitButton, loadingCurrentMode ? styles.submitButtonDisabled : null]}
          >
            <SubmitButtonLabel mode={mode} loading={loadingCurrentMode} />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.32)",
  },
  modalBackdropTapZone: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: "94%",
    maxWidth: 380,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E7EC",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 26,
    gap: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 10,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: typographyContract.fontWeight,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F4F7",
  },
  contentContainer: {
    gap: 12,
    paddingBottom: 4,
  },
  modalSection: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EAECF0",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  modalLabel: {
    fontFamily: typographyContract.fontFamily,
    color: "#344054",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  sectionInlineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  helperText: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
  },
  modeButtonActive: {
    borderColor: "#1D4ED8",
    backgroundColor: "#EFF6FF",
  },
  modeButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 11.5,
    lineHeight: 15,
    textAlign: "center",
    fontWeight: typographyContract.fontWeight,
  },
  modeButtonTextActive: {
    color: "#1D4ED8",
  },
  chipsListContent: {
    gap: 8,
  },
  chip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    minHeight: 33,
    justifyContent: "center",
  },
  chipActive: {
    borderColor: "#1D4ED8",
    backgroundColor: "#EFF6FF",
  },
  chipText: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  chipTextActive: {
    color: "#1D4ED8",
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    minHeight: 40,
    paddingHorizontal: 10,
    color: "#101828",
    fontFamily: typographyContract.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
    backgroundColor: "#FFFFFF",
  },
  notesInput: {
    minHeight: 70,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  inlineInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  inlineInputCell: {
    flex: 1,
    gap: 4,
  },
  templateList: {
    maxHeight: 172,
  },
  templateListContent: {
    gap: 8,
  },
  templateCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 9,
    paddingVertical: 9,
    gap: 3,
  },
  templateCardActive: {
    borderColor: "#1D4ED8",
    backgroundColor: "#EFF6FF",
  },
  templateTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  templateTitleActive: {
    color: "#1D4ED8",
  },
  templateMeta: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  previewTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: typographyContract.fontWeight,
  },
  previewMeta: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  emptyState: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EAECF0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  emptyStateText: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
  secondaryCtaButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1D4ED8",
    backgroundColor: "#EFF6FF",
    minHeight: 34,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  secondaryCtaButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#1D4ED8",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  submitButton: {
    minHeight: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1D4ED8",
    paddingHorizontal: 12,
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  fieldErrorText: {
    fontFamily: typographyContract.fontFamily,
    color: "#B42318",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  errorText: {
    fontFamily: typographyContract.fontFamily,
    color: "#B42318",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
});
