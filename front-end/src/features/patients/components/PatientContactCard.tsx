import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { typographyContract } from "../../../shared/ui/typography";
import type { PatientListItem } from "../api/types";

interface PatientContactCardProps {
  patient: PatientListItem;
  summary: string;
  ageLabel: string;
  birthdayLabel: string;
  onOpenProfile: (patientId: string) => void;
  onOpenWhatsapp: (patientId: string) => void;
  onOpenCall: (patientId: string) => void;
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

export function PatientContactCard({
  patient,
  summary,
  ageLabel,
  birthdayLabel,
  onOpenProfile,
  onOpenWhatsapp,
  onOpenCall,
  onActionUnavailable,
  whatsappDisabled = false,
  callDisabled = false,
}: PatientContactCardProps) {
  const avatarPalette = avatarPaletteFromName(patient.fullName);
  const whatsappIconColor = whatsappDisabled ? "#98A2B3" : "#FFFFFF";
  const callIconColor = callDisabled ? "#98A2B3" : "#0369A1";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpenProfile(patient.id)}
      style={styles.card}
      testID={`patients-open-${patient.id}`}
    >
      <View style={styles.contentRow}>
        <View
          style={[
            styles.avatarWrap,
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
        <View style={styles.patientMainInfo}>
          <Text numberOfLines={1} style={styles.patientName}>
            {patient.fullName}
          </Text>
          <Text numberOfLines={2} style={styles.patientSummary}>
            {summary}
          </Text>
          <View style={styles.metaRow}>
            <Text numberOfLines={1} style={styles.patientMeta}>
              {ageLabel}
            </Text>
            <Text numberOfLines={1} style={styles.patientMeta}>
              {birthdayLabel}
            </Text>
          </View>
        </View>
        <View style={styles.rightRail}>
          <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
          <Pressable
            accessibilityRole="button"
            onPress={(event) => {
              event.stopPropagation();
              if (whatsappDisabled) {
                onActionUnavailable?.("Paciente sem WhatsApp valido para contato.");
                return;
              }
              onOpenWhatsapp(patient.id);
            }}
            style={[
              styles.iconButton,
              styles.whatsappButton,
              whatsappDisabled ? styles.iconButtonDisabled : null,
            ]}
            testID={`patients-whatsapp-${patient.id}`}
            accessibilityState={{ disabled: whatsappDisabled }}
          >
            <Ionicons name="logo-whatsapp" size={15} color={whatsappIconColor} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={(event) => {
              event.stopPropagation();
              if (callDisabled) {
                onActionUnavailable?.("Paciente sem telefone valido para ligacao.");
                return;
              }
              onOpenCall(patient.id);
            }}
            style={[
              styles.iconButton,
              styles.callButton,
              callDisabled ? styles.iconButtonDisabled : null,
            ]}
            testID={`patients-call-${patient.id}`}
            accessibilityState={{ disabled: callDisabled }}
          >
            <Ionicons name="call-outline" size={15} color={callIconColor} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
    shadowColor: "#0F172A",
    shadowOpacity: 0.09,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 2,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: typographyContract.fontFamily,
    fontSize: 14,
    lineHeight: 18,
    color: "#1E3A8A",
    fontWeight: typographyContract.fontWeight,
  },
  patientMainInfo: {
    flex: 1,
    gap: 2,
    paddingTop: 1,
  },
  patientName: {
    fontFamily: typographyContract.fontFamily,
    fontSize: 15,
    lineHeight: 20,
    color: "#0F172A",
    fontWeight: typographyContract.fontWeight,
  },
  patientSummary: {
    fontFamily: typographyContract.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: "#334155",
    fontWeight: typographyContract.fontWeight,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 8,
    rowGap: 2,
  },
  patientMeta: {
    fontFamily: typographyContract.fontFamily,
    fontSize: 11.5,
    lineHeight: 15,
    color: "#0F766E",
    fontWeight: typographyContract.fontWeight,
  },
  rightRail: {
    paddingTop: 1,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  whatsappButton: {
    borderColor: "#15803D",
    backgroundColor: "#16A34A",
  },
  callButton: {
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  iconButtonDisabled: {
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    opacity: 1,
  },
});
