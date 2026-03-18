import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import { PracticeProfileApiError, type PracticeProfileApiClient } from "../src/features/practice-profile/api/practiceProfileApiClient";
import { PracticeProfileFlowScreen } from "../src/features/practice-profile/screens/PracticeProfileFlowScreen";

const mockReplace = jest.fn();
const mockSetOnboardingCompleted = jest.fn(async (onboardingCompleted: boolean) => {
  void onboardingCompleted;
  return undefined;
});
const mockAuthState = {
  hydrated: true,
  status: "authenticated" as const,
  tokens: {
    accessToken: "access-token",
  },
  profile: {
    onboardingCompleted: false,
  },
};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock("../src/features/auth/hooks/useAuthStore", () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

jest.mock("../src/features/auth/store/authStore", () => ({
  authStore: {
    actions: {
      setOnboardingCompleted: (onboardingCompleted: boolean) =>
        mockSetOnboardingCompleted(onboardingCompleted),
    },
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

function makeSavedProfile() {
  return {
    id: "profile-1",
    tenantId: "tenant-1",
    practiceName: "Clinica Aurora Integral",
    clinicalApproach: "Terapia cognitivo-comportamental",
    serviceModality: "online" as const,
    inPersonAddress: null,
    sessionPriceCents: 32000,
    currency: "BRL" as const,
    lateCancellationWindowHours: 24,
    lateCancellationFeePercent: 35,
    noShowFeePercent: 80,
    notificationEmailEnabled: true,
    notificationWhatsappEnabled: true,
    notificationPushEnabled: false,
    sessionReminderHoursBefore: [48, 24, 2],
    defaultTriageMode: "custom" as const,
    defaultTriageMessage: "Descreva seu objetivo principal de terapia.",
    onboardingCompleted: true,
    createdAt: "2026-03-17T12:00:00Z",
    updatedAt: "2026-03-17T12:10:00Z",
  };
}

function findByTestId(root: ReactTestInstance, testID: string): ReactTestInstance {
  return root.findByProps({ testID });
}

describe("practice profile onboarding flow screen", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSetOnboardingCompleted.mockClear();
  });

  it("completes full onboarding flow and persists clinic config", async () => {
    const apiClient: PracticeProfileApiClient = {
      get: jest.fn(async () => {
        throw new PracticeProfileApiError("Not found", 404);
      }),
      upsert: jest.fn(async () => makeSavedProfile()),
    };

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        React.createElement(PracticeProfileFlowScreen, {
          mode: "onboarding",
          apiClient,
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const root = tree!.root;

    await act(async () => {
      findByTestId(root, "onboarding-practice-name").props.onChangeText("Clinica Aurora Integral");
      findByTestId(root, "onboarding-clinical-approach").props.onChangeText(
        "Terapia cognitivo-comportamental",
      );
    });
    await act(async () => {
      findByTestId(root, "onboarding-next").props.onPress();
    });

    await act(async () => {
      findByTestId(root, "onboarding-next").props.onPress();
    });

    await act(async () => {
      findByTestId(root, "onboarding-session-price").props.onChangeText("320");
    });
    await act(async () => {
      findByTestId(root, "onboarding-next").props.onPress();
    });

    await act(async () => {
      findByTestId(root, "onboarding-late-window").props.onChangeText("24");
      findByTestId(root, "onboarding-late-fee").props.onChangeText("35");
      findByTestId(root, "onboarding-no-show-fee").props.onChangeText("80");
    });
    await act(async () => {
      findByTestId(root, "onboarding-next").props.onPress();
    });

    await act(async () => {
      findByTestId(root, "onboarding-reminders").props.onChangeText("48,24,2");
    });
    await act(async () => {
      findByTestId(root, "onboarding-next").props.onPress();
    });

    await act(async () => {
      findByTestId(root, "onboarding-triage-custom").props.onPress();
    });
    await act(async () => {
      findByTestId(root, "onboarding-triage-message").props.onChangeText(
        "Descreva seu objetivo principal de terapia.",
      );
    });
    await act(async () => {
      findByTestId(root, "onboarding-submit").props.onPress();
    });

    expect(apiClient.upsert).toHaveBeenCalledTimes(1);
    expect(apiClient.upsert).toHaveBeenCalledWith(
      "access-token",
      expect.objectContaining({
        practice_name: "Clinica Aurora Integral",
        service_modality: "online",
        session_price_cents: 32000,
        default_triage_mode: "custom",
      }),
    );
    expect(mockSetOnboardingCompleted).toHaveBeenCalledWith(true);
    expect(mockReplace).toHaveBeenCalledWith("/psicologo/sessao");
  });
});
