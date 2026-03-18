import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import type { ActivitiesApiClient } from "../src/features/activities/api/activitiesApiClient";
import type { ActivityCreateResult, ActivityItem } from "../src/features/activities/api/types";
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

describe("psychologist activities screen", () => {
  it("loads central and creates new activity", async () => {
    const baseItem: ActivityItem = {
      id: "activity-1",
      patientId: "patient-1",
      patientName: "Paciente Atividade",
      psychologistId: "psy-1",
      activityType: "simple_task",
      status: "assigned",
      title: "Diario de humor",
      dueAt: "2026-03-20T14:00:00Z",
      assignedAt: "2026-03-18T10:00:00Z",
      overdueAt: null,
      recurrenceRule: "none",
      recurrenceInterval: 1,
      recurrenceEndAt: null,
      executionElapsedSeconds: 0,
    };

    const createResult: ActivityCreateResult = {
      ...baseItem,
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
      createdAt: "2026-03-18T10:00:00Z",
      updatedAt: "2026-03-18T10:00:00Z",
      patientAccessToken: "token-123",
      patientAccessLink: "http://localhost:8081/paciente/atividades?token=token-123",
    };

    const activitiesClient: ActivitiesApiClient = {
      createActivity: jest.fn(async () => createResult),
      listActivities: jest.fn(async () => [baseItem]),
      getActivity: jest.fn(async () => ({
        ...createResult,
        id: "activity-1",
      })),
      updateActivity: jest.fn(async () => createResult),
      applyPsychologistAction: jest.fn(async () => createResult),
      listTimelineEvents: jest.fn(async () => []),
      listPublicActivities: jest.fn(),
      applyPublicAction: jest.fn(),
      runOverdueScheduler: jest.fn(async () => ({
        processed: 0,
        markedOverdue: 0,
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
        React.createElement(PsychologistActivitiesScreen, {
          apiClient: activitiesClient,
          patientsClient,
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = tree!.root;
    expect(findByTestId(root, "activity-item-activity-1")).toBeDefined();

    await act(async () => {
      findByTestId(root, "activities-form-patient-patient-1").props.onPress();
      findByTestId(root, "activities-form-title").props.onChangeText("Exercicio de respiracao");
    });

    await act(async () => {
      findByTestId(root, "activities-create-submit").props.onPress();
    });

    expect(activitiesClient.createActivity).toHaveBeenCalledWith(
      "access-token",
      expect.objectContaining({
        title: "Exercicio de respiracao",
      }),
    );
  });
});
