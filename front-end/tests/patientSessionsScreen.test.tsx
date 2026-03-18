import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import type { SessionsApiClient } from "../src/features/sessions/api/sessionsApiClient";
import type {
  PublicSessionConfirmResult,
  PublicSessionList,
} from "../src/features/sessions/api/types";
import { PatientSessionsScreen } from "../src/features/sessions/screens/PatientSessionsScreen";

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

describe("patient sessions screen", () => {
  it("loads sessions and confirms presence", async () => {
    const listResult: PublicSessionList = {
      patientId: "patient-1",
      patientName: "Paciente Publico",
      sessions: [
        {
          id: "session-1",
          patientId: "patient-1",
          patientName: "Paciente Publico",
          psychologistId: "psy-1",
          status: "scheduled",
          locationMode: "online",
          scheduledStartAt: "2026-03-20T14:00:00Z",
          scheduledEndAt: "2026-03-20T14:50:00Z",
          confirmationTokenExpiresAt: "2026-04-20T14:50:00Z",
        },
      ],
    };

    const confirmResult: PublicSessionConfirmResult = {
      sessionId: "session-1",
      status: "confirmed",
      confirmedAt: "2026-03-20T13:00:00Z",
    };

    const apiClient: SessionsApiClient = {
      createSession: jest.fn(),
      listAgenda: jest.fn(),
      getSession: jest.fn(),
      applySessionAction: jest.fn(),
      listSessionTimelineEvents: jest.fn(),
      listPublicSessions: jest.fn(async () => listResult),
      confirmPublicSession: jest.fn(async () => confirmResult),
      runSessionReminderJob: jest.fn(),
    };

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(PatientSessionsScreen, { apiClient }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = tree!.root;
    expect(apiClient.listPublicSessions).toHaveBeenCalled();
    expect(findByTestId(root, "patient-confirm-session-session-1")).toBeDefined();

    await act(async () => {
      findByTestId(root, "patient-confirm-session-session-1").props.onPress();
    });
    expect(apiClient.confirmPublicSession).toHaveBeenCalledWith(
      "token-publico-12345678901234567890",
      "session-1",
    );
  });
});
