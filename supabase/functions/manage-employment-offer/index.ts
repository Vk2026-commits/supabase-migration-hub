import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sha256 = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
const clean = (value: unknown) => String(value ?? "").trim();
const companyProfileReady = (company: Record<string, unknown> | null | undefined) =>
  Boolean(
    company &&
      [
        company.company_name,
        company.company_address,
        company.company_city,
        company.company_state,
        company.company_zip,
        company.contact_person_name,
        company.contact_email,
        company.contact_cell_phone,
      ].every((value) => clean(value)),
  );
const formatDate = (value: unknown) => {
  const input = clean(value);
  if (!input) return "Not provided";
  const parsed = new Date(`${input.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? input : parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};
const label = (value: string) => ({
  full_time: "Full-time", part_time: "Part-time", temporary: "Temporary", seasonal: "Seasonal",
  nonexempt: "Nonexempt", exempt: "Exempt", biweekly: "Every two weeks", semimonthly: "Twice per month",
  guaranteed: "Guaranteed", variable: "Variable / not guaranteed", eligible: "Eligible", not_eligible: "Not eligible",
}[value] || value);

const requiredTerms = [
  "positionTitle", "duties", "employmentType", "classification", "hourlyRate", "overtimeTerms", "payFrequency",
  "regularPayday", "shiftDifferential", "bonusCompensation", "additionalCompensation", "worksiteName", "worksiteAddress",
  "worksiteCity", "worksiteState", "worksiteZip", "supervisorName", "expectedSchedule", "expectedWeeklyHours", "hoursType",
  "benefitsEligibility", "benefitsSummary", "ptoSummary", "holidaySummary", "policyReferences", "startDate",
  "acceptanceDeadline", "otherContingencies", "specialTerms", "representativeName", "representativeTitle",
];

const validateTerms = (terms: Record<string, unknown>) => {
  const missing = requiredTerms.filter((key) => !clean(terms[key]));
  if (terms.benefitsEligibility === "eligible" && !clean(terms.benefitsEffectiveDate)) missing.push("benefitsEffectiveDate");
  if (!terms.atWillAcknowledged) missing.push("atWillAcknowledged");
  if (!(Number(terms.hourlyRate) > 0)) missing.push("hourlyRate");
  if (!(Number(terms.expectedWeeklyHours) > 0 && Number(terms.expectedWeeklyHours) <= 168)) missing.push("expectedWeeklyHours");
  if (clean(terms.acceptanceDeadline) < new Date().toISOString().slice(0, 10)) missing.push("acceptanceDeadline");
  return [...new Set(missing)];
};

const dataUrlBytes = (value?: string) => {
  if (!value?.startsWith("data:image/png;base64,")) return null;
  const binary = atob(value.split(",")[1]);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function buildOfferPdf(input: {
  offerId: string;
  version: number;
  company: Record<string, unknown>;
  officerName: string;
  officerAddress: string;
  terms: Record<string, unknown>;
  employerSignature?: string;
  officerSignature?: string;
  officerPrintedName?: string;
  officerSignedAt?: string;
}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const navy = rgb(0.035, 0.12, 0.28);
  const blue = rgb(0.04, 0.27, 0.68);
  const ink = rgb(0.08, 0.1, 0.15);
  const gray = rgb(0.38, 0.42, 0.5);
  const lightGray = rgb(0.85, 0.87, 0.9);
  const green = rgb(0.02, 0.46, 0.29);
  let page = pdf.addPage([612, 792]);
  let y = 730;
  const margin = 52;
  const width = 508;
  const lineHeight = 13.5;
  let pageNumber = 1;
  const wrap = (text: string, font = regular, size = 9.5, maxWidth = width) => {
    const words = clean(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else { if (line) lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };
  const footer = () => {
    page.drawLine({ start: { x: margin, y: 34 }, end: { x: margin + width, y: 34 }, thickness: 0.55, color: lightGray });
    page.drawText(`EMPLOYMENT OFFER  |  ID ${input.offerId}  |  VERSION ${input.version}`, { x: margin, y: 19, size: 6.7, font: bold, color: gray });
    page.drawText(`PAGE ${pageNumber}`, { x: 520, y: 19, size: 6.7, font: bold, color: gray });
  };
  const continuationHeader = () => {
    page.drawLine({ start: { x: margin, y: 754 }, end: { x: margin + width, y: 754 }, thickness: 2.2, color: blue });
    page.drawText(clean(input.company.company_name).toUpperCase(), { x: margin, y: 735, size: 8.5, font: bold, color: navy });
    page.drawText(`EMPLOYMENT OFFER - ${input.officerName.toUpperCase()}`, { x: 338, y: 735, size: 7.4, font: bold, color: gray });
  };
  const ensure = (height: number) => {
    if (y - height > 52) return;
    footer();
    page = pdf.addPage([612, 792]);
    pageNumber += 1;
    continuationHeader();
    y = 706;
  };
  const text = (value: string, options: { font?: typeof regular; size?: number; color?: typeof ink; indent?: number; gap?: number; maxWidth?: number } = {}) => {
    const font = options.font || regular;
    const size = options.size || 9.5;
    const indent = options.indent || 0;
    const lines = wrap(value, font, size, options.maxWidth || width - indent);
    ensure(lines.length * lineHeight + (options.gap ?? 5));
    lines.forEach((line) => { page.drawText(line, { x: margin + indent, y, size, font, color: options.color || ink }); y -= lineHeight; });
    y -= options.gap ?? 5;
  };
  const section = (title: string) => {
    ensure(34);
    y -= 6;
    page.drawText(title.toUpperCase(), { x: margin, y, size: 8.4, font: bold, color: blue });
    page.drawLine({ start: { x: margin, y: y - 7 }, end: { x: margin + width, y: y - 7 }, thickness: 0.8, color: lightGray });
    y -= 25;
  };
  const paragraph = (value: string, gap = 10) => text(value, { size: 10.2, gap });
  const detail = (name: string, value: unknown, x: number, top: number, detailWidth: number) => {
    page.drawText(name.toUpperCase(), { x, y: top, size: 7.1, font: bold, color: gray });
    const lines = wrap(clean(value) || "Not specified", bold, 9.7, detailWidth).slice(0, 3);
    lines.forEach((line, index) => page.drawText(line, { x, y: top - 17 - (index * 12), size: 9.7, font: bold, color: ink }));
  };
  const bullet = (value: string) => {
    const lines = wrap(value, regular, 9.8, width - 24);
    ensure(lines.length * lineHeight + 5);
    page.drawCircle({ x: margin + 4, y: y + 3, size: 2.2, color: blue });
    lines.forEach((line, index) => page.drawText(line, { x: margin + 16, y: y - (index * lineHeight), size: 9.8, font: regular, color: ink }));
    y -= lines.length * lineHeight + 5;
  };
  const meaningful = (value: unknown) => {
    const normalized = clean(value).toLowerCase();
    return normalized && !["none", "n/a", "not applicable", "tbd"].includes(normalized);
  };

  const companyAddress = [input.company.company_address, input.company.company_address_unit, input.company.company_city, input.company.company_state, input.company.company_zip].filter(Boolean).join(", ");
  const worksiteAddress = [input.terms.worksiteAddress, input.terms.worksiteCity, input.terms.worksiteState, input.terms.worksiteZip].filter(Boolean).join(", ");
  const offerDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  page.drawLine({ start: { x: margin, y: 754 }, end: { x: margin + width, y: 754 }, thickness: 3, color: blue });
  page.drawText(clean(input.company.company_name).toUpperCase(), { x: margin, y: 731, size: 9.5, font: bold, color: navy });
  page.drawText("EMPLOYMENT OFFER", { x: margin, y: 691, size: 25, font: bold, color: navy });
  page.drawText(`Prepared exclusively for ${input.officerName}`, { x: margin, y: 669, size: 10.5, font: regular, color: gray });
  page.drawText(offerDate, { x: 447, y: 731, size: 8.5, font: bold, color: gray });
  y = 628;

  text(`Dear ${input.officerName},`, { font: bold, size: 11, gap: 8 });
  paragraph(`${clean(input.company.company_name)} is pleased to offer you employment as a ${clean(input.terms.positionTitle)}. We believe your experience will be a valuable addition to our team. This letter brings the essential terms of the offer together in one clear record so you can understand the role, compensation, expectations, and conditions before making your decision.`, 14);

  page.drawRectangle({ x: margin, y: y - 102, width, height: 102, color: rgb(0.985, 0.989, 0.997), borderColor: lightGray, borderWidth: 0.7 });
  page.drawRectangle({ x: margin, y: y - 102, width: 4, height: 102, color: blue });
  detail("Position", input.terms.positionTitle, margin + 18, y - 20, 205);
  detail("Hourly pay", `$${Number(input.terms.hourlyRate).toFixed(2)} per hour`, margin + 274, y - 20, 205);
  detail("Anticipated start", formatDate(input.terms.startDate), margin + 18, y - 65, 205);
  detail("Expected hours", `${input.terms.expectedWeeklyHours} per week - ${label(clean(input.terms.hoursType))}`, margin + 274, y - 65, 205);
  y -= 124;

  section("The position");
  paragraph(`You will serve as a ${label(clean(input.terms.employmentType)).toLowerCase()} ${clean(input.terms.positionTitle)} and will report to ${clean(input.terms.supervisorName)}. The position is classified as ${label(clean(input.terms.classification)).toLowerCase()} under the company's stated classification. Your primary responsibilities will include ${clean(input.terms.duties).replace(/[.]+$/, "")}.`);
  paragraph(`Your expected schedule is ${clean(input.terms.expectedSchedule)}, totaling approximately ${input.terms.expectedWeeklyHours} hours per week. These hours are ${input.terms.hoursType === "guaranteed" ? "guaranteed as described in this offer" : "expected to vary based on operational needs and are not guaranteed"}. Your primary worksite will be ${clean(input.terms.worksiteName)} at ${worksiteAddress}.`, 12);

  section("Compensation and payroll");
  page.drawRectangle({ x: margin, y: y - 74, width, height: 74, color: rgb(0.965, 0.99, 0.978), borderColor: rgb(0.62, 0.84, 0.72), borderWidth: 0.8 });
  page.drawText("BASE COMPENSATION", { x: margin + 15, y: y - 19, size: 7.4, font: bold, color: green });
  page.drawText(`$${Number(input.terms.hourlyRate).toFixed(2)} PER HOUR`, { x: margin + 15, y: y - 45, size: 18, font: bold, color: navy });
  const payrollLines = wrap(`Paid ${label(clean(input.terms.payFrequency)).toLowerCase()} | Regular payday: ${clean(input.terms.regularPayday)}`, regular, 8.8, 232);
  payrollLines.forEach((line, index) => page.drawText(line, { x: margin + 260, y: y - 27 - (index * 12), size: 8.8, font: regular, color: ink }));
  y -= 91;
  paragraph(`Because this position is ${label(clean(input.terms.classification)).toLowerCase()}, overtime will be handled as follows: ${clean(input.terms.overtimeTerms)}`);
  const extras = [
    meaningful(input.terms.shiftDifferential) && `shift differential of ${clean(input.terms.shiftDifferential)}`,
    meaningful(input.terms.bonusCompensation) && `bonus compensation of ${clean(input.terms.bonusCompensation)}`,
    meaningful(input.terms.additionalCompensation) && clean(input.terms.additionalCompensation),
  ].filter(Boolean).join("; ");
  paragraph(extras ? `Additional compensation included with this offer: ${extras}.` : "No additional shift differential, bonus, or other compensation is included unless later confirmed in a written amendment signed by the company.", 12);

  ensure(112);
  section("Benefits and time away from work");
  if (input.terms.benefitsEligibility === "eligible") {
    paragraph(`You are eligible for the benefits described by the company beginning ${formatDate(input.terms.benefitsEffectiveDate)}: ${clean(input.terms.benefitsSummary)}.`);
  } else {
    paragraph("This position is not eligible for company-sponsored benefits under the terms of this offer.");
  }
  paragraph(`${meaningful(input.terms.ptoSummary) ? `Paid time off: ${clean(input.terms.ptoSummary)}.` : "No paid time off is specified in this offer."} ${meaningful(input.terms.holidaySummary) ? `Holiday terms: ${clean(input.terms.holidaySummary)}.` : "No paid holidays are specified in this offer."} The employment policies that apply include ${clean(input.terms.policyReferences)}.`, 12);

  section("Requirements before your first day");
  const contingencies = [
    input.terms.backgroundCheckRequired && "Successful completion of the company's background-screening requirements.",
    input.terms.drugTestRequired && "Successful completion of the required drug screening.",
    input.terms.licenseVerificationRequired && "Verification of every license or certification required for the assignment.",
    input.terms.workAuthorizationRequired && "Verification of identity and authorization to work in the United States.",
  ].filter(Boolean) as string[];
  if (contingencies.length) contingencies.forEach(bullet);
  else paragraph("The company listed no pre-employment contingencies for this offer.");
  if (meaningful(input.terms.otherContingencies)) bullet(`Additional condition: ${clean(input.terms.otherContingencies)}`);
  if (meaningful(input.terms.specialTerms)) bullet(`Special term: ${clean(input.terms.specialTerms)}`);
  y -= 4;

  section("Employment relationship and acceptance");
  ensure(96);
  page.drawRectangle({ x: margin, y: y - 79, width, height: 79, color: rgb(0.985, 0.975, 0.945), borderColor: rgb(0.87, 0.74, 0.42), borderWidth: 0.8 });
  page.drawText("IMPORTANT AT-WILL NOTICE", { x: margin + 15, y: y - 20, size: 7.6, font: bold, color: rgb(0.52, 0.32, 0.03) });
  const atWillLines = wrap("Employment has no fixed duration. You or the company may end the employment relationship at any time, with or without cause or advance notice, subject to applicable law. Nothing in this offer creates a contract for a guaranteed term.", regular, 9.3, width - 30);
  atWillLines.forEach((line, index) => page.drawText(line, { x: margin + 15, y: y - 39 - (index * 12), size: 9.3, font: regular, color: ink }));
  y -= 96;
  paragraph(`Please review the complete offer carefully and respond no later than ${formatDate(input.terms.acceptanceDeadline)}. Acceptance is completed in We Find Guards by viewing this company-signed document and applying your electronic signature.`, 14);

  section("Company approval");
  paragraph(`For ${clean(input.company.company_name)}, ${clean(input.terms.representativeName)}, ${clean(input.terms.representativeTitle)}, confirms that the terms in this letter are authorized and complete as of ${offerDate}.`);
  text(companyAddress, { size: 8.8, color: gray, gap: 11 });
  ensure(110);
  const signatureTop = y;
  const employerSignature = dataUrlBytes(input.employerSignature);
  if (employerSignature) {
    const image = await pdf.embedPng(employerSignature);
    const scale = Math.min(220 / image.width, 58 / image.height);
    page.drawImage(image, { x: margin + 8, y: signatureTop - image.height * scale, width: image.width * scale, height: image.height * scale });
  } else {
    page.drawText(clean(input.terms.representativeName), { x: margin + 8, y: signatureTop - 38, size: 18, font: italic, color: ink });
  }
  page.drawLine({ start: { x: margin, y: signatureTop - 62 }, end: { x: margin + 246, y: signatureTop - 62 }, thickness: 0.8, color: gray });
  page.drawText("AUTHORIZED COMPANY SIGNATURE", { x: margin, y: signatureTop - 77, size: 6.8, font: bold, color: gray });
  page.drawText(`${clean(input.terms.representativeName)}  |  ${clean(input.terms.representativeTitle)}`, { x: margin, y: signatureTop - 94, size: 8.6, font: bold, color: ink });
  page.drawText(`SIGNED ${offerDate.toUpperCase()}`, { x: margin + 336, y: signatureTop - 77, size: 6.8, font: bold, color: gray });
  y = signatureTop - 118;

  if (input.officerPrintedName) {
    section("Employee acceptance record");
    paragraph(`I, ${input.officerPrintedName}, confirm that I reviewed this complete offer and accept the employment terms stated in this document. My electronic signature below is attached to this exact offer version.`);
    const officerSignature = dataUrlBytes(input.officerSignature);
    if (officerSignature) {
      const image = await pdf.embedPng(officerSignature);
      const scale = Math.min(230 / image.width, 60 / image.height);
      ensure(104);
      page.drawImage(image, { x: margin + 8, y: y - image.height * scale, width: image.width * scale, height: image.height * scale });
      page.drawLine({ start: { x: margin, y: y - 64 }, end: { x: margin + 246, y: y - 64 }, thickness: 0.8, color: gray });
      page.drawText("EMPLOYEE SIGNATURE", { x: margin, y: y - 79, size: 6.8, font: bold, color: gray });
      page.drawText(input.officerPrintedName, { x: margin, y: y - 96, size: 8.6, font: bold, color: ink });
      page.drawText(`ACCEPTED ${formatDate(input.officerSignedAt || new Date().toISOString()).toUpperCase()}`, { x: margin + 336, y: y - 79, size: 6.8, font: bold, color: gray });
      y -= 112;
    }
  } else {
    section("Employee decision");
    text("To accept, review this company-signed offer in We Find Guards and apply your electronic signature by the deadline above. The system will archive your signature and timestamp with this exact offer version.", { size: 9.2, gap: 5 });
  }
  footer();
  return pdf.save();
}

async function appendEmployeeAcceptance(source: Uint8Array, input: { offerId: string; version: number; officerName: string; signedAt: string; signature: string }) {
  const pdf = await PDFDocument.load(source);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  page.drawRectangle({ x: 0, y: 652, width: 612, height: 140, color: rgb(0.04, 0.25, 0.65) });
  page.drawText("WE FIND GUARDS", { x: 52, y: 752, size: 10, font: bold, color: rgb(0.75, 0.85, 1) });
  page.drawText("Offer accepted", { x: 52, y: 712, size: 27, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Electronic acceptance record", { x: 52, y: 684, size: 12, font: regular, color: rgb(0.9, 0.94, 1) });
  page.drawRectangle({ x: 52, y: 566, width: 508, height: 58, color: rgb(0.92, 0.98, 0.94), borderColor: rgb(0.3, 0.75, 0.46), borderWidth: 0.8 });
  page.drawText("ACCEPTANCE CONFIRMED", { x: 68, y: 601, size: 8, font: bold, color: rgb(0.05, 0.48, 0.22) });
  page.drawText("The officer reviewed the complete company-signed offer and accepted its terms.", { x: 68, y: 581, size: 10, font: regular, color: rgb(0.06, 0.09, 0.16) });
  page.drawText("ACCEPTED BY", { x: 52, y: 522, size: 8, font: bold, color: rgb(0.36, 0.4, 0.48) });
  page.drawText(input.officerName, { x: 52, y: 501, size: 12, font: bold, color: rgb(0.06, 0.09, 0.16) });
  page.drawText("ACCEPTANCE DATE", { x: 316, y: 522, size: 8, font: bold, color: rgb(0.36, 0.4, 0.48) });
  page.drawText(formatDate(input.signedAt), { x: 316, y: 501, size: 12, font: bold, color: rgb(0.06, 0.09, 0.16) });
  const signatureBytes = dataUrlBytes(input.signature);
  if (!signatureBytes) throw new Error("Employee signature is invalid");
  const image = await pdf.embedPng(signatureBytes);
  const scale = Math.min(330 / image.width, 100 / image.height);
  page.drawText("EMPLOYEE SIGNATURE", { x: 52, y: 451, size: 8, font: bold, color: rgb(0.36, 0.4, 0.48) });
  page.drawRectangle({ x: 52, y: 292, width: 508, height: 140, color: rgb(0.98, 0.985, 1), borderColor: rgb(0.82, 0.87, 0.96), borderWidth: 0.8 });
  page.drawImage(image, { x: 74, y: 310, width: image.width * scale, height: image.height * scale });
  page.drawLine({ start: { x: 74, y: 306 }, end: { x: 470, y: 306 }, thickness: 0.7, color: rgb(0.36, 0.4, 0.48) });
  page.drawText("This page is attached to and forms part of the company-signed employment offer.", { x: 52, y: 250, size: 9, font: regular, color: rgb(0.36, 0.4, 0.48) });
  page.drawText(`Offer ${input.offerId} - Version ${input.version} - Fully accepted`, { x: 52, y: 20, size: 7, font: regular, color: rgb(0.36, 0.4, 0.48) });
  return pdf.save();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in is required" }, 401);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const token = authorization.replace("Bearer ", "");
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Invalid or expired session" }, 401);
    const body = await request.json();
    const action = clean(body.action);
    const companyMemberRole = async (companyId: string) => {
      const { data } = await admin.from("company_members").select("role,status").eq("company_id", companyId).eq("user_id", authData.user.id).maybeSingle();
      return data?.status === "active" ? data.role : null;
    };

    if (action === "send") {
      const companyId = clean(body.company_id);
      const officerId = clean(body.officer_id);
      const applicationId = clean(body.hiring_application_id);
      const offerId = clean(body.idempotency_key);
      const terms = body.terms as Record<string, unknown>;
      const missing = validateTerms(terms || {});
      if (!companyId || !officerId || !applicationId || !/^[0-9a-f-]{36}$/i.test(offerId) || missing.length) return json({ error: "Complete every required offer field", missing }, 400);
      if (!dataUrlBytes(body.company_signature)) return json({ error: "Company representative signature is required" }, 400);
      const { data: company } = await admin.from("company_profiles").select("*").eq("id", companyId).maybeSingle();
      const memberRole = await companyMemberRole(companyId);
      const canSendOffer = company?.user_id === authData.user.id || ["owner", "admin", "hiring_manager"].includes(memberRole || "");
      if (!company || !canSendOffer) return json({ error: "Company hiring access denied" }, 403);
      if (!companyProfileReady(company)) return json({ error: "Complete the company profile before sending an offer" }, 403);
      const { data: application } = await admin.from("guard_hiring_applications").select("id,officer_id,job_application_id,status,application_type,application_data").eq("id", applicationId).maybeSingle();
      if (!application || application.officer_id !== officerId || application.application_type !== "employer_copy" || application.status !== "submitted") return json({ error: "A submitted company application is required" }, 400);
      const { data: jobApplication } = application.job_application_id ? await admin.from("job_applications").select("id,job_posting_id").eq("id", application.job_application_id).maybeSingle() : { data: null };
      const { data: jobPosting } = jobApplication?.job_posting_id ? await admin.from("job_postings").select("id,company_id").eq("id", jobApplication.job_posting_id).maybeSingle() : { data: null };
      if (!jobPosting || jobPosting.company_id !== companyId) return json({ error: "Application does not belong to this company" }, 403);
      const { data: officer } = await admin.from("officer_profiles").select("id,user_id,address_street,address_unit,address_city,address_state,address_zip").eq("id", officerId).maybeSingle();
      const { data: profile } = officer?.user_id ? await admin.from("profiles").select("full_name").eq("id", officer.user_id).maybeSingle() : { data: null };
      if (!officer) return json({ error: "Officer not found" }, 404);

      const { data: existingAttempt } = await admin.from("employment_offers").select("*").eq("id", offerId).maybeSingle();
      if (existingAttempt?.status === "sent") return json({ offer: existingAttempt });
      if (existingAttempt && (existingAttempt.company_id !== companyId || existingAttempt.officer_id !== officerId || existingAttempt.created_by !== authData.user.id)) return json({ error: "Offer retry does not match the original request" }, 409);
      const { data: previous } = await admin.from("employment_offers").select("id,version,status").eq("company_id", companyId).eq("officer_id", officerId).eq("hiring_application_id", applicationId).neq("id", offerId).order("version", { ascending: false }).limit(1).maybeSingle();
      const version = Number(previous?.version || 0) + 1;
      const now = new Date().toISOString();
      const { error: insertError } = existingAttempt ? { error: null } : await admin.from("employment_offers").insert({
        id: offerId, company_id: companyId, officer_id: officerId, hiring_application_id: applicationId,
        job_application_id: jobApplication?.id || null, job_posting_id: jobPosting.id, supersedes_offer_id: previous?.id || null,
        version, status: "draft", terms, employer_signature_name: clean(terms.representativeName),
        employer_signature_title: clean(terms.representativeTitle), employer_signed_at: now, prepared_at: now, created_by: authData.user.id,
      });
      if (insertError) throw insertError;
      const officerAddress = [officer.address_street, officer.address_unit, officer.address_city, officer.address_state, officer.address_zip].filter(Boolean).join(", ");
      const bytes = await buildOfferPdf({ offerId, version, company, officerName: profile?.full_name || "Officer", officerAddress, terms, employerSignature: body.company_signature });
      const hash = await sha256(bytes);
      const path = `${companyId}/${officerId}/${offerId}/offer-v${version}-company-signed.pdf`;
      const { error: uploadError } = await admin.storage.from("employment-offers").upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;
      if (previous && ["sent", "viewed"].includes(previous.status)) await admin.from("employment_offers").update({ status: "revised", updated_at: now }).eq("id", previous.id);
      const { data: offer, error: updateError } = await admin.from("employment_offers").update({ status: "sent", sent_at: now, offer_document_path: path, offer_document_sha256: hash, updated_at: now }).eq("id", offerId).select("*").single();
      if (updateError) throw updateError;
      await admin.from("job_applications").update({ status: "offer_sent" }).eq("id", jobApplication?.id);
      await userClient.rpc("log_sensitive_access", { _action: "offer_sent", _table_name: "employment_offers", _record_id: offerId, _details: { company_id: companyId, officer_id: officerId, version } });
      return json({ offer });
    }

    const offerId = clean(body.offer_id);
    if (!offerId) return json({ error: "Offer is required" }, 400);
    const { data: offer } = await admin.from("employment_offers").select("*,company_profiles(*),officer_profiles(user_id,address_street,address_unit,address_city,address_state,address_zip)").eq("id", offerId).maybeSingle();
    if (!offer) return json({ error: "Offer not found" }, 404);
    const memberRole = await companyMemberRole(offer.company_id);
    const isCompany = offer.company_profiles?.user_id === authData.user.id || Boolean(memberRole);
    const canManageCompanyOffer = offer.company_profiles?.user_id === authData.user.id || ["owner", "admin", "hiring_manager"].includes(memberRole || "");
    const isOfficer = offer.officer_profiles?.user_id === authData.user.id;
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", authData.user.id);
    const isAdmin = (roles || []).some((item: { role: string }) => ["admin", "full_access", "view_only"].includes(item.role));
    if (!isCompany && !isOfficer && !isAdmin) return json({ error: "Offer access denied" }, 403);
    if (isCompany && !isAdmin && !companyProfileReady(offer.company_profiles)) {
      return json({ error: "Complete the company profile before using employment offers" }, 403);
    }
    const deadline = clean(offer.terms?.acceptanceDeadline);
    if (["sent", "viewed"].includes(offer.status) && deadline && deadline < new Date().toISOString().slice(0, 10)) {
      await admin.from("employment_offers").update({ status: "expired", expired_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", offerId);
      if (offer.job_application_id) await admin.from("job_applications").update({ status: "offer_expired" }).eq("id", offer.job_application_id);
      return json({ error: "This offer has expired" }, 409);
    }

    if (action === "preview") {
      if (isOfficer && ["sent", "viewed"].includes(offer.status)) await userClient.rpc("mark_employment_offer_viewed", { _offer_id: offerId });
      const path = offer.accepted_document_path || offer.offer_document_path;
      if (!path) return json({ error: "Offer document is not ready" }, 409);
      const { data: signed, error } = await admin.storage.from("employment-offers").createSignedUrl(path, 300);
      if (error || !signed?.signedUrl) throw error || new Error("Could not open offer");
      await userClient.rpc("log_sensitive_access", { _action: "view", _table_name: "employment_offers", _record_id: offerId, _details: { document: offer.accepted_document_path ? "accepted" : "company_signed" } });
      return json({ url: signed.signedUrl });
    }

    if (action === "withdraw") {
      if (!canManageCompanyOffer || !["sent", "viewed"].includes(offer.status)) return json({ error: "Offer cannot be withdrawn" }, 409);
      await admin.from("employment_offers").update({ status: "withdrawn", withdrawn_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", offerId);
      if (offer.job_application_id) await admin.from("job_applications").update({ status: "reviewed" }).eq("id", offer.job_application_id);
      await userClient.rpc("log_sensitive_access", { _action: "offer_withdrawn", _table_name: "employment_offers", _record_id: offerId, _details: { company_id: offer.company_id, officer_id: offer.officer_id } });
      return json({ status: "withdrawn" });
    }

    if (action === "decline") {
      if (!isOfficer) return json({ error: "Only the receiving officer can decline this offer" }, 403);
      if (offer.status === "declined") return json({ status: "declined" });
      const { error } = await userClient.rpc("decline_employment_offer", { _offer_id: offerId, _reason: clean(body.reason) || null });
      if (error) throw error;
      await userClient.rpc("log_sensitive_access", { _action: "offer_declined", _table_name: "employment_offers", _record_id: offerId, _details: { company_id: offer.company_id, officer_id: offer.officer_id } });
      return json({ status: "declined" });
    }

    if (action === "accept") {
      if (!isOfficer) return json({ error: "Only the receiving officer can accept this offer" }, 403);
      if (offer.status === "accepted") return json({ status: "accepted", hire_id: offer.hire_id });
      if (!clean(body.printed_name) || !dataUrlBytes(body.signature)) return json({ error: "Printed name and signature are required" }, 400);
      if (!offer.viewed_at && offer.status === "sent") return json({ error: "View the offer document before accepting" }, 400);
      const acceptedAt = new Date().toISOString();
      const original = await admin.storage.from("employment-offers").download(offer.offer_document_path);
      if (original.error || !original.data) throw original.error || new Error("Company-signed offer could not be loaded");
      const bytes = await appendEmployeeAcceptance(new Uint8Array(await original.data.arrayBuffer()), { offerId, version: offer.version, officerName: clean(body.printed_name), signedAt: acceptedAt, signature: body.signature });
      const hash = await sha256(bytes);
      const path = `${offer.company_id}/${offer.officer_id}/${offerId}/offer-v${offer.version}-accepted.pdf`;
      const upload = await admin.storage.from("employment-offers").upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (upload.error) throw upload.error;
      const { data: hireId, error } = await admin.rpc("finalize_employment_offer_acceptance", { _offer_id: offerId, _accepted_document_path: path, _accepted_document_sha256: hash, _officer_printed_name: clean(body.printed_name), _acting_user_id: authData.user.id });
      if (error) throw error;
      await userClient.rpc("log_sensitive_access", { _action: "offer_accepted", _table_name: "employment_offers", _record_id: offerId, _details: { hire_id: hireId, sha256: hash } });
      return json({ status: "accepted", hire_id: hireId });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Employment offer operation failed", error);
    return json({ error: error instanceof Error ? error.message : "Employment offer operation failed" }, 500);
  }
});
