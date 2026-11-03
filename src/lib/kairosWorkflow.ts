export const KAIROS_COMPANY_ID = "abaebf12-8db2-44f7-b60e-a8931405df88";
export const isKairos = (companyId?: string) => companyId === KAIROS_COMPANY_ID;
export const KAIROS_TEAM = [
  { title: "CEO", name: "Stephen Taylor" },
  { title: "Executive General Manager", name: "Erika Garces" },
  { title: "Project Manager", name: "Dayan Ward" },
  { title: "Site Lead (TLHC)", name: "Robin Whitehead" },
  { title: "Site Lead (Wheeler Baptist Church)", name: "Shawn Jenkins" },
];
export const KAIROS_POSITIONS = ["Unarmed Officers", "Armed Officers", "PPO Officers"];
export const PAID_HOLIDAYS = ["New Year’s Day", "Memorial Day", "Independence Day", "Labor Day", "Thanksgiving Day", "Christmas Day"];
export const KAIROS_EQUIPMENT = ["Vest", "Holster", "Duty Belt", "Radios", "Security Dash strobe light", "Phone", "Laptop"];
export const INTERVIEW_QUESTIONS = [
  { id: "experience", text: "How many years of experience do you have in security?" },
  { id: "location", text: "What part of town do you live in?" },
  { id: "duties", text: "Can you perform the essential duties of this position?" },
  { id: "transportation", text: "Do you have reliable transportation?" },
  { id: "start", text: "How soon are you available to start work?" },
  { id: "hours", text: "Are you looking for full-time or part-time work?" },
  { id: "employment", text: "Are you currently employed?" },
  { id: "gear", text: "Do you have your own duty belt and duty gear?" },
];
export type InterviewNotes = { general: string; answers: Record<string, string> };
export function readInterviewNotes(raw: string): InterviewNotes {
  try {
    const value = JSON.parse(raw);
    if (value?.format === "kairos-interview-v1" && typeof value.general === "string" && value.answers && typeof value.answers === "object") {
      return { general: value.general, answers: Object.fromEntries(Object.entries(value.answers).filter(([, text]) => typeof text === "string")) as Record<string, string> };
    }
  } catch { /* Existing free-text notes remain intact. */ }
  return { general: raw || "", answers: {} };
}
export function writeInterviewNotes(general: string, answers: Record<string, string>): string {
  if (!Object.values(answers).some((value) => value.trim())) return general.trim();
  return JSON.stringify({ format: "kairos-interview-v1", general: general.trim(), answers });
}
export function displayInterviewNotes(raw: string): string {
  const { general, answers } = readInterviewNotes(raw);
  return [general, ...INTERVIEW_QUESTIONS.filter((q) => answers[q.id]).map((q) => `${q.text}\n${answers[q.id]}`)].filter(Boolean).join("\n\n");
}
