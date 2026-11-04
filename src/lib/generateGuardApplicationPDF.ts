export type GuardApplicationData = {
  isTestApplication?: boolean;
  testRunId?: string;
  applicantName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  companyName: string;
  companyCity: string;
  companyState: string;
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
  resumePath?: string;
  workHistory: Array<Record<string, string>>;
  references: Array<Record<string, string>>;
  availability?: {
    employmentTypes: string[];
    shiftPreferences: string[];
    schedule: Record<string, { start?: string; end?: string }>;
  };
  photosComplete?: boolean;
  certificationComplete?: boolean;
  photoRequirementsComplete?: boolean;
  certificationRequirementsComplete?: boolean;
  canonicalPhotoTypes?: string[];
  canonicalCertificationIds?: string[];
  attachmentManifest?: ApplicationAttachmentManifestItem[];
  signature: string;
  signatureImage: string;
  signatureDate: string;
};

export type ApplicationAttachmentManifestItem = {
  id?: string;
  kind: "photo" | "certification";
  role: string;
  label: string;
  filename: string;
  mimeType?: string;
  byteSize?: number;
  sha256: string;
  archivedAt: string;
  archiveKind: "submission" | "legacy";
};

const display = (value?: string) => value?.trim() || "Not provided";
const formatDate = (value?: string) => {
  if (!value) return "Not provided";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
const formatTime = (value?: string) => {
  if (!value) return "Not provided";
  const [hourText, minute = "00"] = value.split(":");
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return value;
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
};

export async function generateGuardApplicationPDF(data: GuardApplicationData, mode: "download" | "print" | "blob" = "download"): Promise<void | Blob> {
  const printWindow = mode === "print" ? window.open("", "_blank") : null;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ format: "letter" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = width - margin * 2;
  const photosProvided = data.photosComplete ?? data.photoRequirementsComplete ?? Boolean(data.canonicalPhotoTypes?.includes("headshot") && data.canonicalPhotoTypes?.includes("full-body"));
  const certificationProvided = data.certificationComplete ?? data.certificationRequirementsComplete ?? Boolean(data.canonicalCertificationIds?.length);
  let y = 18;

  const ensureSpace = (needed = 22) => {
    if (y + needed > height - 18) {
      doc.addPage();
      y = 18;
    }
  };

  const section = (title: string) => {
    ensureSpace(16);
    doc.setFillColor(235, 237, 240);
    doc.rect(margin, y, contentWidth, 8, "F");
    doc.setTextColor(20, 24, 35);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(title.toUpperCase(), margin + 3, y + 5.5);
    doc.setTextColor(20, 24, 35);
    y += 11;
  };

  const field = (label: string, value?: string) => {
    const questionLines = doc.splitTextToSize(label, contentWidth);
    const answerLines = doc.splitTextToSize(display(value), contentWidth - 6);
    const answerHeight = Math.max(7, answerLines.length * 4 + 3);
    ensureSpace(questionLines.length * 3.5 + answerHeight + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(80, 87, 102);
    doc.text(questionLines, margin, y);
    y += questionLines.length * 3.5 + 2;
    doc.setFillColor(247, 249, 252);
    doc.setDrawColor(220, 225, 234);
    doc.line(margin, y + answerHeight, margin + contentWidth, y + answerHeight);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(20, 24, 35);
    doc.text(answerLines, margin + 3, y + 5.5);
    y += answerHeight + 4;
  };

  const row = (leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) => {
    const half = contentWidth / 2 - 4;
    const leftQuestion = doc.splitTextToSize(leftLabel, half);
    const rightQuestion = doc.splitTextToSize(rightLabel, half);
    const leftAnswer = doc.splitTextToSize(display(leftValue), half - 6);
    const rightAnswer = doc.splitTextToSize(display(rightValue), half - 6);
    const questionHeight = Math.max(leftQuestion.length, rightQuestion.length) * 3.5;
    const answerHeight = Math.max(7, Math.max(leftAnswer.length, rightAnswer.length) * 4 + 3);
    ensureSpace(questionHeight + answerHeight + 5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 87, 102);
    doc.text(leftQuestion, margin, y);
    doc.text(rightQuestion, margin + half + 8, y);
    y += questionHeight + 2;
    doc.setFillColor(247, 249, 252);
    doc.setDrawColor(220, 225, 234);
    doc.line(margin, y + answerHeight, margin + half, y + answerHeight);
    doc.line(margin + half + 8, y + answerHeight, margin + contentWidth, y + answerHeight);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 24, 35);
    doc.text(leftAnswer, margin + 3, y + 5.5);
    doc.text(rightAnswer, margin + half + 11, y + 5.5);
    y += answerHeight + 4;
  };

  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 81, 180);
  doc.setFontSize(20);
  const companyHeading = doc.splitTextToSize(data.companyName?.trim() || "WE FIND GUARDS", width - margin * 2);
  doc.text(companyHeading, width / 2, y, { align: "center" });
  y += companyHeading.length * 8;
  doc.setTextColor(20, 24, 35);
  doc.setFontSize(15);
  doc.text("APPLICATION FOR EMPLOYMENT", width / 2, y, { align: "center" });
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 97, 110);
  doc.text("An Equal Opportunity Employment Application", width / 2, y, { align: "center" });
  y += 10;

  const choice = (label: string, checked: boolean, x: number) => {
    doc.setDrawColor(50); doc.setLineWidth(0.25);
    doc.rect(x, y - 3, 3, 3);
    if (checked) { doc.line(x + .5, y - 2.5, x + 2.5, y - .5); doc.line(x + .5, y - .5, x + 2.5, y - 2.5); }
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(20, 24, 35);
    doc.text(label, x + 5, y);
  };
  const yesNo = (label: string, answer: string) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    const lines = doc.splitTextToSize(label, contentWidth - 55);
    ensureSpace(lines.length * 4 + 6);
    doc.text(lines, margin, y);
    choice("Yes", answer === "Yes", width - margin - 48);
    choice("No", answer === "No", width - margin - 27);
    y += lines.length * 4 + 5;
    if (!["Yes", "No"].includes(answer)) { doc.setFontSize(8); doc.text("Not answered", margin, y); y += 5; }
  };
  section("Security license status");
  ["Level II", "Level III", "Level IV", "No license"].forEach((level, i) => choice(["Level 2 (II)", "Level 3 (III)", "Level 4 (IV)", "No license"][i], (data.licenseLevels || []).includes(level), margin + i * contentWidth / 4));
  y += 8;
  if (!data.licenseLevels?.length) { doc.setFontSize(8); doc.text("Not answered in this application", margin, y); y += 7; }
  section("Application Details");
  row("Which company are you applying to?", data.companyName, "What position are you applying for?", data.position);
  row("In which city is the job located?", data.companyCity, "In which state is the job located?", data.companyState);
  row("What type of employment are you seeking?", data.employmentType, "When are you available to start?", formatDate(data.startDate));


  section("Applicant Information");
  field("What is your full legal name?", data.applicantName);
  row("What is your email address?", data.email, "What is your phone number?", data.phone);
  field("What is your current street address?", data.address);
  row("What city do you live in?", data.city, "What are your state and ZIP code?", `${data.state} ${data.zip}`.trim());

  ensureSpace(78);
  section("Eligibility and Credentials");
  yesNo("Are you 18 years of age or older?", data.isAdult);
  yesNo("Can you provide proof that you may work in the United States?", data.eligibleToWork);
  yesNo("Do you have a valid driver's license?", data.driversLicense);
  field("Which state issued your security license?", data.licenseLevels?.includes("No license") ? "Not applicable - no license" : data.securityLicenseState);
  field("What is your security license number?", data.licenseLevels?.includes("No license") ? "Not applicable - no license" : data.securityLicenseNumber);

  section("Education and Qualifications");
  field("What is your highest level of education, school, diploma, or degree?", data.education);
  field("Describe your security training, skills, certifications, and equipment experience.", data.skills);

  data.workHistory.filter((job) => job.employer).forEach((job, index) => {
    ensureSpace(94);
    section(`Employment History - Employer ${index + 1}`);
    row("What was the employer's name?", job.employer, "What was your job title?", job.title);
    row("When did you start this job?", formatDate(job.startDate), "When did you leave this job?", formatDate(job.endDate));
    row("Who was your supervisor?", job.supervisor, "What was the supervisor's phone number?", job.phone);
    field("Why did you leave this position?", job.reason);
  });
  if (!data.workHistory.some((job) => job.employer)) {
    section("Employment History");
    field("Did you provide previous employment history?", "No - this optional section was not completed");
  }

  data.references.filter((reference) => reference.name).forEach((reference, index) => {
    ensureSpace(58);
    section(`Professional Reference ${index + 1}`);
    row("What is the reference's name?", reference.name, "What is your relationship to this person?", reference.relationship);
    row("What is the reference's phone number?", reference.phone, "What is the reference's email address?", reference.email);
  });
  if (!data.references.some((reference) => reference.name)) {
    section("Professional References");
    field("Did you provide professional references?", "No - this optional section was not completed");
  }

  const availableDays = Object.entries(data.availability?.schedule || {}).filter(([, hours]) => hours.start && hours.end);
  ensureSpace(55 + Math.ceil(availableDays.length / 2) * 18);
  section("Work Availability");
  field("Which employment types are you available for?", data.availability?.employmentTypes.join(", "));
  field("Which shifts do you prefer?", data.availability?.shiftPreferences.join(", "));
  for (let index = 0; index < availableDays.length; index += 2) {
    const [leftDay, leftHours] = availableDays[index];
    const right = availableDays[index + 1];
    row(
      `What hours are you available on ${leftDay}?`,
      `${formatTime(leftHours.start)} to ${formatTime(leftHours.end)}`,
      right ? `What hours are you available on ${right[0]}?` : "Additional availability",
      right ? `${formatTime(right[1].start)} to ${formatTime(right[1].end)}` : "Not provided",
    );
  }

  ensureSpace(34);
  section("Photos and Certifications");
  field(
    "Where are the applicant's photos and certification documents?",
    photosProvided && certificationProvided
      ? "The applicant provided optional photos and certification documents. They are stored separately from this PDF and are available to authorized company users from the applicant record."
      : "Photos and certification documents are optional and are managed separately from this PDF. Check the applicant record in We Find Guards to see which files the applicant chose to provide.",
  );

  ensureSpace(86);
  section("Applicant Certification");
  const certification = "I certify that the information in this application is true and complete. I authorize verification of the information provided and understand that false or omitted information may disqualify me or result in termination. I understand that submitting this application does not guarantee employment.";
  field("Please read the applicant certification statement.", certification);
  ensureSpace(34);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(80, 87, 102);
  doc.text("Applicant signature", margin, y);
  if (data.signatureImage) {
    try {
      const properties = doc.getImageProperties(data.signatureImage);
      const maxWidth = 72;
      const maxHeight = 22;
      const scale = Math.min(maxWidth / properties.width, maxHeight / properties.height);
      const imageWidth = properties.width * scale;
      const imageHeight = properties.height * scale;
      doc.addImage(data.signatureImage, "PNG", margin, y + 2, imageWidth, imageHeight, undefined, "FAST");
    } catch (error) {
      console.warn("The drawn signature could not be added to the application PDF", error);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      doc.setTextColor(20, 24, 35);
      doc.text(display(data.signature), margin, y + 10);
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(20, 24, 35);
    doc.text(display(data.signature), margin, y + 10);
  }
  y += 28;
  row("Printed legal name", data.signature, "Date signed", formatDate(data.signatureDate));

  doc.setFontSize(7);
  doc.setTextColor(100, 106, 118);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    if (data.isTestApplication) doc.text("SAMPLE - TEST ACCOUNT - NOT FOR EMPLOYMENT USE", width / 2, height - 13, { align: "center" });
    doc.text(`We Find Guards • Application ${page} of ${pages}`, width / 2, height - 8, { align: "center" });
  }

  const safeName = data.applicantName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "applicant";
  if (mode === "blob") {
    return doc.output("blob");
  } else if (mode === "print") {
    doc.autoPrint();
    const url = doc.output("bloburl");
    if (printWindow) printWindow.location.href = url.toString();
    else window.open(url.toString(), "_blank");
  } else {
    doc.save(`we-find-guards-application-${safeName}.pdf`);
  }
}
