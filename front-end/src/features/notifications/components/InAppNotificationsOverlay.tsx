import { useCallback, useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { typographyContract } from "../../../shared/ui/typography";
import { useNotificationsStore } from "../hooks/useNotificationsStore";
import { notificationsStore, type NotificationItem } from "../store/notificationsStore";

type NotificationVariant = "info" | "success" | "error";

const MAX_VISIBLE_NOTIFICATIONS = 3;
const AUTO_DISMISS_MS: Record<NotificationVariant, number> = {
  info: 4800,
  success: 5200,
  error: 7200,
};

function resolveVariant(item: NotificationItem): NotificationVariant {
  const variant = item.metadata?.inAppVariant;
  if (variant === "success" || variant === "error" || variant === "info") {
    return variant;
  }
  return "info";
}

function resolveCardStyle(variant: NotificationVariant) {
  if (variant === "success") {
    return styles.notificationCardSuccess;
  }
  if (variant === "error") {
    return styles.notificationCardError;
  }
  return styles.notificationCardInfo;
}

export function InAppNotificationsOverlay() {
  const items = useNotificationsStore((state) => state.items);
  const unreadItems = useMemo(
    () => items.filter((item) => !item.read).slice(0, MAX_VISIBLE_NOTIFICATIONS),
    [items],
  );
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissNotification = useCallback((id: string) => {
    const currentTimer = timersRef.current.get(id);
    if (currentTimer) {
      clearTimeout(currentTimer);
      timersRef.current.delete(id);
    }
    notificationsStore.actions.markAsRead(id);
  }, []);

  useEffect(() => {
    const visibleIds = new Set(unreadItems.map((item) => item.id));
    timersRef.current.forEach((timer, id) => {
      if (!visibleIds.has(id)) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    });

    unreadItems.forEach((item) => {
      if (timersRef.current.has(item.id)) {
        return;
      }
      const variant = resolveVariant(item);
      const timer = setTimeout(() => {
        timersRef.current.delete(item.id);
        notificationsStore.actions.markAsRead(item.id);
      }, AUTO_DISMISS_MS[variant]);
      timersRef.current.set(item.id, timer);
    });
  }, [unreadItems]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    },
    [],
  );

  if (unreadItems.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.overlayContainer}>
      <View pointerEvents="box-none" style={styles.stack}>
        {unreadItems.map((item) => {
          const variant = resolveVariant(item);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => dismissNotification(item.id)}
              style={[styles.notificationCard, resolveCardStyle(variant)]}
            >
              <View style={styles.notificationHeader}>
                <Text numberOfLines={1} style={styles.notificationTitle}>
                  {item.title}
                </Text>
                <Text style={styles.notificationClose}>Fechar</Text>
              </View>
              <Text style={styles.notificationBody}>{item.body}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
  },
  stack: {
    position: "absolute",
    top: 52,
    left: 12,
    right: 12,
    gap: 8,
  },
  notificationCard: {
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  notificationCardInfo: {
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  notificationCardSuccess: {
    borderColor: "#6EE7B7",
    backgroundColor: "#ECFDF3",
  },
  notificationCardError: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 2,
  },
  notificationTitle: {
    flex: 1,
    color: "#101828",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typographyContract.fontFamily,
    fontWeight: "700",
  },
  notificationClose: {
    color: "#667085",
    fontSize: 11,
    lineHeight: 16,
    fontFamily: typographyContract.fontFamily,
    fontWeight: "600",
  },
  notificationBody: {
    color: "#334155",
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: typographyContract.fontFamily,
    fontWeight: typographyContract.fontWeight,
  },
});
