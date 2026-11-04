export const eligibilityQuestions = [
  {
    key: "appliedBefore",
    label: "Have you ever applied here before?",
    detail: "appliedBeforeWhen",
    detailLabel: "If yes, when?",
  },
  {
    key: "employedHereBefore",
    label: "Were you ever employed here?",
    detail: "employedHereWhen",
    detailLabel: "If yes, when?",
  },
  {
    key: "convicted",
    label:
      "Have you ever been convicted of any law violation? (Include guilty or no contest. Exclude minor traffic.)",
    detail: "convictionDetails",
    detailLabel:
      "If yes, give details. A conviction will not necessarily disqualify an applicant for employment.",
  },
  {
    key: "outsideEmployment",
    label:
      "If employed, do you expect to be engaged in any additional business or employment outside of this job?",
    detail: "outsideEmploymentDetails",
    detailLabel: "If yes, give details",
  },
  {
    key: "licenseSuspended",
    label: "Have you had your driver's license suspended or revoked in the last 3 years?",
    detail: "licenseSuspendedDetails",
    detailLabel: "If yes, give details",
  },
] as const;
export const additionalQuestions = [
  {
    key: "otherNamesUsed",
    label: "Have you worked or attended school under any other names?",
    detail: "otherNames",
    detailLabel: "If yes, give names",
  },
  {
    key: "presentlyEmployed",
    label: "Are you presently employed?",
    detail: "contactSuggestion",
    detailLabel: "If yes, whom do you suggest we contact? Enter Do not contact if appropriate.",
  },
  {
    key: "everFired",
    label: "Have you ever been fired from a job or asked to resign?",
    detail: "firedDetails",
    detailLabel: "If yes, please explain",
  },
] as const;
export const applicationCertification = [
  "I certify that all information provided in this employment application is true and complete. I understand that any false information or omission may disqualify me from further consideration for employment and may result in my dismissal if discovered at a later date.",
  "I authorize the investigation of any or all statements contained in this application. I also authorize, whether listed or not, any person, school, current employer, past employers and organizations to provide relevant information and opinions that may be useful in making a hiring decision.",
  "I understand I may be required to successfully pass a drug screening examination. I hereby consent to a pre- and/or post-employment drug screen as a condition of employment, if required.",
];
export type ApplicationQuestionAnswers = Partial<
  Record<
    (typeof eligibilityQuestions | typeof additionalQuestions)[number]["key" | "detail"],
    string
  >
> & {
  applicationQuestionVersion?: number;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  driversLicenseNumber?: string;
  licenseClass?: string;
  driverLicenseState?: string;
  professionalActivities?: string;
  machinesEquipment?: string;
  hasWorkHistory?: string;
  hasReferences?: string;
  schoolHistory?: Array<{
    type: string;
    attended: string;
    name: string;
    years: string;
    degree: string;
    subjects: string;
  }>;
};
export const blankSchools = () =>
  ["High School/GED", "College/University", "Vocational/Technical"].map((type) => ({
    type,
    attended: "",
    name: "",
    years: "",
    degree: "",
    subjects: "",
  }));
export function questionsComplete(
  questions: typeof eligibilityQuestions | typeof additionalQuestions,
  data: ApplicationQuestionAnswers,
) {
  return questions.every(
    (q) =>
      ["Yes", "No"].includes(data[q.key] || "") &&
      (data[q.key] !== "Yes" || Boolean(data[q.detail]?.trim())),
  );
}
