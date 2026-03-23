import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import type { NotificationsApiClient } from "../src/features/notifications/api/notificationsApiClient";
import type {
  NotificationPreferences,
  UnifiedTimelineEvent,
} from "../src/features/notifications/api/types";
import { PsychologistTimelineScreen } from "../src/features/notifications/screens/PsychologistTimelineScreen";
import type { PatientsApiClient } from "../src/features/patients/api/patientsApiClient";

const mockAuthState = {
  hydrated: true,
  status: "authenticated" as const,
  tokens: {
    accessToken: "access-token",
  },
  profile: {
    onboardingCompleted: true,
  },
};

jest.mock("../src/features/auth/hooks/useAuthStore", () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

jest.mock("expo-router", () => ({
  Link: ({ children, ...props }: Record<string, unknown>) =>
    React.createElement("Link", props, children as React.ReactNode),
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

describe("psychologist timeline screen", () => {
  it("loads timeline and shares document", async () => {
    const preferences: NotificationPreferences = {
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
    const sharedDocumentEvent: UnifiedTimelineEvent = {
      id: "event-doc",
      category: "documents",
      eventType: "document_shared",
      actorType: "psychologist",
      actorId: "user-1",
      sessionId: null,
      activityId: null,
      formId: null,
      notificationDeliveryId: null,
      payload: {},
      createdAt: "2026-03-18T10:00:00Z",
    };

    const apiClient: NotificationsApiClient = {
      listUnifiedTimeline: jest.fn(async () => []),
      listPatientNotifications: jest.fn(async () => []),
      getPatientPreferences: jest.fn(async () => preferences),
      updatePatientPreferences: jest.fn(),
      getTenantDefaultPreferences: jest.fn(),
      updateTenantDefaultPreferences: jest.fn(),
      shareDocument: jest.fn(async () => sharedDocumentEvent),
      listPublicInbox: jest.fn(),
      applyPublicInboxAction: jest.fn(),
      getPublicPreferences: jest.fn(),
      updatePublicPreferences: jest.fn(),
      applyPublicDocumentAction: jest.fn(),
    };

    const patientsClient: PatientsApiClient = {
      list: jest.fn(async () => [
        {
          id: "patient-1",
          fullName: "Paciente Timeline",
          preferredName: null,
          email: null,
          phone: null,
          preferredContactChannel: "whatsapp" as const,
          profileSource: "manual" as const,
          whatsappNumberValid: true,
          profilePhotoUrl: null,
          profileBannerUrl: null,
          updatedAt: "2026-03-18T10:00:00Z",
        },
      ]),
      create: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      archive: jest.fn(),
      listChanges: jest.fn(),
      listTimelineEvents: jest.fn(),
    };

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        React.createElement(PsychologistTimelineScreen, {
          apiClient,
          patientsClient,
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = tree!.root;
    await act(async () => {
      findByTestId(root, "timeline-filter-app_usage").props.onPress();
      findByTestId(root, "timeline-load").props.onPress();
    });

    expect(apiClient.listUnifiedTimeline).toHaveBeenCalledWith(
      "access-token",
      "patient-1",
      expect.objectContaining({
        categories: expect.arrayContaining(["activities", "notifications"]),
      }),
    );

    await act(async () => {
      findByTestId(root, "timeline-document-id").props.onChangeText("doc-77");
      findByTestId(root, "timeline-document-title").props.onChangeText("Plano de contingencia");
    });
    await act(async () => {
      findByTestId(root, "timeline-share-document").props.onPress();
    });

    expect(apiClient.shareDocument).toHaveBeenCalledWith(
      "access-token",
      "patient-1",
      "doc-77",
      expect.objectContaining({
        documentTitle: "Plano de contingencia",
      }),
    );
  });
});
