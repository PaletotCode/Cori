import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import type { PatientsApiClient } from "../src/features/patients/api/patientsApiClient";
import type {
  PatientChange,
  PatientDetail,
  PatientListItem,
  PatientTimelineEvent,
} from "../src/features/patients/api/types";
import {
  __resetPatientsScreenCacheForTests,
  PsychologistPatientsScreen,
} from "../src/features/patients/screens/PsychologistPatientsScreen";

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

jest.mock("@react-navigation/native", () => {
  const ReactRuntime = jest.requireActual("react") as typeof import("react");
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactRuntime.useEffect(() => callback(), [callback]);
    },
  };
});

jest.mock("expo-router", () => ({
  useNavigation: () => ({
    setOptions: () => undefined,
  }),
}));

jest.mock("react-native-svg", () => {
  const ReactRuntime = jest.requireActual("react") as typeof import("react");
  const Svg = (props: Record<string, unknown>) =>
    ReactRuntime.createElement("Svg", props, props.children as React.ReactNode);
  const Path = (props: Record<string, unknown>) =>
    ReactRuntime.createElement("Path", props, props.children as React.ReactNode);
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Path,
  };
});

jest.mock("react-native", () => {
  const makeComponent = (name: string) =>
    function MockComponent(props: Record<string, unknown>) {
      return React.createElement(name, props, props.children as React.ReactNode);
    };

  class AnimatedValue {
    value: number;

    constructor(value: number) {
      this.value = value;
    }

    setValue(next: number) {
      this.value = next;
    }

    interpolate(config: { outputRange?: number[] }) {
      return config.outputRange?.[0] ?? this.value;
    }
  }

  const Animated = {
    Value: AnimatedValue,
    timing: () => ({
      start: (callback?: ({ finished }: { finished: boolean }) => void) => {
        callback?.({ finished: true });
      },
      stop: () => undefined,
    }),
    View: makeComponent("AnimatedView"),
  };

  return {
    ActivityIndicator: makeComponent("ActivityIndicator"),
    Animated,
    InteractionManager: {
      runAfterInteractions: (task: () => void) => {
        task();
        return {
          cancel: () => undefined,
        };
      },
    },
    Modal: makeComponent("Modal"),
    Pressable: makeComponent("Pressable"),
    RefreshControl: makeComponent("RefreshControl"),
    ScrollView: makeComponent("ScrollView"),
    Text: makeComponent("Text"),
    TextInput: makeComponent("TextInput"),
    TouchableOpacity: makeComponent("TouchableOpacity"),
    View: makeComponent("View"),
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
    Linking: {
      openURL: (...args: [string]) => mockOpenURL(...args),
    },
    Easing: {
      cubic: "cubic",
      out: (value: unknown) => value,
    },
    StyleSheet: {
      create: (styles: unknown) => styles,
    },
  };
});

function findByTestId(root: ReactTestInstance, testID: string): ReactTestInstance {
  return root.findByProps({ testID });
}

async function flushMicrotasks(cycles = 8): Promise<void> {
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function waitForTestId(
  root: ReactTestInstance,
  testID: string,
  attempts = 20,
): Promise<ReactTestInstance> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return findByTestId(root, testID);
    } catch (searchError) {
      if (attempt === attempts - 1) {
        throw searchError;
      }
      await flushMicrotasks(2);
    }
  }
  throw new Error(`Elemento nao encontrado: ${testID}`);
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

function createDeferred<TValue>() {
  let resolve!: (value: TValue | PromiseLike<TValue>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("psychologist patients screen", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).requestAnimationFrame =
      ((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }) as unknown as typeof requestAnimationFrame;
    (globalThis as Record<string, unknown>).cancelAnimationFrame = (() => undefined) as unknown as
      typeof cancelAnimationFrame;
    mockOpenURL.mockClear();
    __resetPatientsScreenCacheForTests();
  });

  it("loads patient list and profile details", async () => {
    const apiClient = createApiClient();
    let tree: ReturnType<typeof create>;

    await act(async () => {
      tree = create(React.createElement(PsychologistPatientsScreen, { apiClient }));
    });
    await flushMicrotasks();

    const root = tree!.root;
    const listItem = await waitForTestId(root, "patients-open-patient-1");
    expect(listItem).toBeDefined();
    expect(apiClient.list).toHaveBeenCalled();
    expect(apiClient.get).toHaveBeenCalledWith("access-token", "patient-1");
  });

  it("opens whatsapp fallback when phone is invalid", async () => {
    const apiClient = createApiClient({
      list: jest.fn(async () => [
        {
          id: "patient-1",
          fullName: "Paciente Aurora",
          preferredName: "Aurora",
          email: "aurora@cori.dev",
          phone: "3211-1000",
          preferredContactChannel: "whatsapp" as const,
          profileSource: "manual" as const,
          whatsappNumberValid: false,
          updatedAt: "2026-03-17T20:00:00Z",
        },
      ]),
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
    await flushMicrotasks();

    const root = tree!.root;
    const whatsappButton = await waitForTestId(root, "patients-whatsapp-patient-1");
    await act(async () => {
      whatsappButton.props.onPress({
        stopPropagation: () => undefined,
      });
    });

    expect(mockOpenURL).toHaveBeenCalledWith(
      "https://wa.me/?text=Ola!%20Passei%20aqui%20para%20alinhar%20os%20proximos%20passos%20da%20terapia.",
    );
  });

  it("aborts secondary detail loading when user returns immediately to list", async () => {
    const deferredDetail = createDeferred<PatientDetail>();
    const listChanges = jest.fn(async () => [] as PatientChange[]);
    const listTimelineEvents = jest.fn(async () => [] as PatientTimelineEvent[]);
    const resolvedDetail: PatientDetail = {
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
      communicationNotes: "Prefere texto",
      profileSource: "manual",
      whatsappNumberValid: true,
      createdAt: "2026-03-17T19:00:00Z",
      updatedAt: "2026-03-17T20:00:00Z",
    };

    const getPatient = jest
      .fn<Promise<PatientDetail>, [string, string]>()
      .mockResolvedValueOnce(resolvedDetail)
      .mockImplementation(() => deferredDetail.promise);

    const apiClient = createApiClient({
      get: getPatient,
      listChanges,
      listTimelineEvents,
    });

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(PsychologistPatientsScreen, { apiClient }));
    });
    await flushMicrotasks();

    const root = tree!.root;
    const openButton = await waitForTestId(root, "patients-open-patient-1");
    await act(async () => {
      openButton.props.onPress();
    });

    const backButton = await waitForTestId(root, "patients-back-to-list");
    await act(async () => {
      backButton.props.onPress();
    });

    await act(async () => {
      deferredDetail.resolve({
        ...resolvedDetail,
      });
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(listChanges).not.toHaveBeenCalled();
    expect(listTimelineEvents).not.toHaveBeenCalled();
  });
});
