import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import type { NotificationsApiClient } from "../src/features/notifications/api/notificationsApiClient";
import type {
  NotificationDelivery,
  UnifiedTimelineEvent,
} from "../src/features/notifications/api/types";
import { PatientNotificationsInboxScreen } from "../src/features/notifications/screens/PatientNotificationsInboxScreen";

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

describe("patient notifications inbox screen", () => {
  it("loads inbox and updates notification status", async () => {
    const deliveredNotification: NotificationDelivery = {
      id: "delivery-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      eventType: "activity_assigned",
      category: "activities",
      title: "Nova atividade",
      body: "Atividade atribuida.",
      status: "delivered",
      statusReason: null,
      channelInbox: true,
      channelPush: true,
      channelRealtime: true,
      metadata: {},
      queuedAt: "2026-03-18T10:00:00Z",
      sentAt: "2026-03-18T10:00:01Z",
      deliveredAt: "2026-03-18T10:00:02Z",
      openedAt: null,
      actionTakenAt: null,
      failedAt: null,
      createdAt: "2026-03-18T10:00:00Z",
      updatedAt: "2026-03-18T10:00:02Z",
    };
    const openedNotification: NotificationDelivery = {
      ...deliveredNotification,
      status: "opened",
      openedAt: "2026-03-18T10:03:00Z",
      updatedAt: "2026-03-18T10:03:00Z",
    };
    const openedDocumentEvent: UnifiedTimelineEvent = {
      id: "event-doc",
      category: "documents",
      eventType: "document_opened",
      actorType: "patient",
      actorId: null,
      sessionId: null,
      activityId: null,
      formId: null,
      notificationDeliveryId: null,
      payload: {},
      createdAt: "2026-03-18T10:10:00Z",
    };

    const apiClient: NotificationsApiClient = {
      listUnifiedTimeline: jest.fn(),
      listPatientNotifications: jest.fn(),
      getPatientPreferences: jest.fn(),
      updatePatientPreferences: jest.fn(),
      getTenantDefaultPreferences: jest.fn(),
      updateTenantDefaultPreferences: jest.fn(),
      shareDocument: jest.fn(),
      listPublicInbox: jest.fn(async () => ({
        patientId: "patient-1",
        patientName: "Paciente Inbox",
        notifications: [deliveredNotification],
      })),
      applyPublicInboxAction: jest.fn(async () => openedNotification),
      getPublicPreferences: jest.fn(),
      updatePublicPreferences: jest.fn(),
      applyPublicDocumentAction: jest.fn(async () => openedDocumentEvent),
    };

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(PatientNotificationsInboxScreen, { apiClient }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = tree!.root;
    expect(apiClient.listPublicInbox).toHaveBeenCalledWith(
      "token-publico-12345678901234567890",
      250,
    );

    await act(async () => {
      findByTestId(root, "patient-inbox-open-delivery-1").props.onPress();
    });
    expect(apiClient.applyPublicInboxAction).toHaveBeenCalledWith(
      "token-publico-12345678901234567890",
      "delivery-1",
      "open",
    );

    await act(async () => {
      findByTestId(root, "patient-inbox-document-id").props.onChangeText("doc-009");
    });
    await act(async () => {
      findByTestId(root, "patient-inbox-document-open").props.onPress();
    });
    expect(apiClient.applyPublicDocumentAction).toHaveBeenCalledWith(
      "token-publico-12345678901234567890",
      "doc-009",
      expect.objectContaining({ action: "opened" }),
    );
  });
});
