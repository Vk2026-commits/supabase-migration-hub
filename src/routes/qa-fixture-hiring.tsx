import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";

// Temporary QA fixture (no data access); removed after verification.
export const Route = createFileRoute("/qa-fixture-hiring")({ ssr: false, component: Fixture });

function Fixture() {
  const [date, setDate] = useState("");
  const [clicks, setClicks] = useState(0);
  return <div className="p-4 pb-32">
    <DatePicker id="qa-date" label="Available start date" value={date} onChange={setDate} />
    <p data-testid="value">{date || "none"}</p>
    <Button type="button" onClick={() => toast.success("Resume uploaded")}>Toast</Button>
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background p-3"><Button type="button" className="w-full" onClick={() => setClicks(c => c + 1)}>Continue {clicks}</Button></div>
  </div>;
}
