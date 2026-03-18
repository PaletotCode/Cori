import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import type { FormsApiClient } from "../src/features/forms/api/formsApiClient";
import type { ClinicalFormCreateResult, ClinicalFormListItem } from "../src/features/forms/api/types";
import type { PatientsApiClient } from "../src/features/patients/api/patientsApiClient";
import { PsychologistFormsScreen } from "../src/features/forms/screens/PsychologistFormsScreen";

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

describe("psychologist forms screen", () => {
  it("creates form draft from builder", async () => {
    const baseListItem: ClinicalFormListItem = {
      id: "form-1",
      patientId: "patient-1",
      patientName: "Paciente Forms",
      psychologistId: "psy-1",
      status: "draft",
      title: "Check-in inicial",
      subtitle: null,
      publishedAt: null,
      scheduledSendAt: null,
      assignedAt: null,
      submittedAt: null,
      reviewedAt: null,
    };

    const createResult: ClinicalFormCreateResult = {
      ...baseListItem,
      tenantId: "tenant-1",
      header: null,
      sections: [],
      responseData: null,
      openedAt: null,
      partialSavedAt: null,
      reviewedByUserId: null,
      reviewNote: null,
      createdAt: "2026-03-18T10:00:00Z",
      updatedAt: "2026-03-18T10:00:00Z",
      patientAccessToken: "token-publico-1",
      patientAccessLink: "http://localhost:8081/paciente/formularios?token=token-publico-1",
    };

    const formsClient: FormsApiClient = {
      createForm: jest.fn(async () => createResult),
      listForms: jest.fn(async () => [baseListItem]),
      listReceivedResponses: jest.fn(async () => []),
      getForm: jest.fn(async () => createResult),
      updateForm: jest.fn(async () => createResult),
      applyPsychologistAction: jest.fn(async () => createResult),
      listTimelineEvents: jest.fn(async () => []),
      listPublicForms: jest.fn(),
      applyPublicAction: jest.fn(),
      runDispatchScheduler: jest.fn(async () => ({
        processed: 0,
        dispatched: 0,
      })),
    };

    const patientsClient: PatientsApiClient = {
      list: jest.fn(async () => [
        {
          id: "patient-1",
          fullName: "Paciente Forms",
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
        React.createElement(PsychologistFormsScreen, {
          apiClient: formsClient,
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
      findByTestId(root, "forms-patient-patient-1").props.onPress();
      findByTestId(root, "forms-title").props.onChangeText("Formulario semanal");
      findByTestId(root, "forms-question-label").props.onChangeText("Como voce esta hoje?");
      findByTestId(root, "forms-add-question").props.onPress();
    });
    await act(async () => {
      findByTestId(root, "forms-create").props.onPress();
    });

    expect(formsClient.createForm).toHaveBeenCalledWith(
      "access-token",
      expect.objectContaining({
        title: "Formulario semanal",
      }),
    );
  });
});
