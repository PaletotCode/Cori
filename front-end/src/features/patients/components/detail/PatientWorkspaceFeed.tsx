import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { typographyContract } from "../../../../shared/ui/typography";

export interface PatientWorkspaceFeedItem {
  id: string;
  kind: "activity" | "form";
  title: string;
  status: string;
  whenLabel: string;
  accentColor: string;
}

interface PatientWorkspaceFeedProps {
  items: PatientWorkspaceFeedItem[];
}

export const PatientWorkspaceFeed = memo(function PatientWorkspaceFeed({ items }: PatientWorkspaceFeedProps) {
  if (items.length === 0) {
    return <Text style={styles.empty}>Sem atividades ou formulários atribuídos no momento.</Text>;
  }

  return (
    <View style={styles.listWrap}>
      {items.map((item) => (
        <View key={item.id} style={styles.itemCard}>
          <View style={styles.itemHeaderRow}>
            <View style={[styles.kindBadge, { borderColor: item.accentColor }]}>
              <Ionicons
                name={item.kind === "activity" ? "flash-outline" : "document-text-outline"}
                size={12}
                color={item.accentColor}
              />
              <Text style={[styles.kindText, { color: item.accentColor }]}>
                {item.kind === "activity" ? "Atividade" : "Formulário"}
              </Text>
            </View>
            <Text style={styles.status}>{item.status}</Text>
          </View>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.when}>{item.whenLabel}</Text>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  listWrap: {
    gap: 8,
  },
  itemCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 5,
  },
  itemHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  kindBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
  },
  kindText: {
    fontFamily: typographyContract.fontFamily,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  status: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  title: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  when: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  empty: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
});
