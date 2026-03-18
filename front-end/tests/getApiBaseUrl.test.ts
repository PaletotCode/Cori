import { getApiBaseUrl } from "../src/lib/getApiBaseUrl";

describe("getApiBaseUrl", () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  it("returns fallback when env is undefined", () => {
    expect(getApiBaseUrl()).toBe("http://localhost:8000");
  });

  it("returns env value when provided", () => {
    process.env.EXPO_PUBLIC_API_URL = "https://api.cori.local";
    expect(getApiBaseUrl()).toBe("https://api.cori.local");
  });
});
