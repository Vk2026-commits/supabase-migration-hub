import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type OfficialOnboardingValues = {
  legalFirstName: string;
  middleInitial: string;
  legalLastName: string;
  otherLastNames: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  citizenshipStatus: string;
  alienNumber: string;
  i94Number: string;
  foreignPassportNumber: string;
  passportCountry: string;
  workAuthorizationExpiration: string;
  filingStatus: string;
  multipleJobs: boolean;
  qualifyingChildren: string;
  otherDependents: string;
  otherIncome: string;
  deductions: string;
  extraWithholding: string;
  employerName: string;
  startDate: string;
  signatureName: string;
  signatureDate: string;
};

const date = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value || "";
};

async function load(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return PDFDocument.load(await response.arrayBuffer(), { ignoreEncryption: true });
}

const setText = (form: ReturnType<PDFDocument["getForm"]>, values: Record<string, string>) => {
  Object.entries(values).forEach(([name, value]) => {
    if (!value) return;
    try { form.getTextField(name).setText(value); } catch { /* field not present in this edition */ }
  });
};

const setChecks = (form: ReturnType<PDFDocument["getForm"]>, values: Record<string, boolean>) => {
  Object.entries(values).forEach(([name, checked]) => {
    if (!checked) return;
    try { form.getCheckBox(name).check(); } catch { /* field not present in this edition */ }
  });
};

export async function buildI9(values: OfficialOnboardingValues, ssn: string) {
  const document = await load("/forms/02-i-9-2026.pdf");
  const form = document.getForm();
  const status = values.citizenshipStatus;
  setText(form, {
    "Last Name (Family Name)": values.legalLastName,
    "First Name Given Name": values.legalFirstName,
    "Employee Middle Initial (if any)": values.middleInitial.slice(0, 1),
    "Employee Other Last Names Used (if any)": values.otherLastNames,
    "Address Street Number and Name": values.address,
    "City or Town": values.city,
    State: values.state.toUpperCase(),
    "ZIP Code": values.zip,
    "Date of Birth mmddyyyy": date(values.dateOfBirth),
    "US Social Security Number": ssn.replace(/\D/g, ""),
    "Employees E-mail Address": values.email,
    "Telephone Number": values.phone,
    "Today's Date mmddyyy": date(values.signatureDate),
    "3 A lawful permanent resident Enter USCIS or ANumber": status === "Lawful permanent resident" ? values.alienNumber : "",
    "USCIS ANumber": status === "Authorized to work until a specified date" ? values.alienNumber : "",
    "Form I94 Admission Number": values.i94Number,
    "Foreign Passport Number and Country of IssuanceRow1": [values.foreignPassportNumber, values.passportCountry].filter(Boolean).join(" / "),
    "Exp Date mmddyyyy": date(values.workAuthorizationExpiration),
  });
  setChecks(form, {
    CB_1: status === "U.S. citizen",
    CB_2: status === "Noncitizen national",
    CB_3: status === "Lawful permanent resident",
    CB_4: status === "Authorized to work until a specified date",
  });
  if (values.signatureName) {
    try {
      const signature = form.getField("Signature of Employee") as any;
      const font = await document.embedFont(StandardFonts.TimesRomanItalic);
      for (const widget of signature.acroField.getWidgets()) {
        const rect = widget.getRectangle();
        const pageRef = widget.P();
        const page = document.getPages().find(candidate => candidate.ref === pageRef) || document.getPages()[0];
        let size = Math.min(14, Math.max(7, rect.height - 3));
        while (size > 5 && font.widthOfTextAtSize(values.signatureName, size) > rect.width - 6) size -= 0.5;
        page.drawText(values.signatureName, { x: rect.x + 3, y: rect.y + Math.max(2, (rect.height - size) / 2), size, font, color: rgb(0, 0, 0) });
      }
    } catch { /* signature widget differs between editions */ }
  }
  try { form.updateFieldAppearances(await document.embedFont(StandardFonts.Helvetica)); } catch { /* viewer regenerates */ }
  return document.save();
}

export async function buildW4(values: OfficialOnboardingValues, ssn: string) {
  const document = await load("/forms/W-4_Form_2026.pdf");
  const form = document.getForm();
  const p1 = "topmostSubform[0].Page1[0]";
  setText(form, {
    [`${p1}.Step1a[0].f1_01[0]`]: [values.legalFirstName, values.middleInitial].filter(Boolean).join(" "),
    [`${p1}.Step1a[0].f1_02[0]`]: values.legalLastName,
    [`${p1}.Step1a[0].f1_03[0]`]: values.address,
    [`${p1}.Step1a[0].f1_04[0]`]: `${values.city}, ${values.state} ${values.zip}`,
    [`${p1}.f1_05[0]`]: ssn,
    [`${p1}.Step3_ReadOrder[0].f1_06[0]`]: String((Number(values.qualifyingChildren || 0) * 2200) || ""),
    [`${p1}.Step3_ReadOrder[0].f1_07[0]`]: String((Number(values.otherDependents || 0) * 500) || ""),
    [`${p1}.f1_09[0]`]: String((Number(values.qualifyingChildren || 0) * 2200) + (Number(values.otherDependents || 0) * 500) || ""),
    [`${p1}.f1_10[0]`]: values.otherIncome,
    [`${p1}.f1_11[0]`]: values.deductions,
    [`${p1}.f1_12[0]`]: values.extraWithholding,
    [`${p1}.f1_13[0]`]: values.employerName,
    [`${p1}.f1_14[0]`]: date(values.startDate),
  });
  setChecks(form, {
    [`${p1}.c1_1[0]`]: values.filingStatus === "Single or Married filing separately",
    [`${p1}.c1_1[1]`]: values.filingStatus === "Married filing jointly or Qualifying surviving spouse",
    [`${p1}.c1_1[2]`]: values.filingStatus === "Head of household",
    [`${p1}.c1_2[0]`]: values.multipleJobs,
  });
  const page = document.getPages()[0];
  const font = await document.embedFont(StandardFonts.TimesRomanItalic);
  if (values.signatureName) page.drawText(values.signatureName, { x: 130, y: 142, size: 14, font, color: rgb(0, 0, 0) });
  if (values.signatureDate) page.drawText(date(values.signatureDate), { x: 500, y: 142, size: 10, color: rgb(0, 0, 0) });
  try { form.updateFieldAppearances(await document.embedFont(StandardFonts.Helvetica)); } catch { /* viewer regenerates */ }
  return document.save();
}

export function pdfUrl(bytes: Uint8Array) {
  return URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }));
}
