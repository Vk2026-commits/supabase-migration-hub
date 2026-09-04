export type GuardApplicationData = {
  applicantName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  companyName: string;
  position: string;
  employmentType: string;
  startDate: string;
  licenseLevels: string[];
  eligibleToWork: string;
  isAdult: string;
  driversLicense: string;
  securityLicenseNumber: string;
  securityLicenseState: string;
  education: string;
  skills: string;
  workHistory: Array<Record<string, string>>;
  references: Array<Record<string, string>>;
  signature: string;
  signatureDate: string;
};

const display = (value?: string) => value?.trim() || "Not provided";

export async function generateGuardApplicationPDF(data: GuardApplicationData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = width - margin * 2;
  let y = 18;

  const ensureSpace = (needed = 22) => {
    if (y + needed > height - 18) {
      doc.addPage();
      y = 18;
    }
  };

  const section = (title: string) => {
    ensureSpace(16);
    doc.setFillColor(30, 81, 180);
    doc.rect(margin, y, contentWidth, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(title.toUpperCase(), margin + 3, y + 5.5);
    doc.setTextColor(20, 24, 35);
    y += 12;
  };

  const field = (label: string, value?: string) => {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(80, 87, 102);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(20, 24, 35);
    const lines = doc.splitTextToSize(display(value), contentWidth);
    doc.text(lines, margin, y + 5);
    y += 7 + lines.length * 4;
  };

  const row = (leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) => {
    ensureSpace(15);
    const half = contentWidth / 2 - 4;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 87, 102);
    doc.text(leftLabel, margin, y);
    doc.text(rightLabel, margin + half + 8, y);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 24, 35);
    doc.text(display(leftValue), margin, y + 5, { maxWidth: half });
    doc.text(display(rightValue), margin + half + 8, y + 5, { maxWidth: half });
    y += 13;
  };

  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 81, 180);
  doc.setFontSize(20);
  doc.text("WE FIND GUARDS", width / 2, y, { align: "center" });
  y += 8;
  doc.setTextColor(20, 24, 35);
  doc.setFontSize(15);
  doc.text("SECURITY OFFICER EMPLOYMENT APPLICATION", width / 2, y, { align: "center" });
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 97, 110);
  doc.text("An Equal Opportunity Employment Application", width / 2, y, { align: "center" });
  y += 10;

  section("Application Details");
  row("Applying to", data.companyName, "Position", data.position);
  row("Employment type", data.employmentType, "Available start date", data.startDate);
  field("Security license level(s)", data.licenseLevels.join(", "));

  section("Applicant Information");
  field("Full legal name", data.applicantName);
  row("Email", data.email, "Phone", data.phone);
  field("Street address", data.address);
  row("City", data.city, "State / ZIP", `${data.state} ${data.zip}`.trim());

  section("Eligibility and Credentials");
  row("18 or older", data.isAdult, "Eligible to work in the U.S.", data.eligibleToWork);
  row("Valid driver's license", data.driversLicense, "Security license state", data.securityLicenseState);
  field("Security license number", data.securityLicenseNumber);

  section("Education and Qualifications");
  field("Highest education / school", data.education);
  field("Security skills, training, and equipment", data.skills);

  section("Employment History");
  data.workHistory.filter((job) => job.employer).forEach((job, index) => {
    field(`Employer ${index + 1}`, [job.employer, job.title, job.dates, job.supervisor, job.phone, job.reason].filter(Boolean).join(" | "));
  });
  if (!data.workHistory.some((job) => job.employer)) field("Employment history", "None provided");

  section("Professional References");
  data.references.filter((reference) => reference.name).forEach((reference, index) => {
    field(`Reference ${index + 1}`, [reference.name, reference.relationship, reference.phone, reference.email].filter(Boolean).join(" | "));
  });
  if (!data.references.some((reference) => reference.name)) field("References", "None provided");

  section("Applicant Certification");
  const certification = "I certify that the information in this application is true and complete. I authorize verification of the information provided and understand that false or omitted information may disqualify me or result in termination. I understand that submitting this application does not guarantee employment.";
  field("Certification", certification);
  row("Electronic signature", data.signature, "Date signed", data.signatureDate);

  doc.setFontSize(7);
  doc.setTextColor(100, 106, 118);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.text(`We Find Guards • Application ${page} of ${pages}`, width / 2, height - 8, { align: "center" });
  }

  const safeName = data.applicantName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "applicant";
  doc.save(`we-find-guards-application-${safeName}.pdf`);
}
