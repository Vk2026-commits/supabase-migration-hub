import type { ReactNode } from "react";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileAvatar } from "./ProfileAvatar";

export type OfficerRecordContext = "browse" | "interested" | "applicant" | "hired" | "not-hired";

export interface OfficerRecordSummary {
  id: string;
  name: string;
  title?: string | null;
  officerNumber?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  availability?: string | null;
  stage?: string | null;
  employmentStatus?: string | null;
}

export interface OfficerRecordTab {
  value: string;
  label: string;
  content: ReactNode;
}

interface OfficerRecordShellProps {
  officer: OfficerRecordSummary;
  context: OfficerRecordContext;
  backLabel: string;
  onBack: () => void;
  actions?: ReactNode;
  tabs: OfficerRecordTab[];
  defaultTab?: string;
}

const labelForContext: Record<OfficerRecordContext, string> = {
  browse: "Officer profile",
  interested: "Interested officer",
  applicant: "Applicant record",
  hired: "Employee record",
  "not-hired": "Closed candidate record",
};

export function OfficerRecordShell({
  officer,
  context,
  backLabel,
  onBack,
  actions,
  tabs,
  defaultTab,
}: OfficerRecordShellProps) {
  const initialTab = defaultTab && tabs.some((tab) => tab.value === defaultTab)
    ? defaultTab
    : tabs[0]?.value;

  return (
    <section className="min-w-0 bg-background" aria-label={`${officer.name} officer record`}>
      <div className="border-b bg-muted/20 px-4 py-3 sm:px-5">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 h-8" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLabel}
        </Button>
      </div>

      <header className="border-b bg-background px-4 py-5 text-foreground sm:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <ProfileAvatar
              name={officer.name}
              email={officer.email}
              src={officer.avatarUrl}
              className="h-20 w-20 shrink-0 border-2 border-white/70 shadow-none sm:h-24 sm:w-24"
              fallbackClassName="bg-primary text-xl text-white"
            />
            <div className="min-w-0 pt-1">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{labelForContext[context]}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold sm:text-3xl">{officer.name}</h1>
                {officer.employmentStatus ? <Badge variant="secondary">{officer.employmentStatus}</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {officer.title || "Security Officer"}
                {officer.officerNumber ? ` · Officer #${officer.officerNumber}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {officer.phone ? <a className="inline-flex items-center gap-1.5 hover:text-primary hover:underline" href={`tel:${officer.phone}`}><Phone className="h-4 w-4" />{officer.phone}</a> : null}
                {officer.email ? <a className="inline-flex min-w-0 items-center gap-1.5 hover:text-primary hover:underline" href={`mailto:${officer.email}`}><Mail className="h-4 w-4" /><span className="truncate">{officer.email}</span></a> : null}
                {officer.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{officer.location}</span> : null}
              </div>
            </div>
          </div>
          {actions ? <div className="flex max-w-full flex-wrap gap-2 xl:max-w-[48rem] xl:justify-end [&_button]:shadow-none">{actions}</div> : null}
        </div>
      </header>

      {tabs.length > 0 && initialTab ? (
        <Tabs defaultValue={initialTab} className="min-w-0">
          <div className="sticky top-16 z-20 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur sm:px-6">
            <TabsList className="h-11 w-max min-w-full justify-start rounded-none bg-transparent p-0">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="h-11 rounded-none border-b-2 border-transparent px-4 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="m-0 min-w-0 p-4 focus-visible:outline-none sm:p-6">
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      ) : null}
    </section>
  );
}

interface OperationsIdentityHeaderProps {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  avatarUrl?: string | null;
  status?: string | null;
  onOpenAccount?: () => void;
}

export function OperationsIdentityHeader({ name, email, phone, title, avatarUrl, status, onOpenAccount }: OperationsIdentityHeaderProps) {
  const content = (
    <>
      <ProfileAvatar name={name} email={email} src={avatarUrl} className="h-12 w-12 shrink-0 shadow-none" />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-lg font-bold">{name || email || "Account"}</span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">{title || "Security Officer"}{phone ? ` · ${phone}` : ""}</span>
      </span>
      {status ? <Badge variant="outline" className="shrink-0">{status}</Badge> : null}
    </>
  );

  return onOpenAccount ? (
    <button type="button" onClick={onOpenAccount} className="flex w-full items-center gap-3 border-b bg-background px-4 py-3 transition-colors hover:bg-muted/30 sm:px-5">
      {content}
    </button>
  ) : (
    <div className="flex w-full items-center gap-3 border-b bg-background px-4 py-3 sm:px-5">{content}</div>
  );
}
