import {
  resolveAuthRouteRedirect,
  resolveInitialRoute,
  resolveProtectedRouteRedirect,
  resolvePsychologistAgendaRedirect,
  resolvePsychologistActivitiesRedirect,
  resolvePsychologistOnboardingRedirect,
  resolvePsychologistFormsRedirect,
  resolvePsychologistPatientsRedirect,
  resolvePsychologistSessionRedirect,
  resolvePsychologistSettingsRedirect,
  resolvePsychologistTimelineRedirect,
  resolvePsychologistTriageRedirect,
} from "../src/features/navigation/guards";

describe("navigation guards", () => {
  it("redirects protected routes when user is anonymous", () => {
    const redirect = resolveProtectedRouteRedirect({
      hydrated: true,
      status: "anonymous",
      role: null,
      onboardingCompleted: null,
    });

    expect(redirect).toBe("/psicologo/login");
  });

  it("blocks protected routes for authenticated patient role", () => {
    const redirect = resolveProtectedRouteRedirect({
      hydrated: true,
      status: "authenticated",
      role: "patient",
      onboardingCompleted: false,
    });

    expect(redirect).toBe("/psicologo/login");
  });

  it("resolves root to login onboarding flow when authenticated without onboarding completion", () => {
    const route = resolveInitialRoute({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: false,
    });

    expect(route).toBe("/psicologo/login");
  });

  it("resolves root to active session when onboarding is completed", () => {
    const route = resolveInitialRoute({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: true,
    });

    expect(route).toBe("/psicologo/sessao");
  });

  it("keeps authenticated pending onboarding inside auth flow", () => {
    const redirect = resolveAuthRouteRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: false,
    });

    expect(redirect).toBeNull();
  });

  it("blocks session route while onboarding is pending", () => {
    const redirect = resolvePsychologistSessionRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: false,
    });

    expect(redirect).toBe("/psicologo/login");
  });

  it("redirects onboarding route to login flow when pending and to session when completed", () => {
    const pendingRedirect = resolvePsychologistOnboardingRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: false,
    });
    expect(pendingRedirect).toBe("/psicologo/login");

    const redirect = resolvePsychologistOnboardingRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: true,
    });

    expect(redirect).toBe("/psicologo/sessao");
  });

  it("blocks settings route until onboarding is completed", () => {
    const redirect = resolvePsychologistSettingsRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: false,
    });

    expect(redirect).toBe("/psicologo/login");
  });

  it("allows triage route only after onboarding completion", () => {
    const blocked = resolvePsychologistTriageRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: false,
    });
    expect(blocked).toBe("/psicologo/login");

    const allowed = resolvePsychologistTriageRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: true,
    });
    expect(allowed).toBeNull();
  });

  it("allows patients route only after onboarding completion", () => {
    const blocked = resolvePsychologistPatientsRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: false,
    });
    expect(blocked).toBe("/psicologo/login");

    const allowed = resolvePsychologistPatientsRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: true,
    });
    expect(allowed).toBeNull();
  });

  it("allows agenda route only after onboarding completion", () => {
    const blocked = resolvePsychologistAgendaRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: false,
    });
    expect(blocked).toBe("/psicologo/login");

    const allowed = resolvePsychologistAgendaRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: true,
    });
    expect(allowed).toBeNull();
  });

  it("allows activities route only after onboarding completion", () => {
    const blocked = resolvePsychologistActivitiesRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: false,
    });
    expect(blocked).toBe("/psicologo/login");

    const allowed = resolvePsychologistActivitiesRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: true,
    });
    expect(allowed).toBeNull();
  });

  it("allows forms route only after onboarding completion", () => {
    const blocked = resolvePsychologistFormsRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: false,
    });
    expect(blocked).toBe("/psicologo/login");

    const allowed = resolvePsychologistFormsRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: true,
    });
    expect(allowed).toBeNull();
  });

  it("allows timeline route only after onboarding completion", () => {
    const blocked = resolvePsychologistTimelineRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: false,
    });
    expect(blocked).toBe("/psicologo/login");

    const allowed = resolvePsychologistTimelineRedirect({
      hydrated: true,
      status: "authenticated",
      role: "psychologist",
      onboardingCompleted: true,
    });
    expect(allowed).toBeNull();
  });

  it("blocks timeline route for patient role", () => {
    const redirect = resolvePsychologistTimelineRedirect({
      hydrated: true,
      status: "authenticated",
      role: "patient",
      onboardingCompleted: true,
    });
    expect(redirect).toBe("/psicologo/login");
  });
});
