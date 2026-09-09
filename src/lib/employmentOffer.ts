export type EmploymentType = "full_time" | "part_time" | "temporary" | "seasonal";
export type FLSAClassification = "nonexempt" | "exempt";
export type PayFrequency = "biweekly" | "semimonthly";

export type EmploymentOfferTerms = {
  positionTitle: string;
  duties: string;
  employmentType: EmploymentType;
  classification: FLSAClassification;
  hourlyRate: string;
  overtimeTerms: string;
  payFrequency: PayFrequency;
  regularPayday: string;
  shiftDifferential: string;
  bonusCompensation: string;
  additionalCompensation: string;
  worksiteName: string;
  worksiteAddress: string;
  worksiteCity: string;
  worksiteState: string;
  worksiteZip: string;
  supervisorName: string;
  expectedSchedule: string;
  expectedWeeklyHours: string;
  hoursType: "guaranteed" | "variable";
  benefitsEligibility: "eligible" | "not_eligible";
  benefitsEffectiveDate: string;
  benefitsSummary: string;
  ptoSummary: string;
  holidaySummary: string;
  policyReferences: string;
  startDate: string;
  acceptanceDeadline: string;
  backgroundCheckRequired: boolean;
  drugTestRequired: boolean;
  licenseVerificationRequired: boolean;
  workAuthorizationRequired: boolean;
  otherContingencies: string;
  atWillAcknowledged: boolean;
  specialTerms: string;
  representativeName: string;
  representativeTitle: string;
};

export const emptyEmploymentOffer = (positionTitle = "Security Officer"): EmploymentOfferTerms => ({
  positionTitle,
  duties: "",
  employmentType: "full_time",
  classification: "nonexempt",
  hourlyRate: "",
  overtimeTerms: "Time and one-half the regular rate for hours over 40 in a workweek, as required by applicable law.",
  payFrequency: "biweekly",
  regularPayday: "",
  shiftDifferential: "None",
  bonusCompensation: "None",
  additionalCompensation: "None",
  worksiteName: "",
  worksiteAddress: "",
  worksiteCity: "",
  worksiteState: "Texas",
  worksiteZip: "",
  supervisorName: "",
  expectedSchedule: "",
  expectedWeeklyHours: "",
  hoursType: "variable",
  benefitsEligibility: "not_eligible",
  benefitsEffectiveDate: "",
  benefitsSummary: "Not eligible",
  ptoSummary: "None",
  holidaySummary: "None",
  policyReferences: "Employee handbook and applicable company policies",
  startDate: "",
  acceptanceDeadline: "",
  backgroundCheckRequired: true,
  drugTestRequired: true,
  licenseVerificationRequired: true,
  workAuthorizationRequired: true,
  otherContingencies: "None",
  atWillAcknowledged: false,
  specialTerms: "None",
  representativeName: "",
  representativeTitle: "Authorized Hiring Representative",
});

export const offerRequiredFields: Array<keyof EmploymentOfferTerms> = [
  "positionTitle", "duties", "employmentType", "classification", "hourlyRate", "overtimeTerms",
  "payFrequency", "regularPayday", "shiftDifferential", "bonusCompensation", "additionalCompensation",
  "worksiteName", "worksiteAddress", "worksiteCity", "worksiteState", "worksiteZip", "supervisorName",
  "expectedSchedule", "expectedWeeklyHours", "hoursType", "benefitsEligibility", "benefitsSummary",
  "ptoSummary", "holidaySummary", "policyReferences", "startDate", "acceptanceDeadline",
  "otherContingencies", "specialTerms", "representativeName", "representativeTitle",
];

export const employmentOfferFieldLabels: Partial<Record<keyof EmploymentOfferTerms, string>> = {
  positionTitle: "Position",
  duties: "Duties and responsibilities",
  employmentType: "Employment type",
  classification: "Overtime classification",
  hourlyRate: "Hourly rate",
  overtimeTerms: "Overtime terms",
  payFrequency: "Pay frequency",
  regularPayday: "Regular payday",
  shiftDifferential: "Shift differential",
  bonusCompensation: "Bonus",
  additionalCompensation: "Additional compensation",
  worksiteName: "Worksite name",
  worksiteAddress: "Street address",
  worksiteCity: "City",
  worksiteState: "State",
  worksiteZip: "ZIP code",
  supervisorName: "Supervisor",
  expectedSchedule: "Expected schedule",
  expectedWeeklyHours: "Expected weekly hours",
  hoursType: "Guaranteed or variable hours",
  benefitsEligibility: "Benefits eligibility",
  benefitsEffectiveDate: "Benefits effective date",
  benefitsSummary: "Benefits",
  ptoSummary: "PTO",
  holidaySummary: "Paid holidays",
  policyReferences: "Applicable policies",
  startDate: "Start date",
  acceptanceDeadline: "Acceptance deadline",
  otherContingencies: "Other contingencies",
  atWillAcknowledged: "At-will employment notice",
  specialTerms: "Special terms",
  representativeName: "Hiring representative",
  representativeTitle: "Representative title",
};

export const validateEmploymentOffer = (terms: EmploymentOfferTerms) => {
  const missing = offerRequiredFields.filter((key) => !String(terms[key] ?? "").trim());
  if (terms.benefitsEligibility === "eligible" && !terms.benefitsEffectiveDate) missing.push("benefitsEffectiveDate");
  const rate = Number(terms.hourlyRate);
  const hours = Number(terms.expectedWeeklyHours);
  return {
    missing,
    invalidRate: !Number.isFinite(rate) || rate <= 0,
    invalidHours: !Number.isFinite(hours) || hours <= 0 || hours > 168,
    missingAtWillAcknowledgment: !terms.atWillAcknowledged,
    expiredDeadline: Boolean(terms.acceptanceDeadline) && terms.acceptanceDeadline < new Date().toISOString().slice(0, 10),
    valid: missing.length === 0 && Number.isFinite(rate) && rate > 0 && Number.isFinite(hours) && hours > 0 && hours <= 168 && terms.atWillAcknowledged && terms.acceptanceDeadline >= new Date().toISOString().slice(0, 10),
  };
};

export const employmentTypeLabel = (value: EmploymentType) => ({
  full_time: "Full-time",
  part_time: "Part-time",
  temporary: "Temporary",
  seasonal: "Seasonal",
}[value]);

export const payFrequencyLabel = (value: PayFrequency) => value === "biweekly" ? "Every two weeks" : "Twice per month";
