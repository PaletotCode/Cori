import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import type { FormsApiClient } from "../src/features/forms/api/formsApiClient";
import type {
  ClinicalFormPublicActionResult,
  ClinicalFormPublicList,
} from "../src/features/forms/api/types";
import { PatientFormsScreen } from "../src/features/forms/screens/PatientFormsScreen";

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

describe("patient forms screen", () => {
  it("fills partial and submits final answers", async () => {
    const listResult: ClinicalFormPublicList = {
      patientId: "patient-1",
      patientName: "Paciente Forms",
      forms: [
        {
          id: "form-1",
          patientId: "patient-1",
          patientName: "Paciente Forms",
          psychologistId: "psy-1",
          status: "assigned",
          title: "Check-in",
          subtitle: null,
          publishedAt: "2026-03-18T10:00:00Z",
          scheduledSendAt: null,
          assignedAt: "2026-03-18T10:01:00Z",
          submittedAt: null,
          reviewedAt: null,
          tenantId: "tenant-1",
          header: null,
          sections: [
            {
              sectionId: "s1",
              title: "Secao",
              description: null,
              questions: [
                {
                  questionId: "q1",
                  label: "Como voce esta?",
                  fieldType: "short_text",
                  required: true,
                  helpText: null,
                  options: null,
                  scaleMin: null,
                  scaleMax: null,
                },
              ],
            },
          ],
          responseData: null,
          openedAt: null,
          partialSavedAt: null,
          reviewedByUserId: null,
          reviewNote: null,
          createdAt: "2026-03-18T10:00:00Z",
          updatedAt: "2026-03-18T10:00:00Z",
        },
      ],
    };

    const actionResult: ClinicalFormPublicActionResult = {
      form: {
        ...listResult.forms[0],
        status: "submitted",
        responseData: { q1: "Estou melhor hoje." },
        submittedAt: "2026-03-18T10:20:00Z",
      },
    };

    const apiClient: FormsApiClient = {
      createForm: jest.fn(),
      listForms: jest.fn(),
      listReceivedResponses: jest.fn(),
      getForm: jest.fn(),
      updateForm: jest.fn(),
      applyPsychologistAction: jest.fn(),
      listTimelineEvents: jest.fn(),
      listPublicForms: jest.fn(async () => listResult),
      applyPublicAction: jest.fn(async () => actionResult),
      runDispatchScheduler: jest.fn(),
    };

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(PatientFormsScreen, { apiClient }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = tree!.root;
    expect(apiClient.listPublicForms).toHaveBeenCalled();

    await act(async () => {
      findByTestId(root, "patient-form-answer-q1").props.onChangeText("Estou melhor hoje.");
    });

    await act(async () => {
      findByTestId(root, "patient-form-partial-form-1").props.onPress();
    });
    expect(apiClient.applyPublicAction).toHaveBeenCalledWith(
      "token-publico-12345678901234567890",
      "form-1",
      expect.objectContaining({
        action: "partial_save",
        answers: expect.objectContaining({ q1: "Estou melhor hoje." }),
      }),
    );

    await act(async () => {
      findByTestId(root, "patient-form-submit-form-1").props.onPress();
    });
    expect(apiClient.applyPublicAction).toHaveBeenCalledWith(
      "token-publico-12345678901234567890",
      "form-1",
      expect.objectContaining({
        action: "submit",
        answers: expect.objectContaining({ q1: "Estou melhor hoje." }),
      }),
    );
  });
});
