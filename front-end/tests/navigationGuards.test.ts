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
      onboardingCompleted: null,
    });

    expect(redirect).toBe("/psicologo/login");
  });

  it("resolves root to onboarding when authenticated without onboarding completion", () => {
    const route = resolveInitialRoute({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: false,
    });

    expect(route).toBe("/psicologo/onboarding");
  });

  it("resolves root to active session when onboarding is completed", () => {
    const route = resolveInitialRoute({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: true,
    });

    expect(route).toBe("/psicologo/sessao");
  });

  it("redirects auth routes using onboarding status", () => {
    const redirect = resolveAuthRouteRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: false,
    });

    expect(redirect).toBe("/psicologo/onboarding");
  });

  it("blocks session route while onboarding is pending", () => {
    const redirect = resolvePsychologistSessionRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: false,
    });

    expect(redirect).toBe("/psicologo/onboarding");
  });

  it("redirects onboarding to session when already completed", () => {
    const redirect = resolvePsychologistOnboardingRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: true,
    });

    expect(redirect).toBe("/psicologo/sessao");
  });

  it("blocks settings route until onboarding is completed", () => {
    const redirect = resolvePsychologistSettingsRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: false,
    });

    expect(redirect).toBe("/psicologo/onboarding");
  });

  it("allows triage route only after onboarding completion", () => {
    const blocked = resolvePsychologistTriageRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: false,
    });
    expect(blocked).toBe("/psicologo/onboarding");

    const allowed = resolvePsychologistTriageRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: true,
    });
    expect(allowed).toBeNull();
  });

  it("allows patients route only after onboarding completion", () => {
    const blocked = resolvePsychologistPatientsRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: false,
    });
    expect(blocked).toBe("/psicologo/onboarding");

    const allowed = resolvePsychologistPatientsRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: true,
    });
    expect(allowed).toBeNull();
  });

  it("allows agenda route only after onboarding completion", () => {
    const blocked = resolvePsychologistAgendaRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: false,
    });
    expect(blocked).toBe("/psicologo/onboarding");

    const allowed = resolvePsychologistAgendaRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: true,
    });
    expect(allowed).toBeNull();
  });

  it("allows activities route only after onboarding completion", () => {
    const blocked = resolvePsychologistActivitiesRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: false,
    });
    expect(blocked).toBe("/psicologo/onboarding");

    const allowed = resolvePsychologistActivitiesRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: true,
    });
    expect(allowed).toBeNull();
  });

  it("allows forms route only after onboarding completion", () => {
    const blocked = resolvePsychologistFormsRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: false,
    });
    expect(blocked).toBe("/psicologo/onboarding");

    const allowed = resolvePsychologistFormsRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: true,
    });
    expect(allowed).toBeNull();
  });

  it("allows timeline route only after onboarding completion", () => {
    const blocked = resolvePsychologistTimelineRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: false,
    });
    expect(blocked).toBe("/psicologo/onboarding");

    const allowed = resolvePsychologistTimelineRedirect({
      hydrated: true,
      status: "authenticated",
      onboardingCompleted: true,
    });
    expect(allowed).toBeNull();
  });
});
