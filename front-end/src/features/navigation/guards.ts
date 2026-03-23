import type { AuthStatus } from "../auth/store/createAuthStore";
import type { AuthRole } from "../auth/storage/authSessionStorage";

export interface NavigationAuthSnapshot {
  hydrated: boolean;
  status: AuthStatus;
  role: AuthRole | null;
  onboardingCompleted: boolean | null;
}

const LOGIN_ROUTE = "/psicologo/login";
const SESSION_ROUTE = "/psicologo/sessao";
const ONBOARDING_ROUTE = "/psicologo/onboarding";
const SETTINGS_ROUTE = "/psicologo/configuracoes";
const TRIAGE_ROUTE = "/psicologo/triagens";
const PATIENTS_ROUTE = "/psicologo/pacientes";
const AGENDA_ROUTE = "/psicologo/agenda";
const ACTIVITIES_ROUTE = "/psicologo/atividades";
const FORMS_ROUTE = "/psicologo/formularios";
const TIMELINE_ROUTE = "/psicologo/timeline";

function resolveDefaultAuthenticatedRoute(auth: NavigationAuthSnapshot): string {
  if (auth.status !== "authenticated" || auth.role !== "psychologist") {
    return LOGIN_ROUTE;
  }

  return auth.onboardingCompleted ? SESSION_ROUTE : LOGIN_ROUTE;
}

export function resolveInitialRoute(auth: NavigationAuthSnapshot): string {
  if (!auth.hydrated) {
    return LOGIN_ROUTE;
  }

  return auth.status === "authenticated" ? resolveDefaultAuthenticatedRoute(auth) : LOGIN_ROUTE;
}

export function resolveProtectedRouteRedirect(auth: NavigationAuthSnapshot): string | null {
  if (!auth.hydrated) {
    return null;
  }

  return auth.status === "authenticated" && auth.role === "psychologist" ? null : LOGIN_ROUTE;
}

export function resolveAuthRouteRedirect(auth: NavigationAuthSnapshot): string | null {
  if (!auth.hydrated) {
    return null;
  }

  if (auth.status !== "authenticated") {
    return null;
  }

  if (auth.role !== "psychologist") {
    return null;
  }

  return auth.onboardingCompleted ? SESSION_ROUTE : null;
}

export function resolvePsychologistSessionRedirect(auth: NavigationAuthSnapshot): string | null {
  if (!auth.hydrated) {
    return null;
  }
  if (auth.status !== "authenticated") {
    return LOGIN_ROUTE;
  }
  if (auth.role !== "psychologist") {
    return LOGIN_ROUTE;
  }
  if (!auth.onboardingCompleted) {
    return LOGIN_ROUTE;
  }
  return null;
}

export function resolvePsychologistOnboardingRedirect(auth: NavigationAuthSnapshot): string | null {
  if (!auth.hydrated) {
    return null;
  }
  if (auth.status !== "authenticated") {
    return LOGIN_ROUTE;
  }
  if (auth.role !== "psychologist") {
    return LOGIN_ROUTE;
  }
  return auth.onboardingCompleted ? SESSION_ROUTE : LOGIN_ROUTE;
}

export function resolvePsychologistSettingsRedirect(auth: NavigationAuthSnapshot): string | null {
  if (!auth.hydrated) {
    return null;
  }
  if (auth.status !== "authenticated") {
    return LOGIN_ROUTE;
  }
  if (auth.role !== "psychologist") {
    return LOGIN_ROUTE;
  }
  return auth.onboardingCompleted ? null : LOGIN_ROUTE;
}

export function resolvePsychologistTriageRedirect(auth: NavigationAuthSnapshot): string | null {
  if (!auth.hydrated) {
    return null;
  }
  if (auth.status !== "authenticated") {
    return LOGIN_ROUTE;
  }
  if (auth.role !== "psychologist") {
    return LOGIN_ROUTE;
  }
  return auth.onboardingCompleted ? null : LOGIN_ROUTE;
}

export function resolvePsychologistPatientsRedirect(auth: NavigationAuthSnapshot): string | null {
  if (!auth.hydrated) {
    return null;
  }
  if (auth.status !== "authenticated") {
    return LOGIN_ROUTE;
  }
  if (auth.role !== "psychologist") {
    return LOGIN_ROUTE;
  }
  return auth.onboardingCompleted ? null : LOGIN_ROUTE;
}

export function resolvePsychologistAgendaRedirect(auth: NavigationAuthSnapshot): string | null {
  if (!auth.hydrated) {
    return null;
  }
  if (auth.status !== "authenticated") {
    return LOGIN_ROUTE;
  }
  if (auth.role !== "psychologist") {
    return LOGIN_ROUTE;
  }
  return auth.onboardingCompleted ? null : LOGIN_ROUTE;
}

export function resolvePsychologistActivitiesRedirect(auth: NavigationAuthSnapshot): string | null {
  if (!auth.hydrated) {
    return null;
  }
  if (auth.status !== "authenticated") {
    return LOGIN_ROUTE;
  }
  if (auth.role !== "psychologist") {
    return LOGIN_ROUTE;
  }
  return auth.onboardingCompleted ? null : LOGIN_ROUTE;
}

export function resolvePsychologistFormsRedirect(auth: NavigationAuthSnapshot): string | null {
  if (!auth.hydrated) {
    return null;
  }
  if (auth.status !== "authenticated") {
    return LOGIN_ROUTE;
  }
  if (auth.role !== "psychologist") {
    return LOGIN_ROUTE;
  }
  return auth.onboardingCompleted ? null : LOGIN_ROUTE;
}

export function resolvePsychologistTimelineRedirect(auth: NavigationAuthSnapshot): string | null {
  if (!auth.hydrated) {
    return null;
  }
  if (auth.status !== "authenticated") {
    return LOGIN_ROUTE;
  }
  if (auth.role !== "psychologist") {
    return LOGIN_ROUTE;
  }
  return auth.onboardingCompleted ? null : LOGIN_ROUTE;
}

export const psychologistRoutes = {
  login: LOGIN_ROUTE,
  session: SESSION_ROUTE,
  onboarding: ONBOARDING_ROUTE,
  settings: SETTINGS_ROUTE,
  triage: TRIAGE_ROUTE,
  patients: PATIENTS_ROUTE,
  agenda: AGENDA_ROUTE,
  activities: ACTIVITIES_ROUTE,
  forms: FORMS_ROUTE,
  timeline: TIMELINE_ROUTE,
} as const;
