import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import type { ActivityTemplatesApiClient } from "../src/features/activities/api/activityTemplatesApiClient";
import type { PatientsApiClient } from "../src/features/patients/api/patientsApiClient";
import { PsychologistActivitiesScreen } from "../src/features/activities/screens/PsychologistActivitiesScreen";

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

jest.mock("../src/features/notifications/hooks/useNotificationsStore", () => ({
  useNotificationsStore: (selector: (_state: { items: unknown[] }) => unknown) =>
    selector({ items: [] }),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
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

describe("psychologist activities workspace", () => {
  it("creates template and assigns through guided flow", async () => {
    const templatesClient: ActivityTemplatesApiClient = {
      listTemplates: jest.fn(async () => []),
      createTemplate: jest.fn(async () => ({
        id: "template-1",
        tenantId: "tenant-1",
        psychologistId: "psy-1",
        title: "Exercicio de respiracao",
        description: null,
        instructions: null,
        documentUrl: null,
        configuration: {},
        activityType: "simple_task" as const,
        createdAt: "2026-03-19T10:00:00Z",
        updatedAt: "2026-03-19T10:00:00Z",
        archivedAt: null,
      })),
      updateTemplate: jest.fn(),
      assignTemplate: jest.fn(async () => ({
        idempotencyReplayed: false,
        activity: {
          id: "activity-1",
          patientId: "patient-1",
          patientName: "Paciente Atividade",
          psychologistId: "psy-1",
          sourceTemplateId: "template-1",
          activityType: "simple_task" as const,
          status: "assigned" as const,
          title: "Exercicio de respiracao",
          dueAt: "2026-03-20T21:00:00.000Z",
          scheduledSendAt: null,
          assignedAt: "2026-03-19T10:10:00Z",
          overdueAt: null,
          recurrenceRule: "none" as const,
          recurrenceInterval: 1,
          recurrenceEndAt: null,
          executionElapsedSeconds: 0,
          tenantId: "tenant-1",
          description: null,
          instructions: null,
          documentUrl: null,
          configuration: {},
          openedAt: null,
          startedAt: null,
          pausedAt: null,
          completedAt: null,
          canceledAt: null,
          feedbackNote: null,
          createdAt: "2026-03-19T10:10:00Z",
          updatedAt: "2026-03-19T10:10:00Z",
        },
      })),
    };

    const patientsClient: PatientsApiClient = {
      list: jest.fn(async () => [
        {
          id: "patient-1",
          fullName: "Paciente Atividade",
          preferredName: null,
          email: null,
          phone: null,
          preferredContactChannel: "whatsapp" as const,
          profileSource: "manual" as const,
          whatsappNumberValid: true,
          updatedAt: "2026-03-19T09:00:00Z",
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
        React.createElement(PsychologistActivitiesScreen, {
          templatesClient,
          patientsClient,
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = tree!.root;

    await act(async () => {
      findByTestId(root, "activities-create-card").props.onPress();
    });

    await act(async () => {
      findByTestId(root, "activities-step-next").props.onPress();
    });

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      findByTestId(root, "activities-form-title").props.onChangeText("Exercicio de respiracao");
    });

    for (let index = 0; index < 8; index += 1) {
      await act(async () => {
        findByTestId(root, "activities-step-next").props.onPress();
        await Promise.resolve();
      });
    }

    await act(async () => {
      findByTestId(root, "activities-create-submit").props.onPress();
    });

    expect(templatesClient.createTemplate).toHaveBeenCalledWith(
      "access-token",
      expect.objectContaining({
        title: "Exercicio de respiracao",
      }),
    );
    expect(templatesClient.assignTemplate).toHaveBeenCalled();
  });
});
