import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  eligibilityQuestions,
  additionalQuestions,
  type ApplicationQuestionAnswers,
} from "@/lib/applicationQuestions";

export function ApplicationText({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Input
        id={id}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        aria-required={required}
        className="h-12"
      />
    </div>
  );
}
export function ApplicationYesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{label} *</legend>
      <RadioGroup
        aria-label={label}
        aria-required
        value={value || ""}
        onValueChange={onChange}
        className="flex gap-6"
      >
        {["Yes", "No"].map((answer) => (
          <div key={answer} className="flex items-center gap-2">
            <RadioGroupItem id={`${id}-${answer}`} value={answer} />
            <Label htmlFor={`${id}-${answer}`}>{answer}</Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
export function ApplicationQuestionFields({
  kind,
  form,
  update,
}: {
  kind: "eligibility" | "additional";
  form: ApplicationQuestionAnswers;
  update: (key: keyof ApplicationQuestionAnswers, value: string) => void;
}) {
  return (
    <div className="space-y-6">
      {(kind === "eligibility" ? eligibilityQuestions : additionalQuestions).map((q) => (
        <div key={q.key} className="space-y-3 rounded-xl border p-4">
          <ApplicationYesNo
            label={q.label}
            value={form[q.key]}
            onChange={(value) => update(q.key, value)}
          />
          {form[q.key] === "Yes" && (
            <ApplicationText
              label={q.detailLabel}
              value={form[q.detail]}
              required
              onChange={(value) => update(q.detail, value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
export function ApplicationSchoolFields({
  form,
  onChange,
}: {
  form: NonNullable<ApplicationQuestionAnswers["schoolHistory"]>;
  onChange: (rows: NonNullable<ApplicationQuestionAnswers["schoolHistory"]>) => void;
}) {
  return (
    <div className="space-y-4">
      {form.map((school, index) => (
        <div key={school.type} className="space-y-4 rounded-xl border p-4">
          <ApplicationYesNo
            label={`Did you attend ${school.type}?`}
            value={school.attended}
            onChange={(attended) =>
              onChange(form.map((row, i) => (i === index ? { ...row, attended } : row)))
            }
          />
          {school.attended === "Yes" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {(["name", "years", "degree", "subjects"] as const).map((key, i) => (
                <ApplicationText
                  key={key}
                  label={
                    [
                      "School name and address",
                      "Years attended",
                      "Diploma or degree (or None)",
                      "Subjects studied",
                    ][i]
                  }
                  value={school[key]}
                  required
                  onChange={(value) =>
                    onChange(form.map((row, j) => (j === index ? { ...row, [key]: value } : row)))
                  }
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
