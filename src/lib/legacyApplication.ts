const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const yesNo = (v: unknown) =>
  v === true || /^yes$/i.test(text(v)) ? "Yes" : v === false || /^no$/i.test(text(v)) ? "No" : "";
export function mapLegacyApplication(row: any): Record<string, unknown> {
  const d = row.application_data || {};
  const f = d.full_form_data || {};
  const result: Record<string, unknown> = {};
  const fields: Record<string, string> = {
    firstName: "first_name",
    middleName: "middle_name",
    lastName: "last_name",
    email: "email",
    phone: "phone",
    address: "address",
    city: "city",
    state: "state",
    zip: "zip_code",
    position: "job_applied_for",
    employmentType: "employment_type",
    startDate: "start_date",
    appliedBeforeWhen: "applied_before_when",
    employedHereWhen: "employed_here_when",
    convictionDetails: "conviction_details",
    outsideEmploymentDetails: "outside_employment_details",
    driversLicenseNumber: "drivers_license_number",
    licenseClass: "license_class",
    driverLicenseState: "state_licensed_in",
    licenseSuspendedDetails: "license_suspended_details",
    professionalActivities: "professional_activities",
    skills: "skills_training",
    machinesEquipment: "machines_equipment",
    otherNames: "other_names",
    contactSuggestion: "contact_suggestion",
    firedDetails: "fired_details",
  };
  for (const [target, source] of Object.entries(fields)) result[target] = text(d[source]);
  result.applicantName = row.applicant_name;
  for (const [target, source] of Object.entries({
    isAdult: "is_18_or_older",
    eligibleToWork: "eligible_to_work",
    driversLicense: "has_drivers_license",
    appliedBefore: "applied_before",
    employedHereBefore: "employed_here_before",
    convicted: "convicted",
    outsideEmployment: "outside_employment",
    licenseSuspended: "license_suspended",
    otherNamesUsed: "other_names_used",
    presentlyEmployed: "presently_employed",
    everFired: "ever_fired",
  }))
    result[target] = yesNo(d[source]);
  result.licenseLevels = [
    ["level2_license", "Level II"],
    ["level3_license", "Level III"],
    ["level4_license", "Level IV"],
  ]
    .filter(([key]) => yesNo(d[key]) === "Yes")
    .map(([, name]) => name);
  // Unchecked legacy boxes are not an explicit "No license" declaration.
  result.schoolHistory = [
    ["High School/GED", "highSchool"],
    ["College/University", "college"],
    ["Vocational/Technical", "vocational"],
  ].map(([type, k]) => ({
    type,
    attended: text(f[k]) ? "Yes" : "",
    name: text(f[k]),
    years: text(f[k + "Years"]),
    degree: text(f[k + "Diploma"]),
    subjects: text(f[k + "Subjects"]),
  }));
  result.workHistory = [1, 2, 3, 4]
    .map((i) => f["employer" + i])
    .filter((e) => e && text(e.name))
    .map((e) => ({
      employer: text(e.name),
      title: text(e.jobTitle),
      startDate: text(e.datesFrom),
      endDate: text(e.datesTo),
      supervisor: text(e.supervisor),
      phone: text(e.telephone),
      reason: text(e.reasonForLeaving),
      address: text(e.address),
      cityStateZip: text(e.cityStateZip),
      payStart: text(e.payStart),
      payFinal: text(e.payFinal),
    }));
  result.references = [1, 2, 3]
    .map((i) => f["reference" + i])
    .filter((e) => e && text(e.name))
    .map((e) => ({
      name: text(e.name),
      phone: text(e.phone),
      address: text(e.address),
      relationship: "",
      email: "",
    }));
  if ((result.workHistory as any[]).length) result.hasWorkHistory = "Yes";
  if ((result.references as any[]).length) result.hasReferences = "Yes";
  return result;
}
export const legacyEmailValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
export const legacyInviteStatus = (invite: any) =>
  !invite
    ? "Not invited"
    : invite.confirmed_at
      ? "Confirmed"
      : invite.claimed_at
        ? "Reviewing application"
        : invite.revoked_at
          ? "Replaced"
          : ["failed", "bounced", "complained"].includes(invite.email_status)
            ? "Delivery failed"
            : new Date(invite.expires_at).getTime() < Date.now()
              ? "Expired"
              : invite.email_status === "delivered"
                ? "Delivered"
                : invite.email_status === "accepted"
                  ? "Invited — delivery pending"
                  : "Sending";
