const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function OfferSchedule({ schedule }: { schedule: string }) {
  // Preserve the company's wording; only expand unambiguous day lists/ranges.
  const rows = schedule.split(/\n|;/).map((line) => line.trim()).filter(Boolean);
  const entries = days.flatMap((day, index) => {
    const matching = rows.filter((row) => {
      const lower = row.toLowerCase();
      const range = lower.match(/(mon\w*|tue\w*|wed\w*|thu\w*|fri\w*|sat\w*|sun\w*)\s*(?:-|–|—|through|to)\s*(mon\w*|tue\w*|wed\w*|thu\w*|fri\w*|sat\w*|sun\w*)/);
      if (range) {
        const start = days.findIndex((d) => d.toLowerCase().startsWith(range[1].slice(0, 3)));
        const end = days.findIndex((d) => d.toLowerCase().startsWith(range[2].slice(0, 3)));
        return start <= end ? index >= start && index <= end : index >= start || index <= end;
      }
      return new RegExp(`\\b${day.slice(0, 3)}(?:${day.slice(3)})?\\b`, "i").test(row) || (/weekdays/i.test(row) && index < 5) || (/weekends/i.test(row) && index >= 5) || /daily|every day/i.test(row);
    });
    return matching.length ? [{ day, text: matching.map((row) => row.search(/\d/) >= 0 ? row.slice(row.search(/\d/)) : row).filter(Boolean).join("; ") || matching.join("; ") }] : [];
  });
  return <div className="space-y-3"><h4 className="font-semibold">Weekly schedule</h4>{entries.length ? <ol className="divide-y rounded-lg border">{entries.map(({ day, text }) => <li key={day} className="grid gap-1 p-3 sm:grid-cols-[120px_minmax(0,1fr)]"><span className="font-semibold">{day}</span><span>{text}</span></li>)}</ol> : <p className="whitespace-pre-line">{schedule}</p>}{entries.length > 0 && <p className="whitespace-pre-line text-sm text-muted-foreground">Company schedule: {schedule}</p>}</div>;
}
