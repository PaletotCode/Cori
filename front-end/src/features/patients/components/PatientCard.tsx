import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { typographyContract } from "../../../shared/ui/typography";
import type { PatientListItem } from "../api/types";

interface PatientCardProps {
  patient: PatientListItem;
  summary: string;
  ageLabel: string;
  birthdayLabel: string;
  onPressCard: (patientId: string) => void;
  onPressWhatsApp: (patientId: string) => void;
  onPressPhone: (patientId: string) => void;
  onActionUnavailable?: (message: string) => void;
  whatsappDisabled?: boolean;
  callDisabled?: boolean;
}

interface AvatarPalette {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}

function patientInitials(fullName: string): string {
  const tokens = fullName
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return "P";
  }

  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  const first = tokens[0][0] ?? "";
  const last = tokens[tokens.length - 1][0] ?? "";
  return `${first}${last}`.toUpperCase();
}

function hashNameToHue(fullName: string): number {
  const normalized = fullName.trim().toLowerCase();
  if (normalized.length === 0) {
    return 210;
  }

  let hash = 0;
  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return hash;
}

function avatarPaletteFromName(fullName: string): AvatarPalette {
  const hue = hashNameToHue(fullName);
  return {
    backgroundColor: `hsl(${hue} 74% 92%)`,
    borderColor: `hsl(${hue} 62% 80%)`,
    textColor: `hsl(${hue} 58% 33%)`,
  };
}

export function PatientCard({
  patient,
  summary,
  ageLabel,
  birthdayLabel,
  onPressCard,
  onPressWhatsApp,
  onPressPhone,
  onActionUnavailable,
  whatsappDisabled = false,
  callDisabled = false,
}: PatientCardProps) {
  const avatarPalette = avatarPaletteFromName(patient.fullName);
  const whatsappIconColor = whatsappDisabled ? "#D1D5DB" : "#FFFFFF";
  const callIconColor = callDisabled ? "#D1D5DB" : "#FFFFFF";

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.92}
      onPress={() => onPressCard(patient.id)}
      style={styles.cardContainer}
      testID={`patients-open-${patient.id}`}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: avatarPalette.backgroundColor,
            borderColor: avatarPalette.borderColor,
          },
        ]}
      >
        <Text style={[styles.avatarText, { color: avatarPalette.textColor }]}>
          {patientInitials(patient.fullName)}
        </Text>
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {patient.fullName}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
        </View>

        <Text style={styles.description} numberOfLines={2}>
          {summary}
        </Text>

        <View style={styles.spacer} />

        <View style={styles.footerRow}>
          <View style={styles.metadataContainer}>
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={14} color="#00796B" />
              <Text style={styles.metaText} numberOfLines={1}>
                {ageLabel}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="gift-outline" size={14} color="#D97706" />
              <Text style={styles.metaText} numberOfLines={1}>
                {birthdayLabel}
              </Text>
            </View>
          </View>

          <View style={styles.actionsContainer}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: whatsappDisabled }}
              activeOpacity={0.86}
              onPress={() => {
                if (whatsappDisabled) {
                  onActionUnavailable?.("Paciente sem WhatsApp valido para contato.");
                  return;
                }
                onPressWhatsApp(patient.id);
              }}
              style={[
                styles.actionButton,
                styles.whatsappButton,
                whatsappDisabled ? styles.actionButtonDisabled : null,
              ]}
              testID={`patients-whatsapp-${patient.id}`}
            >
              <Ionicons name="logo-whatsapp" size={18} color={whatsappIconColor} />
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: callDisabled }}
              activeOpacity={0.86}
              onPress={() => {
                if (callDisabled) {
                  onActionUnavailable?.("Paciente sem telefone valido para ligacao.");
                  return;
                }
                onPressPhone(patient.id);
              }}
              style={[
                styles.actionButton,
                styles.phoneButton,
                callDisabled ? styles.actionButtonDisabled : null,
              ]}
              testID={`patients-call-${patient.id}`}
            >
              <Ionicons name="call-outline" size={18} color={callIconColor} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: "row",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 12,
    elevation: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: typographyContract.fontFamily,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: typographyContract.fontWeight,
  },
  contentContainer: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: typographyContract.fontWeight,
  },
  description: {
    marginTop: 4,
    fontFamily: typographyContract.fontFamily,
    color: "#334155",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
  spacer: {
    height: 16,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  metadataContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    flexShrink: 0,
  },
  metaText: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  actionsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 96,
    marginLeft: "auto",
    flexShrink: 0,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  whatsappButton: {
    backgroundColor: "#25D366",
  },
  phoneButton: {
    backgroundColor: "#007AFF",
  },
  actionButtonDisabled: {
    backgroundColor: "#E5E7EB",
  },
});
