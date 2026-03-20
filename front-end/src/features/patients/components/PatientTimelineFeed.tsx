import { Ionicons } from "@expo/vector-icons";
import { type ComponentProps, type ReactNode, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { typographyContract } from "../../../shared/ui/typography";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export interface PatientTimelineFeedItem {
  id: string;
  category: string;
  categoryLabel: string;
  title: string;
  detail: string;
  eventLabel: string;
  occurredAt: string;
  accentColor: string;
}

interface PatientTimelineFeedProps {
  items: PatientTimelineFeedItem[];
  emptyMessage: string;
  headerAction?: ReactNode;
}

interface TimelineGroup {
  key: string;
  label: string;
  items: PatientTimelineFeedItem[];
}

function resolveCategoryIcon(category: string): IoniconName {
  if (category === "sessions") {
    return "calendar-outline";
  }
  if (category === "activities") {
    return "pulse-outline";
  }
  if (category === "forms") {
    return "document-text-outline";
  }
  if (category === "documents") {
    return "document-attach-outline";
  }
  if (category === "notifications") {
    return "notifications-outline";
  }
  if (category === "app_usage") {
    return "phone-portrait-outline";
  }
  if (category === "profile") {
    return "person-outline";
  }
  if (category === "changes") {
    return "swap-horizontal-outline";
  }
  if (category === "payments") {
    return "card-outline";
  }
  return "ellipse-outline";
}

function toRgba(hexColor: string, alpha: number): string {
  const safeAlpha = Math.max(0, Math.min(alpha, 1));
  const normalized = hexColor.trim().replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((chunk) => `${chunk}${chunk}`)
          .join("")
      : normalized;

  if (!/^[\da-fA-F]{6}$/.test(expanded)) {
    return `rgba(15, 23, 42, ${safeAlpha})`;
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatGroupDateLabel(date: Date): string {
  const today = new Date();
  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (currentDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  const monthLabel = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  });
  const normalizedDate = monthLabel
    .replace(" de ", " DE ")
    .toUpperCase();

  if (diffDays === 0) {
    return `HOJE, ${normalizedDate}`;
  }
  if (diffDays === 1) {
    return `ONTEM, ${normalizedDate}`;
  }
  return normalizedDate;
}

function formatEventTimeLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "--:--";
  }
  return parsed.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PatientTimelineFeed({ items, emptyMessage, headerAction }: PatientTimelineFeedProps) {
  const grouped = useMemo<TimelineGroup[]>(() => {
    const orderedGroups: TimelineGroup[] = [];
    const groupIndexByKey = new Map<string, number>();

    for (const item of items) {
      const parsed = new Date(item.occurredAt);
      const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
      const key = toDateKey(date);
      const existingIndex = groupIndexByKey.get(key);
      if (existingIndex !== undefined) {
        orderedGroups[existingIndex].items.push(item);
        continue;
      }

      groupIndexByKey.set(key, orderedGroups.length);
      orderedGroups.push({
        key,
        label: formatGroupDateLabel(date),
        items: [item],
      });
    }

    return orderedGroups;
  }, [items]);

  if (items.length === 0) {
    return (
      <View style={styles.timelineWrap}>
        {headerAction ? (
          <View style={styles.timelineHeaderRow}>
            <View style={styles.headerSpacer} />
            <View style={styles.timelineHeaderAction}>{headerAction}</View>
          </View>
        ) : null}
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  const lastGroupIndex = grouped.length - 1;
  const lastItemIndex =
    lastGroupIndex >= 0 ? grouped[lastGroupIndex].items.length - 1 : -1;
  const hasHeaderRow = headerAction !== undefined && grouped.length > 0;

  return (
    <View style={styles.timelineWrap}>
      {hasHeaderRow ? (
        <View style={styles.timelineHeaderRow}>
          <View style={styles.groupPill}>
            <Text style={styles.groupPillText}>{grouped[0].label}</Text>
          </View>
          <View style={styles.timelineHeaderAction}>{headerAction}</View>
        </View>
      ) : null}
      {grouped.map((group, groupIndex) => (
        <View key={group.key} style={styles.groupWrap}>
          {!hasHeaderRow || groupIndex > 0 ? (
            <View style={styles.groupPill}>
              <Text style={styles.groupPillText}>{group.label}</Text>
            </View>
          ) : null}
          {group.items.map((item, itemIndex) => {
            const isLastItem = groupIndex === lastGroupIndex && itemIndex === lastItemIndex;
            return (
              <View key={item.id} style={styles.row}>
                <View style={styles.railCol}>
                  <View
                    style={[
                      styles.iconBubble,
                      {
                        backgroundColor: toRgba(item.accentColor, 0.12),
                        borderColor: toRgba(item.accentColor, 0.2),
                      },
                    ]}
                  >
                    <Ionicons
                      name={resolveCategoryIcon(item.category)}
                      size={16}
                      color={item.accentColor}
                    />
                  </View>
                  {!isLastItem ? <View style={styles.rail} /> : null}
                </View>

                <View style={[styles.eventCard, { borderColor: toRgba(item.accentColor, 0.24) }]}>
                  <View style={styles.eventTopRow}>
                    <Text style={styles.eventTitle}>{item.title}</Text>
                    <Text style={styles.eventTime}>{formatEventTimeLabel(item.occurredAt)}</Text>
                  </View>

                  <View style={styles.eventTagsRow}>
                    <View style={[styles.accentTag, { backgroundColor: toRgba(item.accentColor, 0.14) }]}>
                      <Text style={[styles.accentTagText, { color: item.accentColor }]}>
                        {item.categoryLabel.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.neutralTag}>
                      <Text style={styles.neutralTagText}>{item.eventLabel}</Text>
                    </View>
                  </View>

                  <View style={[styles.messageBox, { backgroundColor: toRgba(item.accentColor, 0.08) }]}>
                    <Text style={styles.eventSubtitle}>{item.detail}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  timelineWrap: {
    gap: 14,
  },
  groupWrap: {
    gap: 10,
  },
  timelineHeaderRow: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  timelineHeaderAction: {
    flexShrink: 0,
  },
  headerSpacer: {
    flex: 1,
  },
  groupPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    minHeight: 28,
    justifyContent: "center",
  },
  groupPillText: {
    fontFamily: typographyContract.fontFamily,
    color: "#6B7280",
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 9,
  },
  railCol: {
    width: 28,
    alignItems: "center",
  },
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  rail: {
    width: 2,
    flex: 1,
    backgroundColor: "#E5E7EB",
    marginTop: 4,
    marginBottom: -2,
  },
  eventCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
    marginBottom: 2,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 7,
    elevation: 1,
  },
  eventTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  eventTitle: {
    flex: 1,
    fontFamily: typographyContract.fontFamily,
    color: "#111827",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  eventTime: {
    fontFamily: typographyContract.fontFamily,
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  eventTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  accentTag: {
    minHeight: 25,
    borderRadius: 7,
    paddingHorizontal: 9,
    justifyContent: "center",
  },
  accentTagText: {
    fontFamily: typographyContract.fontFamily,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  neutralTag: {
    minHeight: 25,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 9,
    justifyContent: "center",
  },
  neutralTagText: {
    fontFamily: typographyContract.fontFamily,
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: typographyContract.fontWeight,
  },
  messageBox: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  eventSubtitle: {
    fontFamily: typographyContract.fontFamily,
    color: "#374151",
    fontSize: 13,
    lineHeight: 18,
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
