import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type OfficialOnboardingValues = {
  legalFirstName: string;
  middleInitial: string;
  legalLastName: string;
  otherLastNames: string;
  address: string;
  apartmentNumber: string;
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
  otherCredits: string;
  otherIncome: string;
  deductions: string;
  extraWithholding: string;
  exemptFromWithholding: boolean;
  employerName: string;
  startDate: string;
  signatureName: string;
  signatureDate: string;
  signatureImage: string;
  w4SignatureName: string;
  w4SignatureDate: string;
  w4SignatureImage: string;
  bankSignatureName: string;
  bankSignatureDate: string;
  bankSignatureImage: string;
};

export type DirectDepositAccountValues = {
  bankName: string;
  bankCity: string;
  bankState: string;
  accountType: "checking" | "savings" | "other";
  routingNumber: string;
  accountNumber: string;
  allocationType: "amount" | "entire";
  allocationAmount: string;
};

export type PolicyAcknowledgementValues = {
  title: string;
  printedName: string;
  employeeTitle: string;
  signatureDate: string;
  signatureImage: string;
  accepted: boolean;
  notes: string;
  documentFields?: Record<string, string>;
};

export type PolicyAutofillValues = OfficialOnboardingValues & {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  employerName: string;
  employeeIdNumber?: string;
  offeredPosition?: string;
  hourlyRate?: string;
  trackTikUsername?: string;
  issuedItems?: Record<string, boolean>;
  availabilitySchedule?: Record<string, { start?: string; end?: string }>;
  scheduledPost?: string;
  scheduledShift?: string;
  uniformShirt?: string;
  uniformPants?: string;
  uniformShoes?: string;
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

async function trimSignature(dataUrl: string) {
  if (!dataUrl || typeof document === "undefined") return dataUrl;
  return new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const source = document.createElement("canvas");
      source.width = image.naturalWidth;
      source.height = image.naturalHeight;
      const sourceContext = source.getContext("2d", { willReadFrequently: true });
      if (!sourceContext) { resolve(dataUrl); return; }
      sourceContext.drawImage(image, 0, 0);
      const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
      let left = source.width; let right = -1; let top = source.height; let bottom = -1;
      for (let y = 0; y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
          const offset = (y * source.width + x) * 4;
          if (pixels[offset + 3] > 20 && (pixels[offset] < 235 || pixels[offset + 1] < 235 || pixels[offset + 2] < 235)) {
            left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
          }
        }
      }
      if (right < left || bottom < top) { resolve(dataUrl); return; }
      const padding = 12;
      left = Math.max(0, left - padding); top = Math.max(0, top - padding);
      right = Math.min(source.width - 1, right + padding); bottom = Math.min(source.height - 1, bottom + padding);
      const trimmed = document.createElement("canvas");
      trimmed.width = right - left + 1; trimmed.height = bottom - top + 1;
      const trimmedContext = trimmed.getContext("2d");
      if (!trimmedContext) { resolve(dataUrl); return; }
      trimmedContext.fillStyle = "#ffffff";
      trimmedContext.fillRect(0, 0, trimmed.width, trimmed.height);
      trimmedContext.drawImage(source, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
      const croppedPixels = trimmedContext.getImageData(0, 0, trimmed.width, trimmed.height);
      for (let offset = 0; offset < croppedPixels.data.length; offset += 4) {
        if (croppedPixels.data[offset] > 245 && croppedPixels.data[offset + 1] > 245 && croppedPixels.data[offset + 2] > 245) croppedPixels.data[offset + 3] = 0;
      }
      trimmedContext.putImageData(croppedPixels, 0, 0);
      resolve(trimmed.toDataURL("image/png"));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
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
    "Apt Number (if any)": values.apartmentNumber,
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
  if (values.signatureImage || values.signatureName) {
    try {
      const signature = form.getField("Signature of Employee") as any;
      const font = values.signatureImage ? null : await document.embedFont(StandardFonts.TimesRomanItalic);
      const signatureImage = values.signatureImage ? await document.embedPng(await trimSignature(values.signatureImage)) : null;
      for (const widget of signature.acroField.getWidgets()) {
        const rect = widget.getRectangle();
        const pageRef = widget.P();
        const page = document.getPages().find(candidate => candidate.ref === pageRef) || document.getPages()[0];
        if (signatureImage) {
          const usableWidth = rect.width - 84;
          const scale = Math.min(usableWidth / signatureImage.width, 22 / signatureImage.height);
          const width = signatureImage.width * scale; const height = signatureImage.height * scale;
          page.drawImage(signatureImage, { x: rect.x + 72 + (usableWidth - width) / 2, y: rect.y + (rect.height - height) / 2, width, height });
        } else if (font) {
          let size = Math.min(14, Math.max(7, rect.height - 3));
          while (size > 5 && font.widthOfTextAtSize(values.signatureName, size) > rect.width - 6) size -= 0.5;
          page.drawText(values.signatureName, { x: rect.x + 3, y: rect.y + Math.max(2, (rect.height - size) / 2), size, font, color: rgb(0, 0, 0) });
        }
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
  const dependentCredits = values.exemptFromWithholding ? 0 : (Number(values.qualifyingChildren || 0) * 2200) + (Number(values.otherDependents || 0) * 500) + Number(values.otherCredits || 0);
  setText(form, {
    [`${p1}.Step1a[0].f1_01[0]`]: [values.legalFirstName, values.middleInitial].filter(Boolean).join(" "),
    [`${p1}.Step1a[0].f1_02[0]`]: values.legalLastName,
    [`${p1}.Step1a[0].f1_03[0]`]: values.address,
    [`${p1}.Step1a[0].f1_04[0]`]: `${values.city}, ${values.state} ${values.zip}`,
    [`${p1}.f1_05[0]`]: ssn,
    [`${p1}.Step3_ReadOrder[0].f1_06[0]`]: values.exemptFromWithholding ? "" : String((Number(values.qualifyingChildren || 0) * 2200) || ""),
    [`${p1}.Step3_ReadOrder[0].f1_07[0]`]: values.exemptFromWithholding ? "" : String((Number(values.otherDependents || 0) * 500) || ""),
    [`${p1}.f1_08[0]`]: String(dependentCredits || ""),
    [`${p1}.f1_09[0]`]: values.exemptFromWithholding ? "" : values.otherIncome,
    [`${p1}.f1_10[0]`]: values.exemptFromWithholding ? "" : values.deductions,
    [`${p1}.f1_11[0]`]: values.exemptFromWithholding ? "" : values.extraWithholding,
  });
  setChecks(form, {
    [`${p1}.c1_1[0]`]: values.filingStatus === "Single or Married filing separately",
    [`${p1}.c1_1[1]`]: values.filingStatus === "Married filing jointly or Qualifying surviving spouse",
    [`${p1}.c1_1[2]`]: values.filingStatus === "Head of household",
    [`${p1}.c1_2[0]`]: !values.exemptFromWithholding && values.multipleJobs,
    [`${p1}.c1_3[0]`]: values.exemptFromWithholding,
  });
  const page = document.getPages()[0];
  if (values.w4SignatureImage) {
    const signature = await document.embedPng(await trimSignature(values.w4SignatureImage));
    const scale = Math.min(325 / signature.width, 28 / signature.height);
    const width = signature.width * scale;
    const height = signature.height * scale;
    page.drawImage(signature, { x: 105 + (325 - width) / 2, y: 92 + (28 - height) / 2, width, height });
  } else if (values.w4SignatureName) {
    const font = await document.embedFont(StandardFonts.TimesRomanItalic);
    page.drawText(values.w4SignatureName, { x: 110, y: 98, size: 14, font, color: rgb(0, 0, 0) });
  }
  if (values.w4SignatureDate) page.drawText(date(values.w4SignatureDate), { x: 470, y: 98, size: 10, color: rgb(0, 0, 0) });
  try { form.updateFieldAppearances(await document.embedFont(StandardFonts.Helvetica)); } catch { /* viewer regenerates */ }
  return document.save();
}

export async function buildDirectDeposit(values: OfficialOnboardingValues, accounts: DirectDepositAccountValues[], ssn: string) {
  const document = await load("/forms/04-direct-deposit-auth-form.pdf");
  const form = document.getForm();
  const normalizedAccounts = accounts.slice(0, 3);
  const bankFieldNames = ["1  Bank NameCityState", "2  Bank NameCityState", "3  Bank NameCityState"];
  const routingFieldNames = ["Routing #", "Text8", "Text2"];
  const accountFieldNames = ["Account Number", "Account Number_2", "Account Number_3"];
  const amountFieldNames = ["I wish to deposit", "I wish to deposit_2", "I wish to deposit_3"];

  setText(form, {
    "Company Name": values.employerName,
    "Employee Name": values.bankSignatureName || [values.legalFirstName, values.middleInitial, values.legalLastName].filter(Boolean).join(" "),
    Date: date(values.bankSignatureDate),
    ...Object.fromEntries(normalizedAccounts.flatMap((account, index) => [
      [bankFieldNames[index], [account.bankName, [account.bankCity, account.bankState].filter(Boolean).join(", ")].filter(Boolean).join(" - ")],
      [routingFieldNames[index], account.routingNumber.replace(/\D/g, "")],
      [accountFieldNames[index], account.accountNumber.replace(/\D/g, "")],
      [amountFieldNames[index], account.allocationType === "amount" ? account.allocationAmount : ""],
    ])),
  });

  normalizedAccounts.forEach((account, index) => {
    const suffix = index === 0 ? "" : `_${index + 1}`;
    setChecks(form, {
      [`Checking${suffix}`]: account.accountType === "checking",
      [`Savings${suffix}`]: account.accountType === "savings",
      [`Other${suffix}`]: account.accountType === "other",
      [`Entire Net Amount${suffix}`]: account.allocationType === "entire",
    });
  });

  const page = document.getPages()[1];
  const font = await document.embedFont(StandardFonts.Helvetica);
  const ssnDigits = ssn.replace(/\D/g, "").slice(0, 9);

  if (values.bankSignatureImage || values.bankSignatureName) {
    try {
      const signatureField = form.getField("Employee Signature") as any;
      const widget = signatureField.acroField.getWidgets()[0];
      const rect = widget.getRectangle();
      if (values.bankSignatureImage) {
        const signature = await document.embedPng(await trimSignature(values.bankSignatureImage));
        const scale = Math.min((rect.width - 6) / signature.width, (rect.height - 3) / signature.height);
        const width = signature.width * scale;
        const height = signature.height * scale;
        page.drawImage(signature, { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height });
      } else {
        const signatureFont = await document.embedFont(StandardFonts.TimesRomanItalic);
        let size = Math.min(13, rect.height - 3);
        while (size > 6 && signatureFont.widthOfTextAtSize(values.bankSignatureName, size) > rect.width - 6) size -= 0.5;
        page.drawText(values.bankSignatureName, { x: rect.x + 3, y: rect.y + Math.max(2, (rect.height - size) / 2), size, font: signatureFont, color: rgb(0, 0, 0) });
      }
    } catch { /* signature widget differs between editions */ }
  }

  try { form.updateFieldAppearances(font); } catch { /* viewer regenerates */ }
  const segments = [ssnDigits.slice(0, 3), ssnDigits.slice(3, 5), ssnDigits.slice(5, 9)];
  const ssnFields = ["Check Box1.0.0", "Check Box1.1.0", "Check Box1.0.1"];
  const boxes = [
    { x: 461.798, y: 344.838, width: 26.575, height: 14.251 },
    { x: 495.691, y: 344.453, width: 17.332, height: 14.25 },
    { x: 519.956, y: 344.453, width: 37.745, height: 14.25 },
  ];
  ssnFields.forEach((name, index) => {
    try { form.removeField(form.getField(name)); } catch { /* field not present in this edition */ }
    page.drawRectangle({ ...boxes[index], color: rgb(1, 1, 1), borderColor: rgb(0, 0, 0), borderWidth: 0.8 });
    const segment = segments[index];
    if (!segment) return;
    const size = 8;
    const textWidth = font.widthOfTextAtSize(segment, size);
    page.drawText(segment, { x: boxes[index].x + (boxes[index].width - textWidth) / 2, y: boxes[index].y + 3.1, size, font, color: rgb(0, 0, 0) });
  });
  return document.save();
}

const wrapText = (font: any, text: string, size: number, maxWidth: number) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else { if (line) lines.push(line); line = word; }
  });
  if (line) lines.push(line);
  return lines;
};

export async function buildPolicyAcknowledgement(path: string, acknowledgement: PolicyAcknowledgementValues, values: PolicyAutofillValues) {
  const document = await load(path);
  const originalPageCount = document.getPageCount();
  const form = document.getForm();
  const employeeName = acknowledgement.printedName || [values.legalFirstName, values.middleInitial, values.legalLastName].filter(Boolean).join(" ");
  const formattedDate = date(acknowledgement.signatureDate);
  const schedule = values.availabilitySchedule || {};
  const fieldValues: Record<string, string> = {
    "Employee Name": employeeName,
    "Employees Name Printed": employeeName,
    Employee: employeeName,
    "Printed Name": employeeName,
    "Print Name": employeeName,
    "Temporary Employees Signature Date": [employeeName, formattedDate].filter(Boolean).join(" - "),
    Date: formattedDate,
    "Todays Date": formattedDate,
    "This Confidentiality Agreement the Agreement dated as of": formattedDate,
    Title: acknowledgement.employeeTitle || values.offeredPosition || "Security Officer",
    "Employee File Number": values.employeeIdNumber || "",
    "Street Address": values.address || "",
    "City State ZIP": [values.city, values.state, values.zip].filter(Boolean).join(", "),
    "User Name  for Track Tik": values.trackTikUsername || "",
    Position: values.offeredPosition || "Security Officer",
    Text1: employeeName,
    Text2: date(values.startDate) || formattedDate,
    Text3: values.employeeIdNumber || "",
    Text4: "Security",
    "Item": Object.entries(values.issuedItems || {}).filter(([, selected]) => selected).map(([item]) => item).join(", "),
    "NotesExplanations ex School MonFri 700am300pm": acknowledgement.notes || "",
    ...Object.fromEntries(Object.entries(acknowledgement.documentFields || {}).map(([name, value]) => [name, name.startsWith("Date") ? date(value) : value])),
  };
  Object.entries(schedule).forEach(([day, hours]) => {
    const upper = day.toUpperCase();
    fieldValues[`${upper}From`] = hours?.start || "";
    fieldValues[`${upper}To`] = hours?.end || "";
  });
  setText(form, fieldValues);
  Object.entries(acknowledgement.documentFields || {}).forEach(([name, value]) => {
    if (!value) return;
    try {
      const textField = form.getTextField(name);
      textField.setFontSize(/^Qty/.test(name) ? 9 : /^Text[1-4]$/.test(name) ? 9 : 7);
    } catch { /* field is not a text field in this document */ }
  });

  const regularFont = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const signatureFont = await document.embedFont(StandardFonts.TimesRomanItalic);
  const signatureImage = acknowledgement.signatureImage ? await document.embedPng(await trimSignature(acknowledgement.signatureImage)) : null;
  for (const field of form.getFields()) {
    const name = field.getName();
    const lower = name.toLowerCase();
    const employeeSignature = lower.includes("signature") && !/(company|employer|manager|supervisor|representative)/.test(lower);
    if (!employeeSignature) continue;
    if (field.constructor.name === "PDFTextField") {
      try { (field as any).setText(employeeName); } catch { /* field type differs */ }
      continue;
    }
    try {
      for (const widget of (field as any).acroField.getWidgets()) {
        const rect = widget.getRectangle();
        const pageRef = widget.P();
        const page = document.getPages().find(candidate => candidate.ref === pageRef) || document.getPages()[document.getPageCount() - 1];
        if (signatureImage) {
          const scale = Math.min((rect.width - 6) / signatureImage.width, (rect.height - 3) / signatureImage.height);
          const width = signatureImage.width * scale;
          const height = signatureImage.height * scale;
          page.drawImage(signatureImage, { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height });
        } else if (employeeName) {
          let size = Math.min(13, rect.height - 3);
          while (size > 6 && signatureFont.widthOfTextAtSize(employeeName, size) > rect.width - 6) size -= 0.5;
          page.drawText(employeeName, { x: rect.x + 3, y: rect.y + Math.max(2, (rect.height - size) / 2), size, font: signatureFont, color: rgb(0, 0, 0) });
        }
      }
    } catch { /* signature widget differs between documents */ }
  }
  try { form.updateFieldAppearances(regularFont); } catch { /* viewer regenerates */ }

  const receipt = document.addPage([612, 792]);
  receipt.drawRectangle({ x: 0, y: 716, width: 612, height: 76, color: rgb(0.06, 0.29, 0.72) });
  receipt.drawText("WE FIND GUARDS", { x: 48, y: 755, size: 12, font: boldFont, color: rgb(1, 1, 1) });
  receipt.drawText("SIGNED DOCUMENT ACKNOWLEDGMENT", { x: 48, y: 733, size: 18, font: boldFont, color: rgb(1, 1, 1) });
  receipt.drawText(acknowledgement.title, { x: 48, y: 678, size: 18, font: boldFont, color: rgb(0.06, 0.09, 0.16), maxWidth: 516 });
  const statement = `I acknowledge that I received and reviewed the complete ${acknowledgement.title} document and agree to follow the policies, responsibilities, and requirements that apply to my employment with ${values.employerName}.`;
  wrapText(regularFont, statement, 11, 516).forEach((line, index) => receipt.drawText(line, { x: 48, y: 636 - index * 17, size: 11, font: regularFont, color: rgb(0.17, 0.2, 0.27) }));
  receipt.drawText("Employee", { x: 48, y: 524, size: 9, font: boldFont, color: rgb(0.39, 0.43, 0.5) });
  receipt.drawText(employeeName, { x: 48, y: 501, size: 13, font: regularFont, color: rgb(0.06, 0.09, 0.16) });
  receipt.drawText("Position", { x: 330, y: 524, size: 9, font: boldFont, color: rgb(0.39, 0.43, 0.5) });
  receipt.drawText(acknowledgement.employeeTitle || values.offeredPosition || "Security Officer", { x: 330, y: 501, size: 13, font: regularFont, color: rgb(0.06, 0.09, 0.16) });
  receipt.drawText("Signature", { x: 48, y: 444, size: 9, font: boldFont, color: rgb(0.39, 0.43, 0.5) });
  receipt.drawRectangle({ x: 48, y: 324, width: 332, height: 102, color: rgb(0.98, 0.99, 1), borderColor: rgb(0.78, 0.82, 0.9), borderWidth: 1 });
  if (signatureImage) {
    const scale = Math.min(286 / signatureImage.width, 70 / signatureImage.height);
    const width = signatureImage.width * scale;
    const height = signatureImage.height * scale;
    receipt.drawImage(signatureImage, { x: 71 + (286 - width) / 2, y: 340 + (70 - height) / 2, width, height });
  } else if (employeeName) receipt.drawText(employeeName, { x: 70, y: 360, size: 24, font: signatureFont, color: rgb(0.04, 0.08, 0.15) });
  receipt.drawText("Date signed", { x: 414, y: 444, size: 9, font: boldFont, color: rgb(0.39, 0.43, 0.5) });
  receipt.drawText(formattedDate, { x: 414, y: 392, size: 13, font: regularFont, color: rgb(0.06, 0.09, 0.16) });
  if (acknowledgement.notes) {
    receipt.drawText("Employee notes", { x: 48, y: 274, size: 9, font: boldFont, color: rgb(0.39, 0.43, 0.5) });
    wrapText(regularFont, acknowledgement.notes, 10, 516).slice(0, 7).forEach((line, index) => receipt.drawText(line, { x: 48, y: 250 - index * 15, size: 10, font: regularFont, color: rgb(0.17, 0.2, 0.27) }));
  }
  receipt.drawText(`Document ${originalPageCount + 1} of ${originalPageCount + 1} - acknowledgment added by We Find Guards`, { x: 48, y: 42, size: 8, font: regularFont, color: rgb(0.45, 0.49, 0.56) });
  return { bytes: await document.save(), previewPage: originalPageCount + 1 };
}

export function pdfUrl(bytes: Uint8Array) {
  return URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }));
}
