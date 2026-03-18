import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import type { PatientsApiClient } from "../src/features/patients/api/patientsApiClient";
import type {
  PatientChange,
  PatientDetail,
  PatientListItem,
  PatientTimelineEvent,
} from "../src/features/patients/api/types";
import { PsychologistPatientsScreen } from "../src/features/patients/screens/PsychologistPatientsScreen";

const mockOpenURL = jest.fn(async (url: string) => {
  void url;
  return undefined;
});

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
    Linking: {
      openURL: (...args: [string]) => mockOpenURL(...args),
    },
    StyleSheet: {
      create: (styles: unknown) => styles,
    },
  };
});

function findByTestId(root: ReactTestInstance, testID: string): ReactTestInstance {
  return root.findByProps({ testID });
}

function createApiClient(overrides: Partial<PatientsApiClient> = {}): PatientsApiClient {
  const baseListItem: PatientListItem = {
    id: "patient-1",
    fullName: "Paciente Aurora",
    preferredName: "Aurora",
    email: "aurora@cori.dev",
    phone: "+5565999990001",
    preferredContactChannel: "whatsapp",
    profileSource: "manual",
    whatsappNumberValid: true,
    updatedAt: "2026-03-17T20:00:00Z",
  };

  const baseDetail: PatientDetail = {
    id: "patient-1",
    tenantId: "tenant-1",
    fullName: "Paciente Aurora",
    preferredName: "Aurora",
    email: "aurora@cori.dev",
    phone: "+5565999990001",
    birthDate: "1990-01-01",
    pronouns: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    preferredContactChannel: "whatsapp",
    preferredContactPeriod: "night",
    communicationNotes: "Prefere texto",
    profileSource: "manual",
    whatsappNumberValid: true,
    createdAt: "2026-03-17T19:00:00Z",
    updatedAt: "2026-03-17T20:00:00Z",
  };

  const baseChange: PatientChange = {
    id: "change-1",
    changeType: "created",
    changedFields: ["full_name"],
    previousData: null,
    newData: { full_name: "Paciente Aurora" },
    changedByUserId: "user-1",
    reason: "Cadastro inicial manual.",
    createdAt: "2026-03-17T19:00:00Z",
  };

  const baseTimelineEvent: PatientTimelineEvent = {
    id: "event-1",
    eventType: "patient_profile_created",
    actorType: "psychologist",
    actorId: "user-1",
    payload: {},
    createdAt: "2026-03-17T19:00:00Z",
  };

  return {
    list: jest.fn(async () => [baseListItem]),
    create: jest.fn(async () => ({
      ...baseDetail,
      birthDate: null,
      preferredContactPeriod: null,
      communicationNotes: null,
    })),
    get: jest.fn(async () => baseDetail),
    update: jest.fn(async () => baseDetail),
    archive: jest.fn(async () => ({
      patientId: "patient-1",
      archivedAt: "2026-03-17T22:00:00Z",
    })),
    listChanges: jest.fn(async () => [baseChange]),
    listTimelineEvents: jest.fn(async () => [baseTimelineEvent]),
    ...overrides,
  };
}

describe("psychologist patients screen", () => {
  beforeEach(() => {
    mockOpenURL.mockClear();
  });

  it("loads patient list and profile details", async () => {
    const apiClient = createApiClient();
    let tree: ReturnType<typeof create>;

    await act(async () => {
      tree = create(React.createElement(PsychologistPatientsScreen, { apiClient }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = tree!.root;
    const listItem = findByTestId(root, "patients-list-item-patient-1");
    expect(listItem).toBeDefined();
    expect(apiClient.list).toHaveBeenCalled();
    expect(apiClient.get).toHaveBeenCalledWith("access-token", "patient-1");
  });

  it("opens whatsapp fallback when phone is invalid", async () => {
    const apiClient = createApiClient({
      get: jest.fn(async () => ({
        id: "patient-1",
        tenantId: "tenant-1",
        fullName: "Paciente Aurora",
        preferredName: null,
        email: "aurora@cori.dev",
        phone: "3211-1000",
        birthDate: null,
        pronouns: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        preferredContactChannel: "whatsapp" as const,
        preferredContactPeriod: null,
        communicationNotes: null,
        profileSource: "manual" as const,
        whatsappNumberValid: false,
        createdAt: "2026-03-17T19:00:00Z",
        updatedAt: "2026-03-17T20:00:00Z",
      })),
    });

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(PsychologistPatientsScreen, { apiClient }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = tree!.root;
    await act(async () => {
      findByTestId(root, "patients-whatsapp-button").props.onPress();
    });

    expect(mockOpenURL).toHaveBeenCalledWith(
      "https://wa.me/?text=Ola!%20Recebi%20seu%20contato%20e%20quero%20alinhar%20o%20proximo%20passo.",
    );
  });
});
