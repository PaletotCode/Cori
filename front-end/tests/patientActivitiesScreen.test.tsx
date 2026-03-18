import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import type { ActivitiesApiClient } from "../src/features/activities/api/activitiesApiClient";
import type {
  PublicActivityActionResult,
  PublicActivityList,
} from "../src/features/activities/api/types";
import { PatientActivitiesScreen } from "../src/features/activities/screens/PatientActivitiesScreen";

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

describe("patient activities screen", () => {
  it("loads activities and completes one with feedback", async () => {
    const listResult: PublicActivityList = {
      patientId: "patient-1",
      patientName: "Paciente Publico",
      activities: [
        {
          id: "activity-1",
          patientId: "patient-1",
          patientName: "Paciente Publico",
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
        },
      ],
    };

    const actionResult: PublicActivityActionResult = {
      activity: {
        ...listResult.activities[0],
        tenantId: "tenant-1",
        description: null,
        instructions: null,
        documentUrl: null,
        configuration: {},
        openedAt: "2026-03-18T10:10:00Z",
        startedAt: "2026-03-18T10:15:00Z",
        pausedAt: null,
        completedAt: "2026-03-18T10:20:00Z",
        canceledAt: null,
        feedbackNote: "Conclui sem dificuldades.",
        createdAt: "2026-03-18T10:00:00Z",
        updatedAt: "2026-03-18T10:20:00Z",
        status: "completed",
        executionElapsedSeconds: 300,
      },
    };

    const apiClient: ActivitiesApiClient = {
      createActivity: jest.fn(),
      listActivities: jest.fn(),
      getActivity: jest.fn(),
      updateActivity: jest.fn(),
      applyPsychologistAction: jest.fn(),
      listTimelineEvents: jest.fn(),
      listPublicActivities: jest.fn(async () => listResult),
      applyPublicAction: jest.fn(async () => actionResult),
      runOverdueScheduler: jest.fn(),
    };

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(PatientActivitiesScreen, { apiClient }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = tree!.root;
    expect(apiClient.listPublicActivities).toHaveBeenCalled();
    expect(findByTestId(root, "patient-activity-complete-activity-1")).toBeDefined();

    await act(async () => {
      findByTestId(root, "patient-activities-feedback").props.onChangeText("Conclui sem dificuldades.");
    });

    await act(async () => {
      findByTestId(root, "patient-activity-complete-activity-1").props.onPress();
    });

    expect(apiClient.applyPublicAction).toHaveBeenCalledWith(
      "token-publico-12345678901234567890",
      "activity-1",
      expect.objectContaining({
        action: "complete",
        feedbackNote: "Conclui sem dificuldades.",
      }),
    );
  });
});
