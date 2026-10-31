const KAIROS_COMPANY_ID = "abaebf12-8db2-44f7-b60e-a8931405df88";

// Keep historical records intact; restrict only applicant-facing hiring choices.
export function isVisibleHiringCompany(companyId: string, city: string, state: string): boolean {
  const isHouston = city.trim().toLowerCase() === "houston";
  const isTexas = ["tx", "texas"].includes(state.trim().toLowerCase());
  return !isHouston || !isTexas || companyId === KAIROS_COMPANY_ID;
}
