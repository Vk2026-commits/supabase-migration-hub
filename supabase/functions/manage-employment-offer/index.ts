import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sha256 = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
const clean = (value: unknown) => String(value ?? "").trim();
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
  const blue = rgb(0.04, 0.25, 0.65);
  const brightBlue = rgb(0.08, 0.36, 0.78);
  const dark = rgb(0.06, 0.09, 0.16);
  const gray = rgb(0.36, 0.4, 0.48);
  let page = pdf.addPage([612, 792]);
  let y = 742;
  const margin = 52;
  const width = 508;
  const lineHeight = 14;
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
    page.drawLine({ start: { x: margin, y: 35 }, end: { x: margin + width, y: 35 }, thickness: 0.5, color: rgb(0.8, 0.82, 0.86) });
    page.drawText(`Offer ${input.offerId} - Version ${input.version}`, { x: margin, y: 20, size: 7, font: regular, color: gray });
    page.drawText(`Page ${pdf.getPageCount()}`, { x: 520, y: 20, size: 7, font: regular, color: gray });
  };
  const ensure = (height: number) => {
    if (y - height > 52) return;
    footer();
    page = pdf.addPage([612, 792]);
    y = 742;
  };
  const text = (value: string, options: { font?: typeof regular; size?: number; color?: typeof dark; indent?: number; gap?: number } = {}) => {
    const font = options.font || regular;
    const size = options.size || 9.5;
    const indent = options.indent || 0;
    const lines = wrap(value, font, size, width - indent);
    ensure(lines.length * lineHeight + (options.gap ?? 5));
    lines.forEach((line) => { page.drawText(line, { x: margin + indent, y, size, font, color: options.color || dark }); y -= lineHeight; });
    y -= options.gap ?? 5;
  };
  const section = (title: string) => {
    ensure(30);
    y -= 4;
    page.drawRectangle({ x: margin, y: y - 5, width, height: 22, color: rgb(0.93, 0.96, 1) });
    page.drawText(title, { x: margin + 9, y: y + 2, size: 10, font: bold, color: blue });
    y -= 27;
  };
  const field = (name: string, value: unknown) => {
    text(name.toUpperCase(), { font: bold, size: 7.5, color: gray, gap: 0 });
    text(clean(value) || "None", { size: 10.5, gap: 8 });
  };

  const summaryCard = (x: number, top: number, cardWidth: number, name: string, value: string) => {
    page.drawRectangle({ x, y: top - 58, width: cardWidth, height: 58, color: rgb(0.965, 0.977, 1), borderColor: rgb(0.82, 0.87, 0.96), borderWidth: 0.7 });
    page.drawText(name.toUpperCase(), { x: x + 12, y: top - 18, size: 7.5, font: bold, color: brightBlue });
    const lines = wrap(value, bold, 10.5, cardWidth - 24).slice(0, 2);
    lines.forEach((line, index) => page.drawText(line, { x: x + 12, y: top - 37 - (index * 12), size: 10.5, font: bold, color: dark }));
  };

  const companyAddress = [input.company.company_address, input.company.company_address_unit, input.company.company_city, input.company.company_state, input.company.company_zip].filter(Boolean).join(", ");
  page.drawRectangle({ x: 0, y: 652, width: 612, height: 140, color: blue });
  page.drawText(clean(input.company.company_name).toUpperCase(), { x: margin, y: 752, size: 10, font: bold, color: rgb(0.75, 0.85, 1) });
  page.drawText("Employment Offer", { x: margin, y: 714, size: 26, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`Prepared for ${input.officerName}`, { x: margin, y: 687, size: 12, font: regular, color: rgb(0.9, 0.94, 1) });
  page.drawText(`Offer date: ${new Date().toLocaleDateString("en-US")}  |  Version ${input.version}`, { x: margin, y: 668, size: 8.5, font: regular, color: rgb(0.75, 0.85, 1) });
  y = 622;
  text(`Dear ${input.officerName},`, { font: bold, size: 11, gap: 7 });
  text(`${clean(input.company.company_name)} is pleased to offer you the position described below. This summary highlights the terms that matter most. The complete conditions and company authorization follow.`, { size: 10.5, gap: 14 });

  summaryCard(margin, y, 246, "Position", clean(input.terms.positionTitle));
  summaryCard(314, y, 246, "Hourly pay", `$${Number(input.terms.hourlyRate).toFixed(2)} per hour`);
  y -= 70;
  summaryCard(margin, y, 246, "Start date", formatDate(input.terms.startDate));
  summaryCard(314, y, 246, "Expected hours", `${input.terms.expectedWeeklyHours} hours/week - ${label(clean(input.terms.hoursType))}`);
  y -= 77;

  section("Your role and assignment");
  text(`You are being offered a ${label(clean(input.terms.employmentType)).toLowerCase()} ${clean(input.terms.positionTitle)} position, classified as ${label(clean(input.terms.classification)).toLowerCase()}, reporting to ${clean(input.terms.supervisorName)}.`, { size: 10.5, gap: 9 });
  field("Primary responsibilities", input.terms.duties);
  field("Expected schedule", `${input.terms.expectedSchedule}; approximately ${input.terms.expectedWeeklyHours} hours per week (${label(clean(input.terms.hoursType))})`);
  field("Primary worksite", `${input.terms.worksiteName} - ${[input.terms.worksiteAddress, input.terms.worksiteCity, input.terms.worksiteState, input.terms.worksiteZip].filter(Boolean).join(", ")}`);

  section("Compensation");
  text(`Your base rate will be $${Number(input.terms.hourlyRate).toFixed(2)} per hour. Pay is issued ${label(clean(input.terms.payFrequency)).toLowerCase()}, with the regular payday described as ${clean(input.terms.regularPayday)}.`, { size: 10.5, gap: 9 });
  field("Overtime", input.terms.overtimeTerms);
  field("Additional compensation", `Shift differential: ${clean(input.terms.shiftDifferential)} | Bonus: ${clean(input.terms.bonusCompensation)} | Other: ${clean(input.terms.additionalCompensation)}`);

  section("Benefits and time off");
  field("Benefits eligibility", `${label(clean(input.terms.benefitsEligibility))}${input.terms.benefitsEligibility === "eligible" ? ` - effective ${formatDate(input.terms.benefitsEffectiveDate)}` : ""}`);
  field("Benefits provided", input.terms.benefitsSummary);
  field("Paid time off and holidays", `PTO: ${clean(input.terms.ptoSummary)} | Holidays: ${clean(input.terms.holidaySummary)}`);
  field("Policies that apply", input.terms.policyReferences);

  section("Conditions of this offer");
  const contingencies = [
    input.terms.backgroundCheckRequired && "satisfactory background check",
    input.terms.drugTestRequired && "drug screening",
    input.terms.licenseVerificationRequired && "required license verification",
    input.terms.workAuthorizationRequired && "employment eligibility verification",
  ].filter(Boolean).join(", ");
  text(contingencies ? `Before employment begins, you must successfully complete: ${contingencies}.` : "The company listed no pre-employment contingencies.", { size: 10.5, gap: 8 });
  if (clean(input.terms.otherContingencies).toLowerCase() !== "none") field("Other conditions", input.terms.otherContingencies);
  if (clean(input.terms.specialTerms).toLowerCase() !== "none") field("Special terms", input.terms.specialTerms);
  ensure(72);
  page.drawRectangle({ x: margin, y: y - 60, width, height: 60, color: rgb(1, 0.97, 0.89), borderColor: rgb(0.94, 0.73, 0.24), borderWidth: 0.7 });
  page.drawText("IMPORTANT EMPLOYMENT NOTICE", { x: margin + 12, y: y - 18, size: 8, font: bold, color: rgb(0.58, 0.35, 0.02) });
  const atWillLines = wrap("This is at-will employment with no fixed duration. You or the company may end employment at any time, subject to applicable law.", regular, 9.5, width - 24);
  atWillLines.forEach((line, index) => page.drawText(line, { x: margin + 12, y: y - 36 - (index * 12), size: 9.5, font: regular, color: dark }));
  y -= 72;
  field("Your response is due", formatDate(input.terms.acceptanceDeadline));

  section("Company authorization");
  text(`This offer was prepared and approved on behalf of ${clean(input.company.company_name)} by ${clean(input.terms.representativeName)}, ${clean(input.terms.representativeTitle)}.`, { size: 10.5, gap: 10 });
  field("Company address", companyAddress);
  const employerSignature = dataUrlBytes(input.employerSignature);
  if (employerSignature) {
    const image = await pdf.embedPng(employerSignature);
    const scale = Math.min(230 / image.width, 55 / image.height);
    ensure(72);
    page.drawImage(image, { x: margin, y: y - image.height * scale + 8, width: image.width * scale, height: image.height * scale });
    y -= 64;
  } else text(clean(input.terms.representativeName), { font: italic, size: 18 });

  if (input.officerPrintedName) {
    section("Employee acceptance");
    text("I have reviewed this complete offer, understand the terms shown above, and accept the offer of employment.");
    field("Accepted by", input.officerPrintedName);
    field("Accepted at", formatDate(input.officerSignedAt || new Date().toISOString()));
    const officerSignature = dataUrlBytes(input.officerSignature);
    if (officerSignature) {
      const image = await pdf.embedPng(officerSignature);
      const scale = Math.min(280 / image.width, 70 / image.height);
      ensure(88);
      page.drawImage(image, { x: margin, y: y - image.height * scale + 8, width: image.width * scale, height: image.height * scale });
      y -= 78;
    }
  } else {
    section("Employee response");
    text("Review this offer in We Find Guards. Acceptance requires viewing this document and applying your electronic signature by the deadline shown above.");
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

    if (action === "send") {
      const companyId = clean(body.company_id);
      const officerId = clean(body.officer_id);
      const applicationId = clean(body.hiring_application_id);
      const offerId = clean(body.idempotency_key);
      const terms = body.terms as Record<string, unknown>;
      const missing = validateTerms(terms || {});
      if (!companyId || !officerId || !applicationId || !/^[0-9a-f-]{36}$/i.test(offerId) || missing.length) return json({ error: "Complete every required offer field", missing }, 400);
      if (!dataUrlBytes(body.company_signature)) return json({ error: "Company representative signature is required" }, 400);
      const { data: company } = await admin.from("company_profiles").select("*").eq("id", companyId).eq("user_id", authData.user.id).maybeSingle();
      if (!company) return json({ error: "Company access denied" }, 403);
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
    const isCompany = offer.company_profiles?.user_id === authData.user.id;
    const isOfficer = offer.officer_profiles?.user_id === authData.user.id;
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", authData.user.id);
    const isAdmin = (roles || []).some((item: { role: string }) => ["admin", "full_access", "view_only"].includes(item.role));
    if (!isCompany && !isOfficer && !isAdmin) return json({ error: "Offer access denied" }, 403);
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
      if (!isCompany || !["sent", "viewed"].includes(offer.status)) return json({ error: "Offer cannot be withdrawn" }, 409);
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
