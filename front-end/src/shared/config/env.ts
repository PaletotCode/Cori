const FALLBACK_API_URL = "http://localhost:8000";
const FALLBACK_WS_PATH = "/ws";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  const envValue = process.env.EXPO_PUBLIC_API_URL;
  if (typeof envValue !== "string") {
    return FALLBACK_API_URL;
  }

  const trimmed = envValue.trim();
  return trimmed.length > 0 ? normalizeBaseUrl(trimmed) : FALLBACK_API_URL;
}

export function getRealtimeBaseUrl(): string {
  const explicitWsUrl = process.env.EXPO_PUBLIC_WS_URL;
  if (typeof explicitWsUrl === "string" && explicitWsUrl.trim().length > 0) {
    return normalizeBaseUrl(explicitWsUrl.trim());
  }

  const apiBaseUrl = getApiBaseUrl();
  const wsProtocolUrl = apiBaseUrl.startsWith("https://")
    ? apiBaseUrl.replace("https://", "wss://")
    : apiBaseUrl.replace("http://", "ws://");

  return `${wsProtocolUrl}${FALLBACK_WS_PATH}`;
}
