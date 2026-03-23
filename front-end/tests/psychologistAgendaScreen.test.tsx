import React from "react";
import { act, create } from "react-test-renderer";

import type { ActivitiesApiClient } from "../src/features/activities/api/activitiesApiClient";
import type { ActivityTemplatesApiClient } from "../src/features/activities/api/activityTemplatesApiClient";
import type { FormsApiClient } from "../src/features/forms/api/formsApiClient";
import type { FormTemplatesApiClient } from "../src/features/forms/api/formTemplatesApiClient";
import type { PatientsApiClient } from "../src/features/patients/api/patientsApiClient";
import type { SessionsApiClient } from "../src/features/sessions/api/sessionsApiClient";
import type { SessionAgendaItem } from "../src/features/sessions/api/types";
import { PsychologistAgendaScreen } from "../src/features/sessions/screens/PsychologistAgendaScreen";

const mockSetOptions = jest.fn();
const mockPush = jest.fn();

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

jest.mock("expo-router", () => ({
  useNavigation: () => ({ setOptions: mockSetOptions }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => React.createElement("Ionicons"),
}));

jest.mock("../src/features/auth/hooks/useAuthStore", () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

jest.mock("../src/features/notifications/hooks/useNotificationsStore", () => ({
  useNotificationsStore: (selector: (_state: { items: unknown[] }) => unknown) =>
    selector({ items: [] }),
}));

jest.mock("react-native", () => {
  const ReactRuntime = jest.requireActual("react") as typeof import("react");

  const makeComponent = (name: string) => {
    const MockComponent = (props: Record<string, unknown> & { children?: React.ReactNode }) =>
      ReactRuntime.createElement(name, props, props.children);
    MockComponent.displayName = name;
    return MockComponent;
  };

  class AnimatedValue {
    private value: number;

    constructor(initial: number) {
      this.value = initial;
    }

    setValue(next: number) {
      this.value = next;
    }

    interpolate() {
      return this.value;
    }
  }

  return {
    ActivityIndicator: makeComponent("ActivityIndicator"),
    Animated: {
      View: makeComponent("AnimatedView"),
      Value: AnimatedValue,
      timing: () => ({
        start: (callback?: (result: { finished: boolean }) => void) => callback?.({ finished: true }),
        stop: () => undefined,
      }),
    },
    Easing: {
      out: (value: unknown) => value,
      in: (value: unknown) => value,
      cubic: "cubic",
    },
    FlatList: makeComponent("FlatList"),
    Modal: makeComponent("Modal"),
    PanResponder: {
      create: () => ({ panHandlers: {} }),
    },
    Pressable: makeComponent("Pressable"),
    ScrollView: makeComponent("ScrollView"),
    StyleSheet: {
      absoluteFillObject: {},
      create: (styles: unknown) => styles,
    },
    Text: makeComponent("Text"),
    TextInput: makeComponent("TextInput"),
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
    View: makeComponent("View"),
  };
});

describe("psychologist agenda screen", () => {
  it("carrega agenda, contexto e templates do novo fluxo", async () => {
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

    const sessionsClient: SessionsApiClient = {
      createSession: jest.fn(async () => ({
        ...baseAgendaItem,
        tenantId: "tenant-1",
        meetingLink: null,
        notes: null,
        cancellationReason: null,
        canceledAt: null,
        confirmedAt: null,
        confirmedBy: null,
        rescheduledAt: null,
        createdAt: "2026-03-20T14:00:00Z",
        updatedAt: "2026-03-20T14:00:00Z",
        confirmationToken: "token-1",
        confirmationLink: "http://localhost:8081/paciente/sessoes?token=token-1",
      })),
      listAgenda: jest.fn(async () => [baseAgendaItem]),
      getSession: jest.fn(),
      applySessionAction: jest.fn(),
      listSessionTimelineEvents: jest.fn(async () => []),
      listPublicSessions: jest.fn(),
      confirmPublicSession: jest.fn(),
      runSessionReminderJob: jest.fn(async () => ({ processed: 0, sent: 0, failed: 0 })),
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
          profilePhotoUrl: null,
          profileBannerUrl: null,
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

    const activitiesClient: ActivitiesApiClient = {
      createActivity: jest.fn(),
      listActivities: jest.fn(async () => []),
      getActivity: jest.fn(),
      updateActivity: jest.fn(),
      applyPsychologistAction: jest.fn(),
      listTimelineEvents: jest.fn(async () => []),
      listPublicActivities: jest.fn(),
      applyPublicAction: jest.fn(),
      runOverdueScheduler: jest.fn(async () => ({ processed: 0, markedOverdue: 0 })),
    };

    const activityTemplatesClient: ActivityTemplatesApiClient = {
      listTemplates: jest.fn(async () => []),
      createTemplate: jest.fn(),
      updateTemplate: jest.fn(),
      assignTemplate: jest.fn(),
    };

    const formsClient: FormsApiClient = {
      createForm: jest.fn(),
      listForms: jest.fn(async () => []),
      listReceivedResponses: jest.fn(async () => []),
      getForm: jest.fn(),
      updateForm: jest.fn(),
      applyPsychologistAction: jest.fn(),
      listTimelineEvents: jest.fn(async () => []),
      listPublicForms: jest.fn(),
      applyPublicAction: jest.fn(),
      runDispatchScheduler: jest.fn(async () => ({ processed: 0, dispatched: 0 })),
    };

    const formTemplatesClient: FormTemplatesApiClient = {
      listTemplates: jest.fn(async () => []),
      createTemplate: jest.fn(),
      assignTemplate: jest.fn(),
    };

    await act(async () => {
      create(
        React.createElement(PsychologistAgendaScreen, {
          apiClient: sessionsClient,
          activitiesClient,
          activityTemplatesClient,
          formsClient,
          formTemplatesClient,
          patientsClient,
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sessionsClient.listAgenda).toHaveBeenCalled();
    expect(patientsClient.list).toHaveBeenCalled();
    expect(activitiesClient.listActivities).toHaveBeenCalled();
    expect(formsClient.listForms).toHaveBeenCalled();
    expect(activityTemplatesClient.listTemplates).toHaveBeenCalled();
    expect(formTemplatesClient.listTemplates).toHaveBeenCalled();
    expect(mockSetOptions).toHaveBeenCalled();
  });
});
