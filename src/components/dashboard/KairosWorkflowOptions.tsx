import { KAIROS_TEAM, KAIROS_ACCESS_LABELS } from "@/lib/kairosWorkflow";
export function KairosReportingOptions() {
  return <><datalist id="kairos-reporting-options">{KAIROS_TEAM.map((person) => <option key={person.title} value={`${person.name} — ${person.title}`} />)}</datalist><datalist id="kairos-title-options">{KAIROS_TEAM.map((person) => <option key={person.title} value={person.title} />)}</datalist></>;
}
export function TexasSecurityResources() {
  return <section className="space-y-2 rounded-lg border p-4"><h3 className="font-semibold">Resources and links</h3><div className="flex flex-wrap gap-4 text-sm"><a className="text-primary underline" href="https://tops.portal.texas.gov" target="_blank" rel="noopener noreferrer">Texas Online Private Security (TOPS)</a><a className="text-primary underline" href="https://securesite.dps.texas.gov/" target="_blank" rel="noopener noreferrer">Texas DPS Secure Site</a></div></section>;
}
export function KairosTeamDirectory() {
  return <section className="space-y-3 border-b p-5"><h3 className="font-semibold">Kairos titles and reporting contacts</h3><dl className="grid gap-3 sm:grid-cols-2">{KAIROS_TEAM.map((person) => <div key={person.title}><dt className="text-sm text-muted-foreground">{person.title}</dt><dd className="font-medium">{person.name}</dd><dd className="text-xs text-muted-foreground">Default access: {KAIROS_ACCESS_LABELS[person.access as keyof typeof KAIROS_ACCESS_LABELS].split(" — ")[1]}</dd></div>)}</dl><TexasSecurityResources /></section>;
}
