import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { typographyContract } from "../../../../shared/ui/typography";

interface PatientDetailHeroBannerProps {
  fullName: string;
  initials: string;
  ageLabel: string;
  birthdayLabel: string;
  phoneLabel: string;
  onBack: () => void;
  backButtonTestID?: string;
  onPressAvatar: () => void;
  avatarButtonTestID?: string;
  onPressWhatsApp: () => void;
  onPressPhone: () => void;
  onPressEmergency: () => void;
  whatsappDisabled: boolean;
  phoneDisabled: boolean;
  emergencyDisabled: boolean;
}

export const PatientDetailHeroBanner = memo(function PatientDetailHeroBanner({
  fullName,
  initials,
  ageLabel,
  birthdayLabel,
  phoneLabel,
  onBack,
  backButtonTestID,
  onPressAvatar,
  avatarButtonTestID,
  onPressWhatsApp,
  onPressPhone,
  onPressEmergency,
  whatsappDisabled,
  phoneDisabled,
  emergencyDisabled,
}: PatientDetailHeroBannerProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.bannerTopMedia}>
        <View style={styles.mediaPlaceholder} />
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={styles.backButton}
          testID={backButtonTestID}
        >
          <Ionicons name="arrow-back" size={15} color="#334155" />
          <Text style={styles.backText}>Voltar para pacientes</Text>
        </Pressable>
      </View>

      <View style={styles.heroContent}>
        <Pressable
          accessibilityRole="button"
          onPress={onPressAvatar}
          style={styles.avatar}
          testID={avatarButtonTestID}
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </Pressable>

        <Text style={styles.name}>{fullName}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={18} color="#8A8F98" />
            <Text style={styles.metaText}>{ageLabel}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="gift-outline" size={18} color="#D97706" />
            <Text style={styles.metaText}>{birthdayLabel}</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            accessibilityRole="button"
            disabled={whatsappDisabled}
            onPress={onPressWhatsApp}
            style={[
              styles.actionButton,
              styles.whatsappButton,
              whatsappDisabled ? styles.actionButtonDisabled : null,
            ]}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
            <Text style={styles.actionText}>WhatsApp</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={phoneDisabled}
            onPress={onPressPhone}
            style={[
              styles.actionButton,
              styles.callButton,
              phoneDisabled ? styles.actionButtonDisabled : null,
            ]}
          >
            <Ionicons name="call-outline" size={20} color="#FFFFFF" />
            <Text numberOfLines={1} style={styles.actionText}>
              {phoneLabel.length > 0 ? `Ligar ${phoneLabel}` : "Ligar"}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={emergencyDisabled}
            onPress={onPressEmergency}
            style={[
              styles.actionButton,
              styles.emergencyButton,
              emergencyDisabled ? styles.actionButtonDisabled : null,
            ]}
          >
            <Ionicons name="warning-outline" size={20} color="#FFFFFF" />
            <Text numberOfLines={1} style={styles.actionText}>Emergencia</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: -14,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E7EC",
  },
  bannerTopMedia: {
    height: 116,
    paddingHorizontal: 14,
    paddingTop: 12,
    justifyContent: "flex-start",
    backgroundColor: "#E6EEF4",
  },
  mediaPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#DCE7EE",
  },
  backButton: {
    alignSelf: "flex-start",
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  backText: {
    fontFamily: typographyContract.fontFamily,
    color: "#334155",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  heroContent: {
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 16,
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F0EF",
    marginTop: -48,
    borderWidth: 4,
    borderColor: "#FFFFFF",
  },
  avatarText: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F766E",
    fontSize: 42,
    lineHeight: 48,
    fontWeight: typographyContract.fontWeight,
  },
  name: {
    fontFamily: typographyContract.fontFamily,
    color: "#111827",
    fontSize: 22,
    lineHeight: 30,
    textAlign: "center",
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    columnGap: 16,
    rowGap: 8,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontFamily: typographyContract.fontFamily,
    color: "#1F2937",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: typographyContract.fontWeight,
  },
  actionsRow: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  whatsappButton: {
    backgroundColor: "#22C55E",
  },
  callButton: {
    backgroundColor: "#1877F2",
  },
  emergencyButton: {
    backgroundColor: "#DC2626",
  },
  actionButtonDisabled: {
    opacity: 0.42,
  },
  actionText: {
    fontFamily: typographyContract.fontFamily,
    color: "#FFFFFF",
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700",
    flexShrink: 1,
  },
});
