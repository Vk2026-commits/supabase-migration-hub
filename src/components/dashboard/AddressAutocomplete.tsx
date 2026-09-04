import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AddressValue = {
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
};

type AddressSuggestion = {
  id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
};

type PhotonFeature = {
  properties?: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    town?: string;
    village?: string;
    district?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countrycode?: string;
  };
};

interface AddressAutocompleteProps {
  value: AddressValue;
  onChange: (nextValue: AddressValue) => void;
  streetLabel?: string;
  unitLabel?: string;
  idPrefix?: string;
}

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma",
  "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee",
  "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
  "District of Columbia",
];

const buildSuggestion = (feature: PhotonFeature, index: number): AddressSuggestion | null => {
  const properties = feature.properties;
  if (!properties) return null;

  const streetName = properties.street || properties.name || "";
  const street = [properties.housenumber, streetName].filter(Boolean).join(" ");
  const city = properties.city || properties.town || properties.village || properties.district || "";
  const state = properties.state || "";
  const zip = properties.postcode || "";
  const label = [street, city, state, zip].filter(Boolean).join(", ");

  if (!label) return null;

  return {
    id: `${properties.osm_type || "place"}-${properties.osm_id || index}-${label}`,
    label,
    street,
    city,
    state,
    zip,
  };
};

const buildCitySuggestion = (feature: PhotonFeature, index: number): AddressSuggestion | null => {
  const properties = feature.properties;
  if (!properties) return null;

  const city = properties.city || properties.town || properties.village || properties.name || properties.district || "";
  const state = properties.state || "";
  const label = [city, state].filter(Boolean).join(", ");

  if (!city || !label) return null;

  return {
    id: `city-${properties.osm_type || "place"}-${properties.osm_id || index}-${label}`,
    label,
    street: "",
    city,
    state,
    zip: "",
  };
};

export const AddressAutocomplete = ({ value, onChange, streetLabel = "Home Address", unitLabel = "Apt/Unit", idPrefix = "address" }: AddressAutocompleteProps) => {
  const [activeField, setActiveField] = useState<"street" | "city" | "state" | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeValue = activeField ? value[activeField] : "";

  useEffect(() => {
    const closeDropdown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setActiveField(null);
    };
    document.addEventListener("mousedown", closeDropdown);
    return () => document.removeEventListener("mousedown", closeDropdown);
  }, []);

  useEffect(() => {
    if (!activeField || activeValue.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    if (activeField === "state") {
      const query = activeValue.trim().toLowerCase();
      setSuggestions(
        US_STATES.filter((state) => state.toLowerCase().startsWith(query)).map((state) => ({
          id: state,
          label: state,
          street: "",
          city: "",
          state,
          zip: "",
        })),
      );
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const context = activeField === "street"
          ? [activeValue, value.city, value.state, "USA"]
          : [activeValue, value.state, "USA"];
        const query = context.filter(Boolean).join(", ");
        const response = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10&lang=en`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Address lookup failed");

        const result = await response.json() as { features?: PhotonFeature[] };
        const suggestionBuilder = activeField === "city" ? buildCitySuggestion : buildSuggestion;
        const nextSuggestions = (result.features || [])
          .filter((feature) => feature.properties?.countrycode?.toLowerCase() === "us")
          .map(suggestionBuilder)
          .filter((suggestion): suggestion is AddressSuggestion => Boolean(suggestion))
          .filter((suggestion, index, all) => all.findIndex((item) => item.label === suggestion.label) === index)
          .slice(0, 6);
        setSuggestions(nextSuggestions);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [activeField, activeValue, value.city, value.state]);

  const updateField = (field: keyof AddressValue, fieldValue: string) => {
    onChange({ ...value, [field]: fieldValue });
  };

  const chooseSuggestion = (suggestion: AddressSuggestion) => {
    if (activeField === "state") {
      updateField("state", suggestion.state);
    } else if (activeField === "city") {
      onChange({
        ...value,
        city: suggestion.city,
        state: suggestion.state || value.state,
      });
    } else {
      onChange({
        ...value,
        street: suggestion.street || value.street,
        city: suggestion.city || value.city,
        state: suggestion.state || value.state,
        zip: suggestion.zip || value.zip,
      });
    }
    setSuggestions([]);
    setActiveField(null);
  };

  const dropdown = activeField && activeValue.trim().length >= 2 && (loading || suggestions.length > 0) ? (
    <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
      {loading && (
        <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {activeField === "city" ? "Finding cities…" : "Finding addresses…"}
        </div>
      )}
      {!loading && suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          className="flex w-full items-start gap-2 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-accent focus:bg-accent focus:outline-none"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => chooseSuggestion(suggestion)}
        >
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{suggestion.label}</span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="contents">
      <div className="relative space-y-2 md:col-span-2">
        <Label htmlFor={`${idPrefix}_street`}>{streetLabel}</Label>
        <Input
          id={`${idPrefix}_street`}
          autoComplete="street-address"
          placeholder="Start typing your street address"
          value={value.street}
          onFocus={() => setActiveField("street")}
          onChange={(event) => {
            setActiveField("street");
            updateField("street", event.target.value);
          }}
        />
        {activeField === "street" && dropdown}
        <p className="text-xs text-muted-foreground">Choose a suggestion to fill in the city, state, and ZIP automatically.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}_unit`}>{unitLabel}</Label>
        <Input
          id={`${idPrefix}_unit`}
          autoComplete="address-line2"
          placeholder="Apt, Unit, etc."
          value={value.unit}
          onChange={(event) => updateField("unit", event.target.value)}
        />
      </div>

      <div className="relative space-y-2">
        <Label htmlFor={`${idPrefix}_city`}>City</Label>
        <Input
          id={`${idPrefix}_city`}
          autoComplete="address-level2"
          placeholder="Start typing a city"
          value={value.city}
          onFocus={() => setActiveField("city")}
          onChange={(event) => {
            setActiveField("city");
            updateField("city", event.target.value);
          }}
        />
        {activeField === "city" && dropdown}
      </div>

      <div className="relative space-y-2">
        <Label htmlFor={`${idPrefix}_state`}>State</Label>
        <Input
          id={`${idPrefix}_state`}
          autoComplete="address-level1"
          placeholder="Start typing a state"
          value={value.state}
          onFocus={() => setActiveField("state")}
          onChange={(event) => {
            setActiveField("state");
            updateField("state", event.target.value);
          }}
        />
        {activeField === "state" && dropdown}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}_zip`}>ZIP Code</Label>
        <Input
          id={`${idPrefix}_zip`}
          autoComplete="postal-code"
          inputMode="numeric"
          placeholder="ZIP Code"
          value={value.zip}
          onChange={(event) => updateField("zip", event.target.value)}
        />
      </div>
    </div>
  );
};
