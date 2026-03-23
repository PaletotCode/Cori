import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { typographyContract } from "../../../../shared/ui/typography";
import type { IntakeDetail } from "../../../triage/api/types";
import {
  canReviewTriageStatus,
  formatTriageStatusLabel,
  resolvePatientInitials,
} from "./triageHelpers";

interface TriagePreviewOverlayProps {
  visible: boolean;
  intake: IntakeDetail | null;
  reviewActionLoading: "approve" | "reject" | null;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}

export function TriagePreviewOverlay({
  visible,
  intake,
  reviewActionLoading,
  onClose,
  onApprove,
  onReject,
}: TriagePreviewOverlayProps) {
  if (!visible) {
    return null;
  }

  const canReview = intake ? canReviewTriageStatus(intake.status) : false;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.card} testID="triage-preview-modal">
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Previa da triagem do paciente</Text>
            <Text style={styles.subtitle}>Revise os dados antes de aprovar ou recusar este contato.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={18} color="#344054" />
          </Pressable>
        </View>

        {intake ? (
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.identityRow}>
              <View style={styles.identityAvatar}>
                <Text style={styles.identityAvatarText}>{resolvePatientInitials(intake.patientFullName)}</Text>
              </View>
              <View style={styles.identityInfo}>
                <Text style={styles.patientName}>{intake.patientFullName ?? "Paciente em cadastro inicial"}</Text>
                <Text style={styles.patientStatus}>{formatTriageStatusLabel(intake.status)}</Text>
                <Text style={styles.patientMeta}>
                  {intake.submittedAt
                    ? `Enviado em ${new Date(intake.submittedAt).toLocaleString("pt-BR")}`
                    : intake.openedAt
                      ? `Convite aberto em ${new Date(intake.openedAt).toLocaleString("pt-BR")}`
                      : "Paciente ainda nao concluiu o envio da triagem"}
                </Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Contato</Text>
              <Text style={styles.infoLine}>E-mail: {intake.patientEmail?.trim() || "Nao informado"}</Text>
              <Text style={styles.infoLine}>Telefone: {intake.patientPhone?.trim() || "Nao informado"}</Text>
              <Text style={styles.infoLine}>
                Nome preferido: {intake.patientPreferredName?.trim() || "Nao informado"}
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Cadastro inicial</Text>
              <Text style={styles.infoLine}>
                Nascimento:{" "}
                {intake.patientBirthDate
                  ? new Date(`${intake.patientBirthDate}T00:00:00`).toLocaleDateString("pt-BR")
                  : "Nao informado"}
              </Text>
              <Text style={styles.infoLine}>Pronomes: {intake.patientPronouns?.trim() || "Nao informado"}</Text>
              <Text style={styles.infoLine}>
                Contato de emergencia: {intake.patientEmergencyContactName?.trim() || "Nao informado"}
              </Text>
              <Text style={styles.infoLine}>
                Telefone emergencia: {intake.patientEmergencyContactPhone?.trim() || "Nao informado"}
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Observacoes</Text>
              <Text style={styles.infoText}>
                {intake.patientCommunicationNotes?.trim() || "Paciente nao deixou observacoes adicionais."}
              </Text>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Selecione uma pendencia para visualizar os dados da triagem.</Text>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Fechar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onReject}
            style={[
              styles.dangerButton,
              reviewActionLoading !== null || !canReview ? styles.buttonDisabled : null,
            ]}
            disabled={reviewActionLoading !== null || !canReview}
          >
            <Text style={styles.dangerButtonText}>
              {reviewActionLoading === "reject" ? "Recusando..." : "Recusar"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onApprove}
            style={[
              styles.primaryButton,
              reviewActionLoading !== null || !canReview ? styles.buttonDisabled : null,
            ]}
            disabled={reviewActionLoading !== null || !canReview}
          >
            <Text style={styles.primaryButtonText}>
              {reviewActionLoading === "approve" ? "Aprovando..." : "Aprovar"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.34)",
    borderRadius: 18,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "92%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontFamily: typographyContract.fontFamily,
    color: "#101828",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: typographyContract.fontWeight,
  },
  subtitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexGrow: 0,
  },
  contentContainer: {
    gap: 8,
    paddingBottom: 6,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  identityAvatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  identityAvatarText: {
    fontFamily: typographyContract.fontFamily,
    color: "#1E3A8A",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
  identityInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  patientName: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: typographyContract.fontWeight,
  },
  patientStatus: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F766E",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  patientMeta: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  infoTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
  infoLine: {
    fontFamily: typographyContract.fontFamily,
    color: "#344054",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  infoText: {
    fontFamily: typographyContract.fontFamily,
    color: "#344054",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  emptyState: {
    minHeight: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  emptyStateText: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    fontWeight: typographyContract.fontWeight,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#344054",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  dangerButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#B42318",
    alignItems: "center",
    justifyContent: "center",
  },
  dangerButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  primaryButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#0F766E",
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontFamily: typographyContract.fontFamily,
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
