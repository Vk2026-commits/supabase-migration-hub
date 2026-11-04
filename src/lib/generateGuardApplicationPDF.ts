import {
  eligibilityQuestions,
  additionalQuestions,
  applicationCertification,
  type ApplicationQuestionAnswers,
} from "./applicationQuestions";
export type GuardApplicationData = ApplicationQuestionAnswers & {
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
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
const formatTime = (value?: string) => {
  if (!value) return "Not provided";
  const [hourText, minute = "00"] = value.split(":");
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return value;
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
};

export async function generateGuardApplicationPDF(
  data: GuardApplicationData,
  mode: "download" | "print" | "blob" = "download",
): Promise<void | Blob> {
  const printWindow = mode === "print" ? window.open("", "_blank") : null;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 15;
  const cw = width - margin * 2;
  let y = 15;
  const font = (size = 8, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(0);
  };
  const space = (needed: number) => {
    if (y + needed > height - 18) {
      doc.addPage();
      y = 15;
    }
  };
  const paragraph = (text: string, size = 7) => {
    font(size);
    const lines = doc.splitTextToSize(text, cw);
    space(lines.length * 3 + 2);
    doc.text(lines, margin, y);
    y += lines.length * 3 + 2;
  };
  // Compact underlined fields, matching the supplied Kairos paper application.
  const fields = (items: [string, string | undefined, number][], boxed = false) => {
    const cells = items.map(([label, value, fraction]) => {
      font(7);
      const labels = doc.splitTextToSize(label, cw * fraction - 4);
      font(9, true);
      const lines = doc.splitTextToSize(display(value), cw * fraction - 4);
      return { fraction, labels, lines };
    });
    const labelHeight = Math.max(...cells.map((c) => c.labels.length)) * 3;
    const h = labelHeight + Math.max(...cells.map((c) => c.lines.length)) * 3.5 + 1;
    space(h + 3);
    let x = margin;
    for (const cell of cells) {
      const w = cw * cell.fraction;
      doc.setDrawColor(boxed ? 70 : 160);
      doc.setLineWidth(0.2);
      if (boxed) doc.rect(x, y - 3, w, h + 1);
      else doc.line(x, y + h - 2, x + w - 3, y + h - 2);
      font(7);
      doc.text(cell.labels, x + (boxed ? 1.5 : 0), y);
      font(9, true);
      doc.text(cell.lines, x + (boxed ? 1.5 : 0), y + labelHeight + 0.8);
      x += w;
    }
    y += h + 1;
  };
  const choice = (label: string, selected: boolean, x: number) => {
    font(8);
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.rect(x, y - 2.4, 2.4, 2.4);
    if (selected) {
      doc.line(x + 0.4, y - 2, x + 2, y - 0.4);
      doc.line(x + 0.4, y - 0.4, x + 2, y - 2);
    }
    doc.text(label, x + 3.8, y);
  };
  const question = (label: string, value: string) => {
    font(8);
    const lines = doc.splitTextToSize(label, cw - 43);
    space(lines.length * 3 + 2);
    doc.text(lines, margin, y);
    choice("Yes", value === "Yes", width - margin - 30);
    choice("No", value === "No", width - margin - 15);
    y += lines.length * 3 + 2;
    if (!["Yes", "No"].includes(value)) paragraph("Not answered in the saved application.");
  };
  const heading = (text: string) => {
    space(15);
    y += 3;
    font(9);
    doc.text(text, margin, y);
    y += 6;
  };
  const table = (headers: string[], rows: string[][], fractions: number[]) => {
    const draw = (row: string[], header: boolean) => {
      font(7, !header);
      const lines = row.map((v, i) => doc.splitTextToSize(v, cw * fractions[i] - 4));
      const h = Math.max(8, Math.max(...lines.map((v) => v.length)) * 3.3 + 4);
      space(h);
      let x = margin;
      lines.forEach((cell, i) => {
        doc.setDrawColor(180);
        doc.setLineWidth(0.2);
        if (header) {
          doc.setFillColor(230, 230, 230);
          doc.rect(x, y, cw * fractions[i], h, "F");
        } else doc.rect(x, y, cw * fractions[i], h);
        font(7, !header);
        doc.text(cell, x + 2, y + 4);
        x += cw * fractions[i];
      });
      y += h;
    };
    draw(headers, true);
    rows.forEach((row) => draw(row, false));
    y += 4;
  };

  font(16);
  doc.text("APPLICATION FOR EMPLOYMENT", width / 2, y, { align: "center" });
  y += 8;
  ["Level II", "Level III", "Level IV", "No license"].forEach((level, i) =>
    choice(
      ["Level 2", "Level 3", "Level 4", "No license"][i],
      (data.licenseLevels || []).includes(level),
      margin + i * 32,
    ),
  );
  y += 6;
  if (!data.licenseLevels?.length)
    paragraph("License status: Not answered in the saved application.");
  fields([["Email", data.email, 1]]);
  font(10);
  doc.text("An Equal Opportunity Employer", width / 2, y, { align: "center" });
  y += 6;
  paragraph(
    "We do not discriminate on the basis of race, color, religion, national origin, sex, age, disability, or any other status protected by law or regulation. It is our intention that all qualified applicants be given equal opportunity and that selection decisions be based on job-related factors.",
  );
  paragraph(
    "Answer each question fully and accurately. Required questions must be answered before submitting. Select Yes or No for each eligibility question and select your license level(s) or No license.",
  );
  fields([
    ["Job Applied for", data.position, 0.5],
    ["Application / signature date", formatDate(data.signatureDate), 0.5],
  ]);
  fields([
    ["Company", data.companyName, 0.5],
    ["Job location", [data.companyCity, data.companyState].filter(Boolean).join(", "), 0.5],
  ]);
  font(8);
  space(12);
  doc.text("Are you seeking:", margin, y);
  const employment = (data.employmentType || data.availability?.employmentTypes?.join(",") || "")
    .toLowerCase()
    .replace(/_/g, "-");
  choice("Full-time", employment.includes("full"), margin + 25);
  choice("Part-time", employment.includes("part"), margin + 49);
  choice("Temporary", employment.includes("temp") || employment.includes("season"), margin + 73);
  y += 5;
  fields([["When could you start work?", formatDate(data.startDate), 1]]);
  if (data.firstName || data.lastName)
    fields([
      ["Last Name", data.lastName, 0.25],
      ["First Name", data.firstName, 0.25],
      ["Middle Name", data.middleName || "None", 0.25],
      ["Telephone Number", data.phone, 0.25],
    ]);
  else
    fields([
      ["Full Legal Name", data.applicantName, 0.75],
      ["Telephone Number", data.phone, 0.25],
    ]);
  fields([
    ["Present Street Address", data.address, 0.4],
    ["City", data.city, 0.25],
    ["State", data.state, 0.15],
    ["Zip Code", data.zip, 0.2],
  ]);
  question("Are you 18 years of age or older?", data.isAdult);
  paragraph("(If you are hired, you may be required to submit proof of age.)");
  question(
    "If hired, can you furnish proof you are eligible to work in the U.S.?",
    data.eligibleToWork,
  );
  question("Do you have a valid driver's license?", data.driversLicense);
  if (data.driversLicense === "Yes")
    fields([
      ["Driver's License Number", data.driversLicenseNumber, 0.4],
      ["Class of License", data.licenseClass, 0.25],
      ["State Licensed In", data.driverLicenseState, 0.35],
    ]);
  for (const q of eligibilityQuestions) {
    question(q.label, data[q.key] || "");
    if (data[q.key] === "Yes") fields([[q.detailLabel, data[q.detail], 1]]);
  }
  fields([
    [
      "Professional, trade, business or civic activities and offices held",
      data.professionalActivities,
      1,
    ],
  ]);
  const unlicensed = data.licenseLevels?.includes("No license");
  fields([
    [
      "Security License Number",
      unlicensed ? "Not applicable - no license" : data.securityLicenseNumber,
      0.65,
    ],
    ["State Licensed In", unlicensed ? "Not applicable" : data.securityLicenseState, 0.35],
  ]);
  heading("EDUCATION - SCHOOLS, DIPLOMAS AND DEGREES");
  if (data.schoolHistory?.length)
    table(
      ["School", "Name & Address", "Years", "Diploma/Degree", "Subjects"],
      data.schoolHistory.map((row) =>
        row.attended === "No"
          ? [row.type, "Did not attend", "N/A", "N/A", "N/A"]
          : [
              row.type,
              display(row.name),
              display(row.years),
              display(row.degree),
              display(row.subjects),
            ],
      ),
      [0.25, 0.3, 0.15, 0.15, 0.15],
    );
  else table(["Education information provided by applicant"], [[display(data.education)]], [1]);
  if (data.schoolHistory?.length && data.education)
    fields([["Additional education notes", data.education, 1]]);
  fields([
    ["Skills or additional training and equipment experience related to the job", data.skills, 1],
  ]);

  fields([["Machines or equipment you can operate", data.machinesEquipment, 1]]);

  doc.addPage();
  y = 15;
  font(14);
  doc.text("Employment History", width / 2, y, { align: "center" });
  y += 6;
  paragraph(
    "Present or last employer listed first. Employment history and references below reflect the information supplied by the applicant.",
  );
  const jobs = (data.hasWorkHistory === "No" ? [] : data.workHistory || []).filter(
    (job) => job.employer,
  );
  if (!jobs.length) paragraph("No employment history provided.");
  jobs.forEach((job) => {
    space(65);
    fields(
      [
        ["NAME OF EMPLOYER", job.employer, 0.45],
        ["JOB TITLE AND DUTIES", job.title, 0.55],
      ],
      true,
    );
    fields(
      [
        ["ADDRESS", job.address, 0.45],
        [
          "DATES OF EMPLOYMENT",
          `${formatDate(job.startDate)} to ${job.endDate ? formatDate(job.endDate) : "Not provided"}`,
          0.55,
        ],
      ],
      true,
    );
    fields(
      [
        ["CITY, STATE, ZIP CODE", job.cityStateZip, 0.45],
        ["PAY", `START: ${display(job.payStart)}   FINAL: ${display(job.payFinal)}`, 0.55],
      ],
      true,
    );
    fields([
      ["SUPERVISOR(S)", job.supervisor, 0.27],
      ["TELEPHONE", job.phone, 0.18],
      ["REASON FOR LEAVING", job.reason, 0.55],
    ], true);
    y += 5;
  });
  heading("ADDITIONAL INFORMATION");
  for (const q of additionalQuestions) {
    question(q.label, data[q.key] || "");
    if (data[q.key] === "Yes") fields([[q.detailLabel, data[q.detail], 1]]);
  }
  heading("PERSONAL / PROFESSIONAL REFERENCES");
  const refs = (data.hasReferences === "No" ? [] : data.references || []).filter((ref) => ref.name);
  table(
    ["Name", "Address", "Phone"],
    refs.length
      ? refs.map((ref) => [display(ref.name), display(ref.address), display(ref.phone)])
      : [["Not provided", "Not provided", "Not provided"]],
    [0.35, 0.4, 0.25],
  );
  refs.forEach((ref) => {
    if (ref.relationship || ref.email)
      fields([
        [
          `Additional contact - ${ref.name}`,
          [ref.relationship, ref.email].filter(Boolean).join(" / "),
          1,
        ],
      ]);
  });
  heading("WORK AVAILABILITY");
  const readable = (values?: string[]) => values?.map((v) => v.replace(/[_-]/g, " ")).join(", ");
  fields([
    ["Employment preference", readable(data.availability?.employmentTypes), 0.5],
    ["Preferred shifts", readable(data.availability?.shiftPreferences), 0.5],
  ]);
  const days = Object.entries(data.availability?.schedule || {}).filter(
    ([, hours]) => hours.start && hours.end,
  );
  table(
    ["Day", "Available from", "Available until"],
    days.length
      ? days.map(([day, hours]) => [day, formatTime(hours.start), formatTime(hours.end)])
      : [["Not provided", "Not provided", "Not provided"]],
    [0.4, 0.3, 0.3],
  );
  space(60);
  heading("APPLICANT CERTIFICATION");
  const consentText =
    data.applicationQuestionVersion === 2
      ? applicationCertification
      : [
          "I certify that the information in this application is true and complete. I authorize verification of the information provided and understand that false or omitted information may disqualify me or result in termination. I understand that submitting this application does not guarantee employment.",
        ];
  consentText.forEach((text) => paragraph(text, 8));
  space(30);
  font(7);
  doc.text("Applicant Signature", margin, y);
  doc.text("Date", margin + cw * 0.72, y);
  if (data.signatureImage) {
    try {
      const props = doc.getImageProperties(data.signatureImage);
      const scale = Math.min(85 / props.width, 16 / props.height);
      doc.addImage(
        data.signatureImage,
        "PNG",
        margin,
        y + 1,
        props.width * scale,
        props.height * scale,
      );
    } catch {
      font(9, true);
      doc.text(display(data.signature), margin, y + 10);
    }
  } else {
    font(9, true);
    doc.text(display(data.signature), margin, y + 10);
  }
  font(9, true);
  doc.text(formatDate(data.signatureDate), margin + cw * 0.72, y + 10);
  doc.setDrawColor(150);
  doc.line(margin, y + 18, margin + cw * 0.68, y + 18);
  doc.line(margin + cw * 0.72, y + 18, width - margin, y + 18);
  y += 24;
  paragraph(
    "Supporting photos, resume, and license documents are maintained separately in the applicant record.",
  );
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    font(7);
    if (data.isTestApplication)
      doc.text("SAMPLE - TEST ACCOUNT - NOT FOR EMPLOYMENT USE", width / 2, height - 12, {
        align: "center",
      });
    doc.text(`Application for Employment - Page ${page} of ${pages}`, width / 2, height - 7, {
      align: "center",
    });
  }

  const safeName =
    data.applicantName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "applicant";
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
