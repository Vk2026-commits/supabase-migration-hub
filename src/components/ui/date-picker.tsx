import { CalendarDays } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const firstCalendarMonth = new Date(1950, 0, 1);
const lastCalendarMonth = new Date(new Date().getFullYear() + 30, 11, 31);

export function parseDateValue(value?: string) {
  if (!value) return undefined;
  const date = parseISO(value);
  return isValid(date) ? date : undefined;
}

interface DatePickerProps {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export function DatePicker({
  id,
  label,
  value,
  onChange,
  placeholder = "Choose a date",
  required = false,
  className,
}: DatePickerProps) {
  const selectedDate = parseDateValue(value);

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      {label && <Label htmlFor={id}>{label}{required ? " *" : ""}</Label>}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              "h-12 min-w-0 w-full justify-start overflow-hidden text-left text-base font-normal",
              !selectedDate && "text-muted-foreground",
            )}
          >
            <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">
              {selectedDate ? format(selectedDate, "MMM d, yyyy") : placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-0">
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate || new Date()}
            onSelect={(date) => onChange(date ? format(date, "yyyy-MM-dd") : "")}
            captionLayout="dropdown"
            startMonth={firstCalendarMonth}
            endMonth={lastCalendarMonth}
            className="[--cell-size:2.5rem]"
          />
          {value && (
            <div className="border-t p-2">
              <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => onChange("")}>
                Clear date
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
