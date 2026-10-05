// Pure helpers for restoring and resuming the officer hiring application.
// Kept free of React/Supabase imports so they can be regression-tested directly.

export type RestoreSchedule = Record<string, { start?: string; end?: string } | undefined>;
export type RestoreShared = { employmentTypes: string[]; shiftPreferences: string[]; schedule: RestoreSchedule };
export type RestoreForm = {
  position?: string;
  applicantName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  isAdult?: string;
  eligibleToWork?: string;
  driversLicense?: string;
  education?: string;
  skills?: string;
  workHistory?: { employer?: string; title?: string }[];
  references?: { name?: string; phone?: string; email?: string }[];
  signature?: string;
  signatureImage?: string;
  signatureDate?: string;
};

// Photos (7) and credentials (8) are optional and never block submission.
export const REQUIRED_APPLICATION_STEPS = [0, 1, 2, 3, 6, 9];

export function requirementsMet(step: number, form: RestoreForm, shared: RestoreShared, selectedJobId: string, acknowledged: boolean): boolean {
  switch (step) {
    case 0: return Boolean(selectedJobId && form.position);
    case 1: return Boolean(form.applicantName && form.email && (form.phone || "").replace(/\D/g, "").length === 10 && form.address && form.city && form.state && form.zip);
    case 2: return Boolean(form.isAdult && form.eligibleToWork && form.driversLicense);
    case 3: return Boolean((form.education || "").trim() || (form.skills || "").trim());
    case 4: return (form.workHistory || []).some((item) => Boolean(item.employer?.trim() || item.title?.trim()));
    case 5: return (form.references || []).some((item) => Boolean(item.name?.trim() || item.phone?.trim() || item.email?.trim()));
    case 6: return shared.employmentTypes.length > 0 && shared.shiftPreferences.length > 0 && Object.values(shared.schedule || {}).some((v) => v?.start && v?.end);
    case 7: case 8: return true;
    default: return Boolean(form.signature && form.signatureImage && form.signatureDate && acknowledged);
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
  const first = REQUIRED_APPLICATION_STEPS.find((step) => !requirementsMet(step, input.form, input.shared, input.selectedJobId, false));
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
export function shouldAutoOpenApplication(input: { requestedTab: string | null; initialTab: string; hasPendingOffer: boolean; hasSubmittedApplication: boolean; employmentConfirmed: boolean }): "employee-onboarding" | "hiring-application" | null {
  if (input.requestedTab) return null;
  if (input.hasPendingOffer) return "employee-onboarding";
  if ((input.initialTab === "overview" || input.initialTab === "profile") && !input.hasSubmittedApplication && !input.employmentConfirmed) return "hiring-application";
  return null;
}
