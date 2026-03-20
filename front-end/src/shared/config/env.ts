const FALLBACK_API_URL = "http://localhost:8000";
const FALLBACK_WS_PATH = "/ws";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

type ExpoConstantsShape = {
  expoConfig?: {
    hostUri?: string | null;
  };
  expoGoConfig?: {
    debuggerHost?: string | null;
  };
  manifest2?: {
    extra?: {
      expoClient?: {
        hostUri?: string | null;
      };
      expoGo?: {
        debuggerHost?: string | null;
      };
    };
  };
};

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname.trim().toLowerCase());
}

function extractHostname(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const withProtocol = trimmed.includes("://") ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

function getExpoRuntimeHost(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const constantsModule = require("expo-constants") as { default?: ExpoConstantsShape } | ExpoConstantsShape;
    const constants = ((constantsModule as { default?: ExpoConstantsShape }).default ??
      constantsModule) as ExpoConstantsShape;

    const candidates = [
      constants.expoGoConfig?.debuggerHost,
      constants.expoConfig?.hostUri,
      constants.manifest2?.extra?.expoGo?.debuggerHost,
      constants.manifest2?.extra?.expoClient?.hostUri,
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const host = extractHostname(candidate);
      if (host && !isLocalHostname(host)) {
        return host;
      }
    }
  } catch {
    // no-op: try react-native fallback below
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reactNative = require("react-native") as {
      NativeModules?: {
        SourceCode?: {
          scriptURL?: string | null;
        };
      };
    };
    const scriptUrl = reactNative.NativeModules?.SourceCode?.scriptURL;
    if (typeof scriptUrl === "string") {
      const host = extractHostname(scriptUrl);
      if (host && !isLocalHostname(host)) {
        return host;
      }
    }
  } catch {
    // ignore in non-native contexts
  }

  return null;
}

function resolveNetworkUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    if (!isLocalHostname(parsed.hostname)) {
      return normalizeBaseUrl(parsed.toString());
    }

    const runtimeHost = getExpoRuntimeHost();
    if (!runtimeHost) {
      return normalizeBaseUrl(parsed.toString());
    }

    parsed.hostname = runtimeHost;
    return normalizeBaseUrl(parsed.toString());
  } catch {
    return normalizeBaseUrl(baseUrl);
  }
}

export function getApiBaseUrl(): string {
  const envValue = process.env.EXPO_PUBLIC_API_URL;
  if (typeof envValue !== "string") {
    return resolveNetworkUrl(FALLBACK_API_URL);
  }

  const trimmed = envValue.trim();
  const base = trimmed.length > 0 ? trimmed : FALLBACK_API_URL;
  return resolveNetworkUrl(base);
}

export function getRealtimeBaseUrl(): string {
  const explicitWsUrl = process.env.EXPO_PUBLIC_WS_URL;
  if (typeof explicitWsUrl === "string" && explicitWsUrl.trim().length > 0) {
    return resolveNetworkUrl(explicitWsUrl.trim());
  }

  const apiBaseUrl = getApiBaseUrl();
  const wsProtocolUrl = apiBaseUrl.startsWith("https://")
    ? apiBaseUrl.replace("https://", "wss://")
    : apiBaseUrl.replace("http://", "ws://");

  return `${wsProtocolUrl}${FALLBACK_WS_PATH}`;
}
