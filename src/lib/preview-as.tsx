import { useEffect, useState } from "react";

export type PreviewAs = {
  userId: string;
  name: string;
  role: "officer" | "company";
};

const KEY = "wfg_preview_as";
const EVENT = "wfg-preview-as-change";

export function getPreviewAs(): PreviewAs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PreviewAs) : null;
  } catch {
    return null;
  }
}

export function setPreviewAs(value: PreviewAs | null) {
  if (typeof window === "undefined") return;
  if (value) {
    window.sessionStorage.setItem(KEY, JSON.stringify(value));
  } else {
    window.sessionStorage.removeItem(KEY);
  }
  window.dispatchEvent(new Event(EVENT));
}

export function usePreviewAs(): PreviewAs | null {
  const [value, setValue] = useState<PreviewAs | null>(() => getPreviewAs());

  useEffect(() => {
    const sync = () => setValue(getPreviewAs());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return value;
}
