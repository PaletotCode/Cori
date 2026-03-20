function loadEnvModule(constantsMock: unknown) {
  jest.resetModules();
  jest.doMock("expo-constants", () => constantsMock);
  return jest.requireActual("../src/shared/config/env") as typeof import("../src/shared/config/env");
}

describe("env base urls", () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_WS_URL;
    jest.resetModules();
  });

  it("returns localhost fallback when no runtime host is available", () => {
    const { getApiBaseUrl, getRealtimeBaseUrl } = loadEnvModule({ default: {} });

    expect(getApiBaseUrl()).toBe("http://localhost:8000");
    expect(getRealtimeBaseUrl()).toBe("ws://localhost:8000/ws");
  });

  it("rewrites localhost api/ws urls using expo runtime host", () => {
    process.env.EXPO_PUBLIC_API_URL = "http://localhost:8000";
    process.env.EXPO_PUBLIC_WS_URL = "ws://localhost:8000/ws";

    const { getApiBaseUrl, getRealtimeBaseUrl } = loadEnvModule({
      default: { expoGoConfig: { debuggerHost: "192.168.18.247:8084" } },
    });

    expect(getApiBaseUrl()).toBe("http://192.168.18.247:8000");
    expect(getRealtimeBaseUrl()).toBe("ws://192.168.18.247:8000/ws");
  });

  it("keeps explicit non-local api/ws urls unchanged", () => {
    process.env.EXPO_PUBLIC_API_URL = "https://api.cori.local";
    process.env.EXPO_PUBLIC_WS_URL = "wss://ws.cori.local/ws";

    const { getApiBaseUrl, getRealtimeBaseUrl } = loadEnvModule({
      default: { expoGoConfig: { debuggerHost: "192.168.18.247:8084" } },
    });

    expect(getApiBaseUrl()).toBe("https://api.cori.local");
    expect(getRealtimeBaseUrl()).toBe("wss://ws.cori.local/ws");
  });
});
