import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { typographyContract } from "../../../../shared/ui/typography";

interface PatientContactBlocksProps {
  preferredChannel: string;
  primaryPhone: string;
  emergencyName: string;
  emergencyPhone: string;
  onPressEmergencyCall: () => void;
  emergencyCallDisabled: boolean;
}

export const PatientContactBlocks = memo(function PatientContactBlocks({
  preferredChannel,
  primaryPhone,
  emergencyName,
  emergencyPhone,
  onPressEmergencyCall,
  emergencyCallDisabled,
}: PatientContactBlocksProps) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.title}>DETALHES DO CONTATO</Text>

      <View style={styles.gridRow}>
        <View style={[styles.infoCard, styles.channelCard]}>
          <Ionicons name="chatbubble-outline" size={28} color="#2E7D32" />
          <Text style={styles.infoTitle}>Canal Preferido</Text>
          <Text style={styles.infoSubtitle}>{preferredChannel}</Text>
        </View>

        <View style={[styles.infoCard, styles.phoneCard]}>
          <Ionicons name="call-outline" size={28} color="#1D4ED8" />
          <Text style={styles.infoTitle}>Telefone Principal</Text>
          <Text style={styles.infoSubtitle}>{primaryPhone}</Text>
        </View>
      </View>

      <View style={styles.emergencyCard}>
        <View style={styles.emergencyBody}>
          <View style={styles.emergencyBadgeRow}>
            <Ionicons name="alert-circle-outline" size={26} color="#DC2626" />
            <Text style={styles.emergencyBadge}>EMERGENCIA</Text>
          </View>
          <Text style={styles.emergencyName}>{emergencyName}</Text>
          <Text style={styles.emergencyPhone}>{emergencyPhone}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={emergencyCallDisabled}
          onPress={onPressEmergencyCall}
          style={[styles.emergencyCallButton, emergencyCallDisabled ? styles.emergencyCallDisabled : null]}
        >
          <Ionicons name="call-outline" size={30} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  sectionWrap: {
    gap: 10,
  },
  title: {
    fontFamily: typographyContract.fontFamily,
    color: "#8B8F97",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  gridRow: {
    flexDirection: "row",
    gap: 8,
  },
  infoCard: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  channelCard: {
    backgroundColor: "#EAF6EE",
  },
  phoneCard: {
    backgroundColor: "#EAF2FF",
  },
  infoTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  infoSubtitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  emergencyCard: {
    borderRadius: 22,
    backgroundColor: "#FFE9EC",
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emergencyBody: {
    flex: 1,
    gap: 4,
  },
  emergencyBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emergencyBadge: {
    fontFamily: typographyContract.fontFamily,
    color: "#B91C1C",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  emergencyName: {
    fontFamily: typographyContract.fontFamily,
    color: "#B42318",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
  emergencyPhone: {
    fontFamily: typographyContract.fontFamily,
    color: "#D95454",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: typographyContract.fontWeight,
  },
  emergencyCallButton: {
    width: 62,
    height: 62,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC2626",
    shadowColor: "#991B1B",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 5,
  },
  emergencyCallDisabled: {
    opacity: 0.4,
  },
});
