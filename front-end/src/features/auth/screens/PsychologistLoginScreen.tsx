import { Ionicons } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";

import { appColors } from "../../../shared/ui/navigationTheme";
import { shellStyles } from "../../../shared/ui/shellStyles";
import { typographyContract } from "../../../shared/ui/typography";
import { psychologistRoutes } from "../../navigation/guards";
import { sessionStore } from "../../session/store/sessionStore";
import { createTriageApiClient, TriageApiError } from "../../triage/api/triageApiClient";
import type { IntakeStatus } from "../../triage/api/types";
import {
  naturalizeErrorMessage,
  publishInAppNotification,
} from "../../notifications/utils/inAppNotifications";
import { useAuthStore } from "../hooks/useAuthStore";
import { authStore } from "../store/authStore";

type AccessRole = "psychologist" | "patient";
type AccessStep =
  | "hero"
  | "oauth"
  | "patient_code"
  | "patient_profile"
  | "patient_visual"
  | "patient_contacts"
  | "patient_review"
  | "patient_status"
  | "identification"
  | "modality";
type Modality = "online" | "presential" | "hybrid";
type OAuthStageId = "exchange" | "token" | "session";
type OAuthStageStatus = "pending" | "completed" | "failed";

const GOOGLE_DISCOVERY: AuthSession.AuthDiscoveryDocument = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
};

WebBrowser.maybeCompleteAuthSession();

interface OAuthStage {
  id: OAuthStageId;
  label: string;
  status: OAuthStageStatus;
  detail: string;
}

interface OAuthStatePayload {
  role: AccessRole;
  tenantId: string;
  nonce: string;
}

interface PendingOAuthState extends OAuthStatePayload {
  codeVerifier: string;
  redirectUri: string;
}

interface PendingPatientOAuthExchange extends PendingOAuthState {
  authorizationCode: string;
}

const APPROACH_OPTIONS = [
  "TCC - Terapia Cognitivo Comportamental",
  "Psicanálise",
  "Gestalt-terapia",
  "Humanista",
  "Análise do Comportamento",
  "Sistêmica",
  "Fenomenológico-existencial",
];

const MODALITY_OPTIONS: Array<{ id: Modality; label: string }> = [
  { id: "online", label: "Online" },
  { id: "presential", label: "Presencial" },
  { id: "hybrid", label: "Híbrido" },
];
const PATIENT_STATUS_POLL_INTERVAL_MS = 12_000;

function encodeOAuthState(payload: OAuthStatePayload): string {
  return encodeURIComponent(JSON.stringify(payload));
}

function decodeOAuthState(value: string | null): OAuthStatePayload | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as OAuthStatePayload;
    if (
      (parsed.role === "psychologist" || parsed.role === "patient") &&
      typeof parsed.tenantId === "string" &&
      parsed.tenantId.length > 0 &&
      typeof parsed.nonce === "string" &&
      parsed.nonce.length >= 6
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function createNonce(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

const CODE_VERIFIER_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

function createCodeVerifier(length = 64): string {
  const size = Math.max(43, Math.min(128, length));

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const randomValues = new Uint8Array(size);
    crypto.getRandomValues(randomValues);
    return Array.from(randomValues, (value) => CODE_VERIFIER_CHARSET[value % CODE_VERIFIER_CHARSET.length]).join("");
  }

  let fallback = "";
  while (fallback.length < size) {
    fallback += Math.random().toString(36).slice(2);
  }
  return fallback.slice(0, size);
}

function buildOAuthStages(): OAuthStage[] {
  return [
    {
      id: "exchange",
      label: "Exchange Code",
      status: "pending",
      detail: "Aguardando retorno do Google para autorização.",
    },
    {
      id: "token",
      label: "Token",
      status: "pending",
      detail: "Aguardando troca de code por token de sessão.",
    },
    {
      id: "session",
      label: "Session",
      status: "pending",
      detail: "Aguardando validação JWT e fechamento da sessão.",
    },
  ];
}

function updateOAuthStage(
  stages: OAuthStage[],
  id: OAuthStageId,
  status: OAuthStageStatus,
  detail: string,
): OAuthStage[] {
  return stages.map((stage) =>
    stage.id === id
      ? {
          ...stage,
          status,
          detail,
        }
      : stage,
  );
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(padded);
  }
  throw new Error("Runtime sem suporte a decodificação JWT.");
}

function validateJwt(accessToken: string): {
  valid: boolean;
  reason: string;
  tenantIdClaim: string | null;
} {
  const chunks = accessToken.split(".");
  if (chunks.length !== 3) {
    return { valid: false, reason: "JWT inválido: formato incompatível.", tenantIdClaim: null };
  }

  try {
    const claims = JSON.parse(decodeBase64Url(chunks[1])) as Record<string, unknown>;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const exp = claims.exp;
    const nbf = claims.nbf;
    const tokenTenant = claims.tenant_id ?? claims.tenantId ?? claims.tid;

    if (typeof exp !== "number" || exp <= nowSeconds) {
      return { valid: false, reason: "JWT expirado ou sem claim exp válida.", tenantIdClaim: null };
    }
    if (typeof nbf === "number" && nbf > nowSeconds) {
      return { valid: false, reason: "JWT ainda não habilitado (claim nbf).", tenantIdClaim: null };
    }

    return {
      valid: true,
      reason: "JWT validado no client-side.",
      tenantIdClaim: typeof tokenTenant === "string" && tokenTenant.length > 0 ? tokenTenant : null,
    };
  } catch {
    return { valid: false, reason: "JWT inválido: payload não decodificável.", tenantIdClaim: null };
  }
}

function isExpoProxyRedirectUri(redirectUri: string): boolean {
  return redirectUri.startsWith("https://auth.expo.io/");
}

function resolveGoogleClientId(redirectUri: string): string {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "";
  const prefersWebClient = isExpoProxyRedirectUri(redirectUri);

  if (prefersWebClient) {
    return webClientId;
  }
  return iosClientId.length > 0 ? iosClientId : webClientId;
}

function resolveTenantId(tenantFromQuery: string | null): string {
  if (tenantFromQuery && tenantFromQuery.trim().length > 0) {
    return tenantFromQuery.trim();
  }
  const fromEnv = process.env.EXPO_PUBLIC_DEFAULT_TENANT_ID;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return "cori-main";
}

function resolveGoogleRedirectUri(): string {
  const envRedirectUri = process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI;
  if (typeof envRedirectUri === "string" && envRedirectUri.trim().length > 0) {
    return envRedirectUri.trim();
  }
  return AuthSession.makeRedirectUri({
    path: "psicologo/login",
  });
}

function buildExpoProxyStartUrl(proxyRedirectUri: string, authUrl: string): { startUrl: string; returnUrl: string } {
  const returnUrl = AuthSession.getDefaultReturnUrl();
  const query = new URLSearchParams({
    authUrl,
    returnUrl,
  });
  return {
    startUrl: `${proxyRedirectUri.replace(/\/$/, "")}/start?${query.toString()}`,
    returnUrl,
  };
}

function splitIsoBirthDate(value: string | null): { day: string; month: string; year: string } {
  if (!value || value.length < 10) {
    return { day: "", month: "", year: "" };
  }
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return { day: "", month: "", year: "" };
  }
  return { day, month, year };
}

function buildIsoBirthDate(day: string, month: string, year: string): string | undefined {
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) {
    return undefined;
  }
  const iso = `${year}-${month}-${day}`;
  const candidate = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(candidate.getTime())) {
    return undefined;
  }
  if (
    candidate.getUTCFullYear() !== Number(year) ||
    candidate.getUTCMonth() + 1 !== Number(month) ||
    candidate.getUTCDate() !== Number(day)
  ) {
    return undefined;
  }
  return iso;
}

function resolvePatientStatusMessage(status: IntakeStatus, complementRequestNote: string | null): string {
  if (status === "pending_submission") {
    return "Complete seus dados para enviar sua triagem inicial.";
  }
  if (status === "submitted") {
    return "Triagem enviada. Agora aguarde a revisão do seu psicólogo.";
  }
  if (status === "complement_requested") {
    return complementRequestNote?.trim().length
      ? complementRequestNote
      : "Seu psicólogo solicitou complemento das informações.";
  }
  if (status === "approved") {
    return "Triagem aprovada. Seu acesso foi liberado com sucesso.";
  }
  if (status === "rejected") {
    return "Sua triagem não foi aprovada neste momento. Fale com seu psicólogo para orientação.";
  }
  return "Este convite expirou. Solicite um novo código ao seu psicólogo.";
}

export function PsychologistLoginScreen() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const authRole = useAuthStore((state) => state.role);
  const loading = useAuthStore((state) => state.loading);
  const authError = useAuthStore((state) => state.error);
  const onboardingCompleted = useAuthStore((state) => state.profile?.onboardingCompleted ?? null);

  const tenantId = useMemo(() => resolveTenantId(null), []);
  const triageClient = useMemo(() => createTriageApiClient(), []);

  const [step, setStep] = useState<AccessStep>("hero");
  const [selectedRole, setSelectedRole] = useState<AccessRole | null>(null);
  const [oauthStages, setOAuthStages] = useState<OAuthStage[]>(buildOAuthStages());
  const [oauthFeedback, setOAuthFeedback] = useState<string | null>(null);
  const [onboardingFeedback, setOnboardingFeedback] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [patientAccessCode, setPatientAccessCode] = useState("");
  const [pendingPatientOAuth, setPendingPatientOAuth] = useState<PendingPatientOAuthExchange | null>(
    null,
  );
  const [patientIntakeId, setPatientIntakeId] = useState<string | null>(null);
  const [patientIntakeMode, setPatientIntakeMode] = useState<"simple_invite" | "custom_triage" | null>(null);
  const [patientIntakeStatus, setPatientIntakeStatus] = useState<IntakeStatus | null>(null);
  const [patientFlowBusy, setPatientFlowBusy] = useState(false);
  const [patientStatusMessage, setPatientStatusMessage] = useState<string | null>(null);
  const [patientLastSyncLabel, setPatientLastSyncLabel] = useState<string | null>(null);
  const [patientFullName, setPatientFullName] = useState("");
  const [patientPreferredName, setPatientPreferredName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientBirthDay, setPatientBirthDay] = useState("");
  const [patientBirthMonth, setPatientBirthMonth] = useState("");
  const [patientBirthYear, setPatientBirthYear] = useState("");
  const [patientPronouns, setPatientPronouns] = useState("");
  const [patientEmergencyContactName, setPatientEmergencyContactName] = useState("");
  const [patientEmergencyContactPhone, setPatientEmergencyContactPhone] = useState("");
  const [patientCommunicationNotes, setPatientCommunicationNotes] = useState("");
  const [patientProfilePhotoUrl, setPatientProfilePhotoUrl] = useState("");
  const [patientProfileBannerUrl, setPatientProfileBannerUrl] = useState("");
  const [patientConsentTerms, setPatientConsentTerms] = useState(false);
  const [patientConsentPrivacy, setPatientConsentPrivacy] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [approachSearch, setApproachSearch] = useState("");
  const [approachSelected, setApproachSelected] = useState("");
  const [birthdayDay, setBirthdayDay] = useState("");
  const [birthdayMonth, setBirthdayMonth] = useState("");
  const [birthdayYear, setBirthdayYear] = useState("");
  const [modality, setModality] = useState<Modality | null>(null);

  const logoProgress = useRef(new Animated.Value(0)).current;
  const contentProgress = useRef(new Animated.Value(1)).current;
  const lastOAuthFeedbackRef = useRef<string | null>(null);
  const lastAuthErrorRef = useRef<string | null>(null);
  const lastOnboardingFeedbackRef = useRef<string | null>(null);

  const filteredApproaches = useMemo(() => {
    const source = approachSearch.trim().length > 0 ? approachSearch : approachSelected;
    const search = source.trim().toLowerCase();
    if (search.length === 0) {
      return APPROACH_OPTIONS;
    }
    return APPROACH_OPTIONS.filter((option) => option.toLowerCase().includes(search));
  }, [approachSearch, approachSelected]);

  const isIdentificationValid = useMemo(() => {
    return (
      displayName.trim().length >= 2 &&
      approachSelected.trim().length >= 4 &&
      birthdayDay.length === 2 &&
      birthdayMonth.length === 2 &&
      birthdayYear.length === 4
    );
  }, [approachSelected, birthdayDay.length, birthdayMonth.length, birthdayYear.length, displayName]);

  const patientBirthDateIso = useMemo(
    () => buildIsoBirthDate(patientBirthDay, patientBirthMonth, patientBirthYear),
    [patientBirthDay, patientBirthMonth, patientBirthYear],
  );

  const isPatientProfileStepValid = useMemo(() => {
    const hasContact = patientEmail.trim().length > 0 || patientPhone.trim().length > 0;
    return patientFullName.trim().length >= 3 && hasContact;
  }, [patientEmail, patientFullName, patientPhone]);

  const isPatientReviewValid = useMemo(() => {
    return isPatientProfileStepValid && patientConsentPrivacy && patientConsentTerms;
  }, [isPatientProfileStepValid, patientConsentPrivacy, patientConsentTerms]);

  useEffect(() => {
    Animated.timing(logoProgress, {
      toValue: step === "hero" ? 0 : 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [logoProgress, step]);

  useEffect(() => {
    contentProgress.setValue(0);
    Animated.timing(contentProgress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [contentProgress, step]);

  useEffect(() => {
    if (oauthFeedback === null) {
      lastOAuthFeedbackRef.current = null;
      return;
    }
    if (lastOAuthFeedbackRef.current === oauthFeedback) {
      return;
    }
    lastOAuthFeedbackRef.current = oauthFeedback;
    publishInAppNotification({
      title: "Nao foi possivel concluir sua autenticacao",
      body: naturalizeErrorMessage(oauthFeedback),
      variant: "error",
      eventType: "ui_oauth_error",
      entityType: "login_flow",
    });
  }, [oauthFeedback]);

  useEffect(() => {
    if (authError === null) {
      lastAuthErrorRef.current = null;
      return;
    }
    if (lastAuthErrorRef.current === authError) {
      return;
    }
    lastAuthErrorRef.current = authError;
    publishInAppNotification({
      title: "Nao foi possivel continuar agora",
      body: naturalizeErrorMessage(authError),
      variant: "error",
      eventType: "ui_auth_error",
      entityType: "login_flow",
    });
  }, [authError]);

  useEffect(() => {
    if (onboardingFeedback === null) {
      lastOnboardingFeedbackRef.current = null;
      return;
    }
    if (lastOnboardingFeedbackRef.current === onboardingFeedback) {
      return;
    }
    lastOnboardingFeedbackRef.current = onboardingFeedback;

    const feedback = onboardingFeedback.trim();
    const normalized = feedback.toLowerCase();
    const isSuccess =
      normalized.includes("acesso confirmado") || normalized.includes("concluida com sucesso");

    publishInAppNotification({
      title: isSuccess ? "Acesso confirmado" : "Nao foi possivel concluir esta etapa",
      body: isSuccess ? feedback : naturalizeErrorMessage(feedback),
      variant: isSuccess ? "success" : "error",
      eventType: isSuccess ? "ui_onboarding_success" : "ui_onboarding_error",
      entityType: "login_flow",
    });
  }, [onboardingFeedback]);

  const patientBootstrapRef = useRef(false);

  const hydrateAuthenticatedPatientIntake = useCallback(
    async (forceStep: boolean) => {
      const accessToken = authStore.getState().tokens?.accessToken ?? "";
      if (!accessToken) {
        return;
      }
      setPatientFlowBusy(true);
      setOAuthFeedback(null);

      try {
        const intake = await triageClient.getPatientIntake(accessToken);
        const birthDateParts = splitIsoBirthDate(intake.patientBirthDate);
        setPatientIntakeId(intake.intakeId);
        setPatientIntakeMode(intake.mode);
        setPatientIntakeStatus(intake.status);
        setPatientFullName(intake.patientFullName ?? "");
        setPatientPreferredName(intake.patientPreferredName ?? "");
        setPatientEmail(intake.patientEmail ?? "");
        setPatientPhone(intake.patientPhone ?? "");
        setPatientBirthDay(birthDateParts.day);
        setPatientBirthMonth(birthDateParts.month);
        setPatientBirthYear(birthDateParts.year);
        setPatientPronouns(intake.patientPronouns ?? "");
        setPatientEmergencyContactName(intake.patientEmergencyContactName ?? "");
        setPatientEmergencyContactPhone(intake.patientEmergencyContactPhone ?? "");
        setPatientCommunicationNotes(intake.patientCommunicationNotes ?? "");
        setPatientProfilePhotoUrl(intake.patientProfilePhotoUrl ?? "");
        setPatientProfileBannerUrl(intake.patientProfileBannerUrl ?? "");
        const defaultStatusMessage = resolvePatientStatusMessage(
          intake.status,
          intake.complementRequestNote,
        );
        setPatientStatusMessage(
          intake.mode === "custom_triage"
            ? "Sua triagem personalizada ainda nao esta disponivel neste fluxo. Solicite orientacao ao psicologo."
            : defaultStatusMessage,
        );
        setPatientLastSyncLabel(
          new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        );

        if (forceStep) {
          if (
            intake.mode === "simple_invite" &&
            (intake.status === "pending_submission" || intake.status === "complement_requested")
          ) {
            setStep("patient_profile");
          } else {
            setStep("patient_status");
          }
        }
      } catch (error) {
        const message =
          error instanceof TriageApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Nao foi possivel carregar sua triagem agora.";
        setPatientStatusMessage(message);
        setStep("patient_status");
      } finally {
        setPatientFlowBusy(false);
      }
    },
    [triageClient],
  );

  useEffect(() => {
    if (status === "authenticated" && authRole === "patient") {
      setSelectedRole("patient");
      if (!patientBootstrapRef.current) {
        patientBootstrapRef.current = true;
        void hydrateAuthenticatedPatientIntake(step === "hero" || step === "patient_code");
      }
      return;
    }
    patientBootstrapRef.current = false;
  }, [authRole, hydrateAuthenticatedPatientIntake, status, step]);

  useEffect(() => {
    if (status !== "authenticated" || authRole !== "psychologist") {
      return;
    }
    if (onboardingCompleted) {
      router.replace(psychologistRoutes.session);
      return;
    }
    if (step === "hero") {
      setStep("identification");
      setSelectedRole("psychologist");
    }
  }, [authRole, onboardingCompleted, router, status, step]);

  useEffect(() => {
    if (status !== "authenticated" || authRole !== "patient") {
      return;
    }
    if (step !== "patient_status") {
      return;
    }
    if (
      patientIntakeStatus !== "pending_submission" &&
      patientIntakeStatus !== "submitted" &&
      patientIntakeStatus !== "complement_requested"
    ) {
      return;
    }
    const interval = setInterval(() => {
      void hydrateAuthenticatedPatientIntake(false);
    }, PATIENT_STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [authRole, hydrateAuthenticatedPatientIntake, patientIntakeStatus, status, step]);

  const finalizeOAuthCallback = useCallback(
    async ({
      authorizationCode,
      rawState,
      pendingState,
    }: {
      authorizationCode: string;
      rawState: string | null;
      pendingState: PendingOAuthState;
    }) => {
      const parsedState = decodeOAuthState(rawState);
      setStep("oauth");
      setOAuthFeedback(null);
      setOAuthStages((previous) =>
        updateOAuthStage(previous, "exchange", "completed", "Authorization code recebido no callback."),
      );

      if (
        parsedState === null ||
        parsedState.nonce !== pendingState.nonce ||
        parsedState.role !== pendingState.role ||
        parsedState.tenantId !== pendingState.tenantId
      ) {
        setOAuthFeedback("State OAuth inválido. Refaça o login para proteger o callback.");
        setOAuthStages((previous) =>
          updateOAuthStage(previous, "exchange", "failed", "State inválido ou divergente."),
        );
        setStep("hero");
        return;
      }

      if (parsedState.role === "patient") {
        setPendingPatientOAuth({
          ...pendingState,
          authorizationCode,
        });
        setSelectedRole("patient");
        setOAuthStages((previous) =>
          updateOAuthStage(
            previous,
            "token",
            "pending",
            "OAuth concluido. Informe o codigo de acesso para entrar no tenant.",
          ),
        );
        setStep("patient_code");
        return;
      }

      try {
        // Callback OAuth:
        // 1) Exchange Code: AuthSession retorna `code` + `state` validados.
        // 2) Token: client chama /auth/google/exchange.
        // 3) Session: client valida JWT e fecha sessão local.
        await authStore.actions.loginWithGoogle({
          code: authorizationCode,
          tenantId: parsedState.tenantId,
          redirectUri: pendingState.redirectUri,
          role: parsedState.role,
          stateNonce: parsedState.nonce,
          codeVerifier: pendingState.codeVerifier,
        });
      } catch (error) {
        setOAuthFeedback(error instanceof Error ? error.message : "Falha ao trocar code por token.");
        setOAuthStages((previous) =>
          updateOAuthStage(previous, "token", "failed", "Backend rejeitou o exchange OAuth."),
        );
        setStep("hero");
        return;
      }

      setOAuthStages((previous) =>
        updateOAuthStage(previous, "token", "completed", "Token de sessão recebido e persistido."),
      );

      const accessToken = authStore.getState().tokens?.accessToken ?? "";
      const jwtValidation = validateJwt(accessToken);
      if (!jwtValidation.valid) {
        await authStore.actions.logout();
        setOAuthFeedback(jwtValidation.reason);
        setOAuthStages((previous) =>
          updateOAuthStage(previous, "session", "failed", jwtValidation.reason),
        );
        setStep("hero");
        return;
      }

      const profileTenantId = authStore.getState().profile?.tenantId ?? null;
      if (
        jwtValidation.tenantIdClaim !== null &&
        profileTenantId !== null &&
        profileTenantId.length > 0 &&
        jwtValidation.tenantIdClaim !== profileTenantId
      ) {
        await authStore.actions.logout();
        setOAuthFeedback("JWT pertence a outro tenant.");
        setOAuthStages((previous) =>
          updateOAuthStage(previous, "session", "failed", "Tenant do JWT diverge do perfil da sessão."),
        );
        setStep("hero");
        return;
      }

      setOAuthStages((previous) =>
        updateOAuthStage(previous, "session", "completed", jwtValidation.reason),
      );
      sessionStore.actions.setActiveArea("psychologist");

      setSelectedRole(parsedState.role);
      setStep("identification");
    },
    [],
  );

  const startGoogleOAuth = useCallback(
    async (role: AccessRole) => {
      authStore.actions.clearError();
      const redirectUri = resolveGoogleRedirectUri();
      const clientId = resolveGoogleClientId(redirectUri);
      if (clientId.length === 0) {
        setOAuthFeedback(
          isExpoProxyRedirectUri(redirectUri)
            ? "Defina EXPO_PUBLIC_GOOGLE_CLIENT_ID para OAuth via auth.expo.io."
            : "Defina EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID (ou EXPO_PUBLIC_GOOGLE_CLIENT_ID) para habilitar OAuth.",
        );
        setStep("hero");
        return;
      }

      const statePayload: OAuthStatePayload = {
        role,
        tenantId,
        nonce: createNonce(),
      };
      const authRequest = new AuthSession.AuthRequest({
        clientId,
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        scopes: ["openid", "profile", "email"],
        prompt: AuthSession.Prompt.Consent,
        state: encodeOAuthState(statePayload),
        usePKCE: true,
        extraParams: {
          access_type: "offline",
          nonce: statePayload.nonce,
        },
      });

      setSelectedRole(role);
      setOAuthFeedback(null);
      setOAuthStages(buildOAuthStages());
      setStep("oauth");
      setOauthBusy(true);

      try {
        await authRequest.makeAuthUrlAsync(GOOGLE_DISCOVERY);
        const pendingState: PendingOAuthState = {
          ...statePayload,
          codeVerifier: authRequest.codeVerifier ?? createCodeVerifier(),
          redirectUri,
        };

        let oauthResult: AuthSession.AuthSessionResult;
        if (isExpoProxyRedirectUri(redirectUri)) {
          if (!authRequest.url) {
            throw new Error("Falha ao montar URL de autorização para o proxy Expo.");
          }
          const { startUrl, returnUrl } = buildExpoProxyStartUrl(redirectUri, authRequest.url);
          setOAuthStages((previous) =>
            updateOAuthStage(
              previous,
              "exchange",
              "pending",
              "Proxy Expo iniciado. Aguardando retorno seguro ao app.",
            ),
          );
          const browserResult = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);
          if (browserResult.type !== "success") {
            setOAuthFeedback("OAuth cancelado antes do callback.");
            setOAuthStages((previous) =>
              updateOAuthStage(previous, "exchange", "failed", "Fluxo interrompido no navegador."),
            );
            setStep("hero");
            return;
          }
          oauthResult = authRequest.parseReturnUrl(browserResult.url);
        } else {
          setOAuthStages((previous) =>
            updateOAuthStage(
              previous,
              "exchange",
              "pending",
              "Navegador aberto. Aguardando callback nativo.",
            ),
          );
          oauthResult = await authRequest.promptAsync(GOOGLE_DISCOVERY, {
            showInRecents: true,
          });
        }

        if (oauthResult.type === "error") {
          setOAuthFeedback(
            oauthResult.error?.description ??
              oauthResult.error?.message ??
              "Google retornou erro no callback.",
          );
          setOAuthStages((previous) =>
            updateOAuthStage(previous, "exchange", "failed", "Google retornou erro no callback."),
          );
          setStep("hero");
          return;
        }

        if (oauthResult.type !== "success") {
          setOAuthFeedback("OAuth cancelado antes de concluir o callback.");
          setOAuthStages((previous) =>
            updateOAuthStage(previous, "exchange", "failed", "Fluxo interrompido pelo usuário."),
          );
          setStep("hero");
          return;
        }

        const authorizationCode = oauthResult.params.code;
        if (!authorizationCode) {
          setOAuthFeedback("Google não retornou authorization code no callback.");
          setOAuthStages((previous) =>
            updateOAuthStage(previous, "exchange", "failed", "Callback sem authorization code."),
          );
          setStep("hero");
          return;
        }

        await finalizeOAuthCallback({
          authorizationCode,
          rawState: oauthResult.params.state ?? null,
          pendingState,
        });
      } catch (error) {
        setStep("hero");
        setOAuthFeedback(
          error instanceof Error
            ? error.message
            : "Falha ao abrir sessão segura para autenticação Google.",
        );
      } finally {
        setOauthBusy(false);
      }
    },
    [finalizeOAuthCallback, tenantId],
  );

  const handlePatientAccessCodeSubmit = useCallback(async () => {
    authStore.actions.clearError();
    if (pendingPatientOAuth === null) {
      setOAuthFeedback("Sessao OAuth do paciente nao encontrada. Inicie o login novamente.");
      setStep("hero");
      return;
    }

    const normalizedCode = patientAccessCode.trim().toUpperCase();
    if (normalizedCode.length < 7) {
      setOAuthFeedback("Informe o codigo de acesso completo para validar o primeiro acesso.");
      return;
    }

    setOauthBusy(true);
    setOAuthFeedback(null);
    setStep("oauth");
    setOAuthStages((previous) =>
      updateOAuthStage(
        previous,
        "token",
        "pending",
        "Validando codigo de acesso e vinculando login ao tenant do paciente.",
      ),
    );

    try {
      await authStore.actions.loginWithGoogle({
        code: pendingPatientOAuth.authorizationCode,
        tenantId: pendingPatientOAuth.tenantId,
        redirectUri: pendingPatientOAuth.redirectUri,
        role: "patient",
        stateNonce: pendingPatientOAuth.nonce,
        codeVerifier: pendingPatientOAuth.codeVerifier,
        intakeAccessCode: normalizedCode,
      });
    } catch (error) {
      setOAuthFeedback(error instanceof Error ? error.message : "Falha ao validar codigo de acesso.");
      setOAuthStages((previous) =>
        updateOAuthStage(previous, "token", "failed", "Codigo de acesso rejeitado para este login."),
      );
      setStep("patient_code");
      setOauthBusy(false);
      return;
    }

    const accessToken = authStore.getState().tokens?.accessToken ?? "";
    const jwtValidation = validateJwt(accessToken);
    if (!jwtValidation.valid) {
      await authStore.actions.logout();
      setOAuthFeedback(jwtValidation.reason);
      setOAuthStages((previous) =>
        updateOAuthStage(previous, "session", "failed", jwtValidation.reason),
      );
      setStep("patient_code");
      setOauthBusy(false);
      return;
    }

    setOAuthStages((previous) =>
      updateOAuthStage(previous, "token", "completed", "Codigo validado e sessao do paciente iniciada."),
    );
    setOAuthStages((previous) =>
      updateOAuthStage(previous, "session", "completed", jwtValidation.reason),
    );

    setPendingPatientOAuth(null);
    setSelectedRole("patient");
    setOnboardingFeedback("Acesso confirmado. Continue sua triagem inicial.");
    patientBootstrapRef.current = true;
    await hydrateAuthenticatedPatientIntake(true);
    setOauthBusy(false);
  }, [hydrateAuthenticatedPatientIntake, patientAccessCode, pendingPatientOAuth]);

  const floatingLogoStyle = useMemo(
    () => ({
      transform: [
        {
          translateY: logoProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [92, 0],
          }),
        },
        {
          scale: logoProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [1.18, 0.74],
          }),
        },
      ],
    }),
    [logoProgress],
  );

  const topHeaderOpacity = useMemo(
    () => ({
      opacity: logoProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    }),
    [logoProgress],
  );

  const contentAnimatedStyle = useMemo(
    () => ({
      opacity: contentProgress,
      transform: [
        {
          translateY: contentProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [10, 0],
          }),
        },
      ],
    }),
    [contentProgress],
  );

  async function handleFinishFlow() {
    if (modality === null || loading) {
      return;
    }
    setOnboardingFeedback(null);
    try {
      await authStore.actions.completePsychologistOnboarding({
        displayName: displayName.trim(),
        clinicalApproach: approachSelected.trim(),
        serviceModality: modality,
      });
      router.replace(psychologistRoutes.session);
    } catch (error) {
      setOnboardingFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel concluir o onboarding agora.",
      );
    }
  }

  const canEditPatientTriage = useMemo(() => {
    return (
      patientIntakeMode === "simple_invite" &&
      (patientIntakeStatus === "pending_submission" || patientIntakeStatus === "complement_requested")
    );
  }, [patientIntakeMode, patientIntakeStatus]);

  const handlePatientSubmit = useCallback(async () => {
    const accessToken = authStore.getState().tokens?.accessToken ?? "";
    if (!accessToken) {
      setOAuthFeedback("Sessao do paciente indisponivel. Entre novamente para continuar.");
      return;
    }
    if (!isPatientReviewValid) {
      setOAuthFeedback("Preencha os dados obrigatorios e confirme os termos para enviar sua triagem.");
      return;
    }

    setPatientFlowBusy(true);
    setOAuthFeedback(null);
    try {
      await triageClient.submitPatientIntake(accessToken, {
        patientFullName: patientFullName.trim(),
        patientPreferredName: patientPreferredName.trim() || undefined,
        patientEmail: patientEmail.trim().toLowerCase() || undefined,
        patientPhone: patientPhone.trim() || undefined,
        patientBirthDate: patientBirthDateIso,
        patientPronouns: patientPronouns.trim() || undefined,
        patientEmergencyContactName: patientEmergencyContactName.trim() || undefined,
        patientEmergencyContactPhone: patientEmergencyContactPhone.trim() || undefined,
        patientCommunicationNotes: patientCommunicationNotes.trim() || undefined,
        patientProfilePhotoUrl: patientProfilePhotoUrl.trim() || undefined,
        patientProfileBannerUrl: patientProfileBannerUrl.trim() || undefined,
        consentTermsAccepted: true,
        consentPrivacyAccepted: true,
      });
      await hydrateAuthenticatedPatientIntake(true);
      setStep("patient_status");
    } catch (error) {
      setOAuthFeedback(
        error instanceof TriageApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Nao foi possivel enviar sua triagem neste momento.",
      );
    } finally {
      setPatientFlowBusy(false);
    }
  }, [
    hydrateAuthenticatedPatientIntake,
    isPatientReviewValid,
    patientBirthDateIso,
    patientCommunicationNotes,
    patientEmail,
    patientEmergencyContactName,
    patientEmergencyContactPhone,
    patientFullName,
    patientPhone,
    patientPreferredName,
    patientProfileBannerUrl,
    patientProfilePhotoUrl,
    patientPronouns,
    triageClient,
  ]);

  return (
    <View style={[styles.screen, shellStyles.viewContainer]}>
      <Animated.View style={[styles.floatingLogoWrapper, floatingLogoStyle]}>
        <View style={styles.logoCapsule}>
          <Text style={styles.logoText}>CORI</Text>
        </View>
      </Animated.View>

      <Animated.View style={[styles.topHeaderContainer, topHeaderOpacity]}>
        <View style={styles.topHeaderCard}>
          <Text style={styles.topHeaderTenant}>Tenant {tenantId}</Text>
        </View>
      </Animated.View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          step === "hero" ? styles.scrollHero : styles.scrollStep,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={contentAnimatedStyle}>
          {step === "hero" ? (
            <View style={styles.heroCard}>
              <View style={styles.heroBannerTop}>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>Acesso Cori</Text>
                </View>
              </View>

              <View style={styles.heroBody}>
                <Text style={styles.heroTitle}>
                  Seja bem vindo a nova gestão da sua clínica, fácil, guiada e tranquila.
                </Text>
                <Text style={styles.heroSubtitle}>
                  Onboarding unificado para Psicólogo e triagem inicial em um fluxo só.
                </Text>

                <View style={styles.rowButtons}>
                  <CoriActionButton
                    label="Sou Psicólogo(a)"
                    onPress={() => void startGoogleOAuth("psychologist")}
                    disabled={oauthBusy}
                  />
                  <CoriActionButton
                    label="Sou Paciente"
                    onPress={() => void startGoogleOAuth("patient")}
                    disabled={oauthBusy}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {step === "oauth" ? (
            <View style={styles.stepCard}>
              <Stepper current={1} total={3} />
              <Text style={styles.stepTitle}>Conectando com Google OAuth</Text>
              <Text style={styles.stepSubtitle}>
                Perfil selecionado: {selectedRole === "patient" ? "Paciente" : "Psicólogo(a)"}
              </Text>

              {oauthStages.map((stage) => (
                <View key={stage.id} style={styles.stageCard}>
                  <View style={styles.stageHeader}>
                    <Text style={styles.stageLabel}>{stage.label}</Text>
                    <Text
                      style={[
                        styles.stageStatus,
                        stage.status === "completed"
                          ? styles.stageStatusCompleted
                          : stage.status === "failed"
                            ? styles.stageStatusFailed
                            : styles.stageStatusPending,
                      ]}
                    >
                      {stage.status}
                    </Text>
                  </View>
                  <Text style={styles.stageDetail}>{stage.detail}</Text>
                </View>
              ))}

              <Text style={styles.stepHint}>
                Callback OAuth: Exchange Code - Token - Session.
              </Text>
              <CoriActionButton label="Voltar" onPress={() => setStep("hero")} />
            </View>
          ) : null}

          {step === "patient_code" ? (
            <View style={styles.stepCard}>
              <Stepper current={1} total={5} />
              <Text style={styles.stepTitle}>Codigo de acesso do paciente</Text>
              <Text style={styles.stepSubtitle}>
                Entre com o codigo compartilhado pelo psicologo para vincular seu login ao tenant.
              </Text>

              <LabeledInput
                label="Codigo de acesso"
                value={patientAccessCode}
                onChangeText={setPatientAccessCode}
                placeholder="Ex.: COR4D08-8635-84"
                autoCapitalize="characters"
                autoCorrect={false}
              />

              <View style={styles.rowButtons}>
                <CoriActionButton
                  label="Validar codigo"
                  onPress={() => void handlePatientAccessCodeSubmit()}
                  disabled={oauthBusy}
                />
                <CoriActionButton
                  label="Voltar"
                  onPress={() => {
                    setPendingPatientOAuth(null);
                    setPatientAccessCode("");
                    setStep("hero");
                  }}
                  disabled={oauthBusy}
                />
              </View>
            </View>
          ) : null}

          {step === "patient_profile" ? (
            <View style={styles.stepCard}>
              <Stepper current={1} total={5} />
              <Text style={styles.stepTitle}>Identificacao do paciente</Text>
              <Text style={styles.stepSubtitle}>
                Preencha seus dados principais para iniciar a triagem.
              </Text>

              <LabeledInput
                label="Nome completo"
                value={patientFullName}
                onChangeText={setPatientFullName}
                placeholder="Ex.: Maria da Silva"
                autoCapitalize="words"
              />
              <LabeledInput
                label="Como prefere ser chamada?"
                value={patientPreferredName}
                onChangeText={setPatientPreferredName}
                placeholder="Ex.: Maria"
                autoCapitalize="words"
              />
              <LabeledInput
                label="E-mail"
                value={patientEmail}
                onChangeText={setPatientEmail}
                placeholder="voce@email.com"
                autoCapitalize="none"
              />
              <LabeledInput
                label="Telefone"
                value={patientPhone}
                onChangeText={setPatientPhone}
                placeholder="+55 65 99999-0000"
                autoCapitalize="none"
              />
              <Text style={styles.stepHint}>Informe e-mail ou telefone para contato.</Text>

              <View style={styles.rowButtons}>
                <CoriActionButton label="Voltar" onPress={() => setStep("patient_code")} />
                <CoriActionButton
                  label="Continuar"
                  onPress={() => setStep("patient_visual")}
                  disabled={!isPatientProfileStepValid}
                />
              </View>
            </View>
          ) : null}

          {step === "patient_visual" ? (
            <View style={styles.stepCard}>
              <Stepper current={2} total={5} />
              <Text style={styles.stepTitle}>Perfil visual e pessoal</Text>
              <Text style={styles.stepSubtitle}>
                Estes dados alimentam o card de paciente e melhoram sua identificação no app.
              </Text>

              <Text style={styles.fieldLabel}>Data de nascimento</Text>
              <View style={styles.dateRow}>
                <CompactInput
                  value={patientBirthDay}
                  onChangeText={(value) => setPatientBirthDay(value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="DD"
                />
                <CompactInput
                  value={patientBirthMonth}
                  onChangeText={(value) => setPatientBirthMonth(value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="MM"
                />
                <CompactInput
                  value={patientBirthYear}
                  onChangeText={(value) => setPatientBirthYear(value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="AAAA"
                />
              </View>
              <LabeledInput
                label="Pronomes"
                value={patientPronouns}
                onChangeText={setPatientPronouns}
                placeholder="Ex.: ela/dela"
              />
              <LabeledInput
                label="Link da foto de perfil"
                value={patientProfilePhotoUrl}
                onChangeText={setPatientProfilePhotoUrl}
                placeholder="https://..."
                autoCapitalize="none"
              />
              <LabeledInput
                label="Link do banner do perfil"
                value={patientProfileBannerUrl}
                onChangeText={setPatientProfileBannerUrl}
                placeholder="https://..."
                autoCapitalize="none"
              />

              <View style={styles.rowButtons}>
                <CoriActionButton label="Voltar" onPress={() => setStep("patient_profile")} />
                <CoriActionButton label="Continuar" onPress={() => setStep("patient_contacts")} />
              </View>
            </View>
          ) : null}

          {step === "patient_contacts" ? (
            <View style={styles.stepCard}>
              <Stepper current={3} total={5} />
              <Text style={styles.stepTitle}>Contato e comunicacao</Text>
              <Text style={styles.stepSubtitle}>
                Inclua contato de emergência e observações úteis para sua comunicação.
              </Text>

              <LabeledInput
                label="Contato de emergência (nome)"
                value={patientEmergencyContactName}
                onChangeText={setPatientEmergencyContactName}
                placeholder="Ex.: Ana Silva"
                autoCapitalize="words"
              />
              <LabeledInput
                label="Contato de emergência (telefone)"
                value={patientEmergencyContactPhone}
                onChangeText={setPatientEmergencyContactPhone}
                placeholder="+55 65 99999-0000"
                autoCapitalize="none"
              />
              <LabeledInput
                label="Observações de comunicação"
                value={patientCommunicationNotes}
                onChangeText={setPatientCommunicationNotes}
                placeholder="Ex.: Prefiro mensagens curtas no WhatsApp."
              />

              <View style={styles.rowButtons}>
                <CoriActionButton label="Voltar" onPress={() => setStep("patient_visual")} />
                <CoriActionButton label="Continuar" onPress={() => setStep("patient_review")} />
              </View>
            </View>
          ) : null}

          {step === "patient_review" ? (
            <View style={styles.stepCard}>
              <Stepper current={4} total={5} />
              <Text style={styles.stepTitle}>Revisao e envio</Text>
              <Text style={styles.stepSubtitle}>
                Revise suas informacoes antes de enviar para avaliacao do psicologo.
              </Text>

              <View style={styles.reviewCard}>
                <Text style={styles.reviewLine}>Nome: {patientFullName.trim() || "Nao informado"}</Text>
                <Text style={styles.reviewLine}>Nome preferido: {patientPreferredName.trim() || "Nao informado"}</Text>
                <Text style={styles.reviewLine}>E-mail: {patientEmail.trim() || "Nao informado"}</Text>
                <Text style={styles.reviewLine}>Telefone: {patientPhone.trim() || "Nao informado"}</Text>
                <Text style={styles.reviewLine}>Nascimento: {patientBirthDateIso ?? "Nao informado"}</Text>
                <Text style={styles.reviewLine}>Pronomes: {patientPronouns.trim() || "Nao informado"}</Text>
                <Text style={styles.reviewLine}>
                  Emergencia: {patientEmergencyContactName.trim() || "Nao informado"}
                </Text>
                <Text style={styles.reviewLine}>
                  Telefone emergencia: {patientEmergencyContactPhone.trim() || "Nao informado"}
                </Text>
              </View>

              <Pressable
                onPress={() => setPatientConsentTerms((current) => !current)}
                style={styles.consentRow}
              >
                <Ionicons
                  name={patientConsentTerms ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color={patientConsentTerms ? appColors.primary : "#98A2B3"}
                />
                <Text style={styles.consentText}>Confirmo que li e aceito os termos de uso.</Text>
              </Pressable>

              <Pressable
                onPress={() => setPatientConsentPrivacy((current) => !current)}
                style={styles.consentRow}
              >
                <Ionicons
                  name={patientConsentPrivacy ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color={patientConsentPrivacy ? appColors.primary : "#98A2B3"}
                />
                <Text style={styles.consentText}>Confirmo que li e aceito a politica de privacidade.</Text>
              </Pressable>

              <View style={styles.rowButtons}>
                <CoriActionButton label="Voltar" onPress={() => setStep("patient_contacts")} />
                <CoriActionButton
                  label={patientFlowBusy ? "Enviando..." : "Enviar triagem"}
                  onPress={() => void handlePatientSubmit()}
                  disabled={!isPatientReviewValid || patientFlowBusy}
                />
              </View>
            </View>
          ) : null}

          {step === "patient_status" ? (
            <View style={styles.stepCard}>
              <Stepper current={5} total={5} />
              <Text style={styles.stepTitle}>Status da triagem</Text>
              <Text style={styles.stepSubtitle}>
                {patientStatusMessage ?? "Acompanhando o status da sua triagem em tempo real."}
              </Text>

              <View style={styles.statusBadgeCard}>
                <Text style={styles.statusBadgeLabel}>Status atual</Text>
                <Text style={styles.statusBadgeValue}>
                  {patientIntakeStatus === "pending_submission" && "Pendente de envio"}
                  {patientIntakeStatus === "submitted" && "Em analise"}
                  {patientIntakeStatus === "complement_requested" && "Complemento solicitado"}
                  {patientIntakeStatus === "approved" && "Aprovada"}
                  {patientIntakeStatus === "rejected" && "Nao aprovada"}
                  {patientIntakeStatus === "expired" && "Expirada"}
                  {patientIntakeStatus === null && "Carregando"}
                </Text>
                {patientIntakeId ? (
                  <Text style={styles.statusMeta}>Triagem {patientIntakeId.slice(0, 8).toUpperCase()}</Text>
                ) : null}
                {patientLastSyncLabel ? (
                  <Text style={styles.statusMeta}>Atualizado às {patientLastSyncLabel}</Text>
                ) : null}
              </View>

              <View style={styles.rowButtons}>
                <CoriActionButton
                  label={canEditPatientTriage ? "Editar triagem" : "Encerrar sessao"}
                  onPress={() => {
                    if (canEditPatientTriage) {
                      setStep("patient_profile");
                      return;
                    }
                    void authStore.actions.logout();
                  }}
                />
              </View>

              {canEditPatientTriage ? (
                <Text style={styles.stepHint}>
                  Você pode editar e reenviar sua triagem enquanto ela estiver pendente.
                </Text>
              ) : null}
            </View>
          ) : null}

          {step === "identification" ? (
            <View style={styles.stepCard}>
              <Stepper current={2} total={3} />
              <Text style={styles.stepTitle}>Identificação</Text>

              <LabeledInput
                label="Como quer ser chamada?"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Ex.: Dra. Marina"
              />

              <LabeledInput
                label="Qual sua abordagem?"
                value={approachSearch}
                onChangeText={setApproachSearch}
                placeholder="Pesquisar abordagem"
              />

              <View style={styles.approachList}>
                {filteredApproaches.slice(0, 4).map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => {
                      setApproachSelected(item);
                      setApproachSearch(item);
                    }}
                    style={[
                      styles.approachItem,
                      approachSelected === item ? styles.approachItemSelected : null,
                    ]}
                  >
                    <Text style={styles.approachItemText}>{item}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Quando é o seu aniversário?</Text>
              <View style={styles.dateRow}>
                <CompactInput
                  value={birthdayDay}
                  onChangeText={(value) => setBirthdayDay(value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="DD"
                />
                <CompactInput
                  value={birthdayMonth}
                  onChangeText={(value) => setBirthdayMonth(value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="MM"
                />
                <CompactInput
                  value={birthdayYear}
                  onChangeText={(value) => setBirthdayYear(value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="AAAA"
                />
              </View>

              <View style={styles.rowButtons}>
                <CoriActionButton label="Voltar" onPress={() => setStep("hero")} />
                <CoriActionButton
                  label="Continuar"
                  onPress={() => setStep("modality")}
                  disabled={!isIdentificationValid}
                />
              </View>
            </View>
          ) : null}

          {step === "modality" ? (
            <View style={styles.stepCard}>
              <Stepper current={3} total={3} />
              <Text style={styles.stepTitle}>Modalidade de Atendimento</Text>
              <Text style={styles.stepSubtitle}>
                Sistema configurado para operar exclusivamente com Push Notifications.
              </Text>

              <View style={styles.modalityList}>
                {MODALITY_OPTIONS.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setModality(item.id)}
                    style={[
                      styles.modalityCard,
                      modality === item.id ? styles.modalityCardActive : null,
                    ]}
                  >
                    <Ionicons
                      name={item.id === "online" ? "laptop-outline" : item.id === "presential" ? "business-outline" : "shuffle-outline"}
                      size={18}
                      color={modality === item.id ? appColors.primary : "#475467"}
                    />
                    <Text style={styles.modalityText}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.rowButtons}>
                <CoriActionButton label="Voltar" onPress={() => setStep("identification")} />
                <CoriActionButton
                  label={loading ? "Finalizando..." : "Concluir onboarding"}
                  onPress={() => void handleFinishFlow()}
                  disabled={modality === null || loading}
                />
              </View>
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function CoriActionButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateScale = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      speed: 24,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[styles.actionButtonContainer, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPressIn={() => animateScale(1.02)}
        onPressOut={() => animateScale(1)}
        onPress={onPress}
        style={[styles.actionButton, disabled ? styles.actionButtonDisabled : null]}
      >
        <Text style={styles.actionButtonText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = "sentences",
  autoCorrect = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
}) {
  const focusValue = useRef(new Animated.Value(0)).current;
  const animatedBorder = focusValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["#D0D5DD", "#0F766E"],
  });

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Animated.View style={[styles.inputContainer, { borderColor: animatedBorder }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#98A2B3"
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          style={styles.input}
          onFocus={() =>
            Animated.timing(focusValue, {
              toValue: 1,
              duration: 140,
              useNativeDriver: false,
            }).start()
          }
          onBlur={() =>
            Animated.timing(focusValue, {
              toValue: 0,
              duration: 140,
              useNativeDriver: false,
            }).start()
          }
        />
      </Animated.View>
    </View>
  );
}

function CompactInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.compactInputContainer}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        keyboardType="number-pad"
        style={styles.compactInput}
      />
    </View>
  );
}

function Stepper({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.stepperRow}>
      {Array.from({ length: total }).map((_, index) => {
        const active = index + 1 <= current;
        return <View key={index} style={[styles.stepperDot, active ? styles.stepperDotActive : null]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  floatingLogoWrapper: {
    position: "absolute",
    top: 36,
    left: 0,
    right: 0,
    zIndex: 4,
    alignItems: "center",
  },
  logoCapsule: {
    minWidth: 150,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  logoText: {
    textAlign: "center",
    color: "#0F172A",
    fontSize: 24,
    letterSpacing: 6,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  topHeaderContainer: {
    position: "absolute",
    top: 24,
    left: 16,
    right: 16,
    zIndex: 3,
  },
  topHeaderCard: {
    alignSelf: "flex-end",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  topHeaderTenant: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: typographyContract.fontFamily,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  scrollHero: {
    flexGrow: 1,
    justifyContent: "center",
    paddingTop: 160,
  },
  scrollStep: {
    flexGrow: 1,
    justifyContent: "center",
    paddingTop: 118,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  heroBannerTop: {
    height: 104,
    backgroundColor: "#E9F1F8",
    padding: 14,
    justifyContent: "flex-start",
  },
  heroBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBadgeText: {
    color: "#1E3A8A",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  heroBody: {
    padding: 16,
    gap: 12,
  },
  heroTitle: {
    color: "#0F172A",
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  heroSubtitle: {
    color: "#475467",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
    fontFamily: typographyContract.fontFamily,
  },
  stepCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  stepperRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 2,
  },
  stepperDot: {
    width: 28,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#D0D5DD",
  },
  stepperDotActive: {
    width: 56,
    backgroundColor: appColors.primary,
  },
  stepTitle: {
    color: "#101828",
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  stepSubtitle: {
    color: "#475467",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    fontFamily: typographyContract.fontFamily,
  },
  stepHint: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    fontFamily: typographyContract.fontFamily,
  },
  reviewCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  reviewLine: {
    color: "#344054",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    fontFamily: typographyContract.fontFamily,
  },
  consentRow: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  consentText: {
    flex: 1,
    color: "#344054",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    fontFamily: typographyContract.fontFamily,
  },
  statusBadgeCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  statusBadgeLabel: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    fontFamily: typographyContract.fontFamily,
  },
  statusBadgeValue: {
    color: "#0F172A",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  statusMeta: {
    color: "#475467",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    fontFamily: typographyContract.fontFamily,
  },
  stageCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  stageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stageLabel: {
    color: "#101828",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  stageStatus: {
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  stageStatusPending: {
    color: "#667085",
  },
  stageStatusCompleted: {
    color: "#027A48",
  },
  stageStatusFailed: {
    color: "#B42318",
  },
  stageDetail: {
    color: "#475467",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    fontFamily: typographyContract.fontFamily,
  },
  fieldLabel: {
    color: "#344054",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
    fontWeight: "600",
    fontFamily: typographyContract.fontFamily,
  },
  inputContainer: {
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  input: {
    minHeight: 56,
    paddingHorizontal: 14,
    color: "#101828",
    fontSize: 15,
    fontWeight: "500",
    fontFamily: typographyContract.fontFamily,
  },
  compactInputContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  compactInput: {
    minHeight: 56,
    textAlign: "center",
    color: "#101828",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: typographyContract.fontFamily,
  },
  dateRow: {
    flexDirection: "row",
    gap: 8,
  },
  approachList: {
    gap: 8,
  },
  approachItem: {
    borderWidth: 1,
    borderColor: "#D0D5DD",
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  approachItemSelected: {
    borderColor: "#A4BCFD",
    backgroundColor: "#EEF4FF",
  },
  approachItemText: {
    color: "#1D2939",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    fontFamily: typographyContract.fontFamily,
  },
  modalityList: {
    gap: 8,
  },
  modalityCard: {
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  modalityCardActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF3",
  },
  modalityText: {
    color: "#1D2939",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
  },
  rowButtons: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  actionButtonContainer: {
    flex: 1,
  },
  actionButton: {
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0F766E",
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    fontFamily: typographyContract.fontFamily,
    textAlign: "center",
  },
});
