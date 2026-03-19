import { StyleSheet, Text, View } from "react-native";

import { typographyContract } from "../../../shared/ui/typography";

export interface PatientTimelineFeedItem {
  id: string;
  title: string;
  subtitle: string;
  timestampLabel: string;
  accentColor: string;
}

interface PatientTimelineFeedProps {
  items: PatientTimelineFeedItem[];
  emptyMessage: string;
}

export function PatientTimelineFeed({ items, emptyMessage }: PatientTimelineFeedProps) {
  if (items.length === 0) {
    return <Text style={styles.emptyText}>{emptyMessage}</Text>;
  }

  return (
    <View style={styles.timelineWrap}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <View key={item.id} style={styles.row}>
            <View style={styles.railCol}>
              <View style={[styles.dot, { backgroundColor: item.accentColor }]} />
              {!isLast ? <View style={styles.rail} /> : null}
            </View>
            <View style={styles.eventCard}>
              <Text style={styles.eventTitle}>{item.title}</Text>
              <Text style={styles.eventSubtitle}>{item.subtitle}</Text>
              <Text style={styles.eventTime}>{item.timestampLabel}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  timelineWrap: {
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  railCol: {
    width: 20,
    alignItems: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 10,
  },
  rail: {
    width: 2,
    flex: 1,
    backgroundColor: "#D0D5DD",
    marginTop: 6,
    marginBottom: 2,
  },
  eventCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
    marginBottom: 8,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 1,
  },
  eventTitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#0F172A",
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: typographyContract.fontWeight,
  },
  eventSubtitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#475467",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: typographyContract.fontWeight,
  },
  eventTime: {
    fontFamily: typographyContract.fontFamily,
    color: "#0369A1",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  emptyText: {
    fontFamily: typographyContract.fontFamily,
    color: "#667085",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: typographyContract.fontWeight,
  },
});
