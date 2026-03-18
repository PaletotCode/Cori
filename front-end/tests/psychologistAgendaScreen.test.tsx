import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import type { PatientsApiClient } from "../src/features/patients/api/patientsApiClient";
import type { SessionsApiClient } from "../src/features/sessions/api/sessionsApiClient";
import type {
  PublicSessionConfirmResult,
  SessionAgendaItem,
  SessionCreateResult,
  SessionDetail,
} from "../src/features/sessions/api/types";
import { PsychologistAgendaScreen } from "../src/features/sessions/screens/PsychologistAgendaScreen";

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
  useNotificationsStore: (selector: (_state: unknown) => unknown) => {
    void selector;
    return null;
  },
}));

jest.mock("react-native", () => {
  const makeComponent = (name: string) =>
    function MockComponent(props: Record<string, unknown>) {
      return React.createElement(name, props, props.children as React.ReactNode);
    };

  return {
    ActivityIndicator: makeComponent("ActivityIndicator"),
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

describe("psychologist agenda screen", () => {
  it("loads agenda and applies confirm action", async () => {
    const baseAgendaItem: SessionAgendaItem = {
      id: "session-1",
      patientId: "patient-1",
      patientName: "Paciente Agenda",
      psychologistId: "psy-1",
      status: "scheduled",
      locationMode: "online",
      scheduledStartAt: "2026-03-20T14:00:00Z",
      scheduledEndAt: "2026-03-20T14:50:00Z",
      confirmationTokenExpiresAt: "2026-04-20T14:50:00Z",
    };

    const baseSessionDetail: SessionDetail = {
      ...baseAgendaItem,
      tenantId: "tenant-1",
      meetingLink: null,
      notes: null,
      cancellationReason: null,
      canceledAt: null,
      confirmedAt: null,
      confirmedBy: null,
      rescheduledAt: null,
      createdAt: "2026-03-17T18:00:00Z",
      updatedAt: "2026-03-17T18:00:00Z",
    };

    const createResult: SessionCreateResult = {
      ...baseSessionDetail,
      confirmationToken: "token-1",
      confirmationLink: "http://localhost:8081/paciente/sessoes?token=token-1",
    };

    const detailAfterConfirm: SessionDetail = {
      ...baseSessionDetail,
      status: "confirmed",
      confirmedAt: "2026-03-20T13:00:00Z",
      confirmedBy: "psychologist",
    };

    const confirmResult: PublicSessionConfirmResult = {
      sessionId: "session-1",
      status: "confirmed",
      confirmedAt: "2026-03-20T13:00:00Z",
    };

    const sessionsClient: SessionsApiClient = {
      createSession: jest.fn(async () => createResult),
      listAgenda: jest.fn(async () => [baseAgendaItem]),
      getSession: jest.fn(async () => baseSessionDetail),
      applySessionAction: jest.fn(async () => detailAfterConfirm),
      listSessionTimelineEvents: jest.fn(async () => [
        {
          id: "event-1",
          eventType: "session_created",
          actorType: "psychologist",
          actorId: "user-1",
          payload: {},
          createdAt: "2026-03-17T18:00:00Z",
        },
      ]),
      listPublicSessions: jest.fn(async () => ({
        patientId: "patient-1",
        patientName: "Paciente Agenda",
        sessions: [],
      })),
      confirmPublicSession: jest.fn(async () => confirmResult),
      runSessionReminderJob: jest.fn(async () => ({
        processed: 1,
        sent: 1,
        failed: 0,
      })),
    };

    const patientsClient: PatientsApiClient = {
      list: jest.fn(async () => [
        {
          id: "patient-1",
          fullName: "Paciente Agenda",
          preferredName: null,
          email: "agenda@cori.dev",
          phone: "+5565999990001",
          preferredContactChannel: "whatsapp" as const,
          profileSource: "manual" as const,
          whatsappNumberValid: true,
          updatedAt: "2026-03-17T18:00:00Z",
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
        React.createElement(PsychologistAgendaScreen, {
          apiClient: sessionsClient,
          patientsClient,
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = tree!.root;
    expect(findByTestId(root, "agenda-item-session-1")).toBeDefined();

    await act(async () => {
      findByTestId(root, "session-action-confirm").props.onPress();
    });
    expect(sessionsClient.applySessionAction).toHaveBeenCalledWith(
      "access-token",
      "session-1",
      expect.objectContaining({ action: "confirm" }),
    );
  });
});
