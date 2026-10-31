export const KAIROS_ADDRESS = "525 North Sam Houston Parkway East, Suite #670, Houston, TX 77060";
export function interviewAddress(company: string | undefined, address: string | null | undefined) {
  const isKairos = /kairos security/i.test(company || "") || company === "abaebf12-8db2-44f7-b60e-a8931405df88";
  const isHeadquarters = /^(?:525\s+)?north sam houston parkway east\b/i.test((address || "").trim());
  return isKairos && isHeadquarters ? KAIROS_ADDRESS : address || "";
}
