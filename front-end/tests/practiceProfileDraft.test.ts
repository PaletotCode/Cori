import {
  createInitialPracticeProfileDraft,
  getFirstInvalidStepIndex,
  toPracticeProfileUpsertPayload,
  validateDraftForStep,
  validateFullDraft,
} from "../src/features/practice-profile/domain/onboardingDraft";

describe("practice profile draft validation", () => {
  it("blocks identity step when required fields are empty", () => {
    const draft = createInitialPracticeProfileDraft();
    const validation = validateDraftForStep(draft, "identity");

    expect(validation.isValid).toBe(false);
    expect(validation.fieldErrors.practiceName).toBeDefined();
    expect(validation.fieldErrors.clinicalApproach).toBeDefined();
  });

  it("requires in-person address for hybrid modality", () => {
    const draft = createInitialPracticeProfileDraft();
    draft.practiceName = "Clinica Aurora";
    draft.clinicalApproach = "TCC";
    draft.serviceModality = "hybrid";
    draft.inPersonAddress = "";

    const validation = validateDraftForStep(draft, "modality");

    expect(validation.isValid).toBe(false);
    expect(validation.fieldErrors.inPersonAddress).toBeDefined();
  });

  it("rejects duplicated reminder hours", () => {
    const draft = createInitialPracticeProfileDraft();
    draft.practiceName = "Clinica Aurora";
    draft.clinicalApproach = "TCC";
    draft.sessionReminderHoursBefore = "24,24,2";

    const validation = validateDraftForStep(draft, "notifications");

    expect(validation.isValid).toBe(false);
    expect(validation.fieldErrors.sessionReminderHoursBefore).toBeDefined();
  });

  it("requires custom triage message with minimum length", () => {
    const draft = createInitialPracticeProfileDraft();
    draft.practiceName = "Clinica Aurora";
    draft.clinicalApproach = "TCC";
    draft.defaultTriageMode = "custom";
    draft.defaultTriageMessage = "curta";

    const validation = validateDraftForStep(draft, "triage");

    expect(validation.isValid).toBe(false);
    expect(validation.fieldErrors.defaultTriageMessage).toBeDefined();
  });

  it("maps valid draft into upsert payload sorted by reminder hours", () => {
    const draft = createInitialPracticeProfileDraft();
    draft.practiceName = "Clinica Aurora";
    draft.clinicalApproach = "TCC";
    draft.serviceModality = "online";
    draft.sessionReminderHoursBefore = "2,48,24";

    const validation = validateFullDraft(draft);
    expect(validation.isValid).toBe(true);
    expect(getFirstInvalidStepIndex(draft)).toBeNull();

    const payload = toPracticeProfileUpsertPayload(draft);
    expect(payload).not.toBeNull();
    expect(payload?.session_reminder_hours_before).toEqual([48, 24, 2]);
    expect(payload?.service_modality).toBe("online");
    expect(payload?.in_person_address).toBeNull();
  });
});
