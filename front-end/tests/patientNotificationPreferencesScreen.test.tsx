import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import type { NotificationsApiClient } from "../src/features/notifications/api/notificationsApiClient";
import type { NotificationPreferences } from "../src/features/notifications/api/types";
import { PatientNotificationPreferencesScreen } from "../src/features/notifications/screens/PatientNotificationPreferencesScreen";

const mockParams = {
  token: "token-publico-12345678901234567890",
};

jest.mock("expo-router", () => ({
  Link: ({ children, ...props }: Record<string, unknown>) =>
    React.createElement("Link", props, children as React.ReactNode),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("react-native", () => {
  const makeComponent = (name: string) =>
    function MockComponent(props: Record<string, unknown>) {
      return React.createElement(name, props, props.children as React.ReactNode);
    };

  return {
    Pressable: makeComponent("Pressable"),
    ScrollView: makeComponent("ScrollView"),
    Text: makeComponent("Text"),
    TextInput: makeComponent("TextInput"),
    View: makeComponent("View"),
    StyleSheet: {
      create: (styles: unknown) => styles,
    },
  };
});

function findByTestId(root: ReactTestInstance, testID: string): ReactTestInstance {
  return root.findByProps({ testID });
}

describe("patient notification preferences screen", () => {
  it("loads and saves preferences", async () => {
    const initialPreferences: NotificationPreferences = {
      id: "rule-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      eventCategory: "all",
      enabled: true,
      inboxEnabled: true,
      pushEnabled: true,
      realtimeEnabled: true,
      quietHoursStart: null,
      quietHoursEnd: null,
      maxNotificationsPerHour: 20,
      source: "explicit",
      updatedAt: "2026-03-18T10:00:00Z",
    };
    const updatedPreferences: NotificationPreferences = {
      ...initialPreferences,
      enabled: false,
      quietHoursStart: 22,
      quietHoursEnd: 7,
      maxNotificationsPerHour: 10,
      updatedAt: "2026-03-18T11:00:00Z",
    };

    const apiClient: NotificationsApiClient = {
      listUnifiedTimeline: jest.fn(),
      listPatientNotifications: jest.fn(),
      getPatientPreferences: jest.fn(),
      updatePatientPreferences: jest.fn(),
      getTenantDefaultPreferences: jest.fn(),
      updateTenantDefaultPreferences: jest.fn(),
      shareDocument: jest.fn(),
      listPublicInbox: jest.fn(),
      applyPublicInboxAction: jest.fn(),
      getPublicPreferences: jest.fn(async () => initialPreferences),
      updatePublicPreferences: jest.fn(async () => updatedPreferences),
      applyPublicDocumentAction: jest.fn(),
    };

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(PatientNotificationPreferencesScreen, { apiClient }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = tree!.root;
    expect(apiClient.getPublicPreferences).toHaveBeenCalledWith(
      "token-publico-12345678901234567890",
    );

    await act(async () => {
      findByTestId(root, "pref-toggle-enabled").props.onPress();
      findByTestId(root, "pref-quiet-start").props.onChangeText("22");
      findByTestId(root, "pref-quiet-end").props.onChangeText("7");
      findByTestId(root, "pref-max-per-hour").props.onChangeText("10");
    });
    await act(async () => {
      findByTestId(root, "pref-save").props.onPress();
    });

    expect(apiClient.updatePublicPreferences).toHaveBeenCalledWith(
      "token-publico-12345678901234567890",
      expect.objectContaining({
        eventCategory: "all",
        enabled: false,
        quietHoursStart: 22,
        quietHoursEnd: 7,
        maxNotificationsPerHour: 10,
      }),
    );
  });
});
