import {
  questionsComplete,
  eligibilityQuestions,
  additionalQuestions,
  type ApplicationQuestionAnswers,
} from "./applicationQuestions";
// Pure helpers for restoring and resuming the officer hiring application.
// Kept free of React/Supabase imports so they can be regression-tested directly.

export type RestoreSchedule = Record<string, { start?: string; end?: string } | undefined>;
export type RestoreShared = {
  employmentTypes: string[];
  shiftPreferences: string[];
  schedule: RestoreSchedule;
};
export type RestoreForm = ApplicationQuestionAnswers & {
  startDate?: string;
  position?: string;
  applicantName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  licenseLevels?: string[];
  isAdult?: string;
  eligibleToWork?: string;
  driversLicense?: string;
  education?: string;
  skills?: string;
  workHistory?: Record<string, string>[];
  references?: Record<string, string>[];
  signature?: string;
  signatureImage?: string;
  signatureDate?: string;
};

// Photos (7) and credentials (8) are optional and never block submission.
export const REQUIRED_APPLICATION_STEPS = [0, 1, 2, 3, 4, 5, 6, 9];

export function requirementsMet(
  step: number,
  form: RestoreForm,
  shared: RestoreShared,
  selectedJobId: string,
  acknowledged: boolean,
): boolean {
  switch (step) {
    case 0:
      return Boolean(selectedJobId && form.position?.trim() && form.startDate);
    case 1:
      return Boolean(
        form.firstName?.trim() &&
        form.lastName?.trim() &&
        form.applicantName &&
        form.email &&
        (form.phone || "").replace(/\D/g, "").length === 10 &&
        form.address &&
        form.city &&
        form.state &&
        form.zip,
      );
    case 2:
      return (
        questionsComplete(eligibilityQuestions, form) &&
        (form.driversLicense !== "Yes" ||
          [form.driversLicenseNumber, form.licenseClass, form.driverLicenseState].every((v) =>
            v?.trim(),
          )) &&
        [form.isAdult, form.eligibleToWork, form.driversLicense].every(
          (value) => value === "Yes" || value === "No",
        ) &&
        Array.isArray(form.licenseLevels) &&
        form.licenseLevels.length > 0 &&
        form.licenseLevels.every((value) =>
          ["Level II", "Level III", "Level IV", "No license"].includes(value),
        ) &&
        (!form.licenseLevels.includes("No license") || form.licenseLevels.length === 1)
      );
    case 3:
      return (
        Boolean(
          form.skills?.trim() &&
          form.professionalActivities?.trim() &&
          form.machinesEquipment?.trim(),
        ) &&
        form.schoolHistory?.length === 3 &&
        form.schoolHistory.every(
          (row) =>
            ["Yes", "No"].includes(row.attended) &&
            (row.attended !== "Yes" ||
              [row.name, row.years, row.degree, row.subjects].every((value) => value?.trim())),
        )
      );
    case 4:
      return (
        questionsComplete(additionalQuestions, form) &&
        (form.hasWorkHistory === "No" ||
          (form.hasWorkHistory === "Yes" &&
            (form.workHistory || []).some((item) => item.employer?.trim()) &&
            (form.workHistory || [])
              .filter((item) =>
                Object.entries(item).some(([key, value]) => key !== "id" && value?.trim()),
              )
              .every((item) =>
                [
                  "employer",
                  "title",
                  "startDate",
                  "supervisor",
                  "phone",
                  "address",
                  "cityStateZip",
                  "payStart",
                  "payFinal",
                  "reason",
                ].every((key) => item[key]?.trim()),
              )))
      );
    case 5:
      return (
        form.hasReferences === "No" ||
        (form.hasReferences === "Yes" &&
          (form.references || []).some((item) => item.name?.trim()) &&
          (form.references || [])
            .filter((item) => Object.values(item).some((value) => value?.trim()))
            .every((item) => ["name", "address", "phone"].every((key) => item[key]?.trim())))
      );
    case 6:
      return (
        shared.employmentTypes.length > 0 &&
        shared.shiftPreferences.length > 0 &&
        Object.values(shared.schedule || {}).some((v) => v?.start && v?.end)
      );
    case 7:
    case 8:
      return true;
    default:
      return Boolean(form.signature && form.signatureImage && form.signatureDate && acknowledged);
  }
}

/**
 * Step to open after a restore.
 * - An explicit deep link (?applicationStep=) always wins, so deliberate
 *   backward navigation survives a refresh.
 * - Submitted applications keep their saved step (the submitted view handles them).
 * - Otherwise resume at the first unfinished required step. Consent is never
 *   persisted, so a fully filled draft resumes at the review/signature step.
 */
export function resolveRestoreStep(input: {
  urlStep: number | null;
  savedStep: number;
  hasDraft: boolean;
  submitted: boolean;
  form: RestoreForm;
  shared: RestoreShared;
  selectedJobId: string;
}): number {
  if (input.urlStep !== null) return input.urlStep;
  const saved = Math.max(0, Math.min(9, Number(input.savedStep) || 0));
  if (!input.hasDraft || input.submitted) return saved;
  const first = REQUIRED_APPLICATION_STEPS.find(
    (step) => !requirementsMet(step, input.form, input.shared, input.selectedJobId, false),
  );
  return first ?? saved;
}

/** Unique per attempt so a slow, timed-out upload can never overwrite a newer one. */
export function resumeObjectPath(userId: string, extension: string, nonce: string) {
  return `${userId}/resume-${Date.now()}-${nonce}.${extension}`;
}

/**
 * Upload a resume with generation protection. Storage uploads cannot be
 * cancelled, so a stale attempt (superseded or timed out) is ignored: it never
 * updates the profile reference and never deletes anything. The previous file
 * is removed only after the new reference is persisted.
 */
export async function runResumeUpload(deps: {
  isCurrent: () => boolean;
  upload: () => Promise<{ error: unknown }>;
  persistReference: () => Promise<{ error: unknown }>;
  removePrevious: () => Promise<unknown>;
  hasPrevious: boolean;
  deadline: <T>(p: Promise<T>) => Promise<T>;
}): Promise<"saved" | "stale"> {
  const { error: uploadError } = await deps.deadline(deps.upload());
  if (uploadError) throw uploadError;
  if (!deps.isCurrent()) return "stale";
  const { error: persistError } = await deps.deadline(deps.persistReference());
  if (persistError) throw persistError;
  if (!deps.isCurrent()) return "stale";
  if (deps.hasPrevious) void deps.removePrevious().catch(() => undefined);
  return "saved";
}

/** Generation guard for async restores: only the latest request may apply state. */
export function createGeneration() {
  let current = 0;
  return { next: () => ++current, isCurrent: (id: number) => id === current };
}

/** Decide whether the dashboard should auto-open the hiring application. */
export function shouldAutoOpenApplication(input: {
  requestedTab: string | null;
  initialTab: string;
  hasPendingOffer: boolean;
  hasSubmittedApplication: boolean;
  employmentConfirmed: boolean;
}): "employee-onboarding" | "hiring-application" | null {
  if (input.requestedTab) return null;
  if (input.hasPendingOffer) return "employee-onboarding";
  if (
    (input.initialTab === "overview" || input.initialTab === "profile") &&
    !input.hasSubmittedApplication &&
    !input.employmentConfirmed
  )
    return "hiring-application";
  return null;
}
