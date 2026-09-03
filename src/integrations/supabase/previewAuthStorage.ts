// On a Lovable preview surface, broker the auth session to the editor over
// postMessage so the project's preview surfaces share one login; otherwise use localStorage.
export function brokeredPreviewStorage() {
  if (typeof window === "undefined") return undefined;

  const host = location.hostname;
  const previewZones = [
    "lovableproject.com",
    "lovableproject-dev.com",
    "lovable.app",
    "gpt-eng.com",
    "gptengineer.run",
  ];
  const onPreviewZone = previewZones.some((zone) => host === zone || host.endsWith(`.${zone}`));
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const projectId = onPreviewZone
    ? (host.match(
        new RegExp(`^(?:id-preview(?:-[a-z0-9]+)?|project)--(${uuid})(?:-dev)?(?=\\.|$)`, "i"),
      )?.[1] ?? host.match(new RegExp(`^(${uuid})(?=[.-])`, "i"))?.[1])
    : undefined;
  const framed = window.parent && window.parent !== window;
  if (!projectId || !framed) return localStorage;

  const dev = host.endsWith(".lovableproject-dev.com") || host.endsWith(".gpt-eng.com");
  const editorPattern = dev
    ? /^https:\/\/([a-z0-9-]+\.)*(lovable\.dev|gptengineer\.app)$|^http:\/\/localhost:3000$/
    : /^https:\/\/([a-z0-9-]+\.)*(lovable\.dev|gptengineer\.app)$/;
  const ancestor =
    (location.ancestorOrigins && location.ancestorOrigins[0]) ||
    (document.referrer ? new URL(document.referrer).origin : "");
  const editorOrigins =
    ancestor && editorPattern.test(ancestor)
      ? [ancestor]
      : dev
        ? ["https://lovable.dev", "http://localhost:3000"]
        : ["https://lovable.dev"];
  const resultType = "lovable-preview-auth:result";
  const timeout = 2000;
  const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  const request = (
    type: string,
    key: string,
    value?: string,
  ): Promise<{ ok: boolean; value?: string | null } | null> =>
    new Promise((resolve) => {
      const requestId = newId();
      let done = false;
      const timer: { current?: ReturnType<typeof setTimeout> } = {};
      const finish = (result: { ok: boolean; value?: string | null } | null) => {
        if (done) return;
        done = true;
        if (timer.current) clearTimeout(timer.current);
        window.removeEventListener("message", onMessage);
        resolve(result);
      };
      const onMessage = (event: MessageEvent) => {
        if (!editorOrigins.includes(event.origin)) return;
        const data = event.data;
        if (data && data.type === resultType && data.requestId === requestId) finish(data);
      };

      window.addEventListener("message", onMessage);
      const message: Record<string, unknown> = { type, requestId, projectId, key };
      if (value !== undefined) message.value = value;
      for (const origin of editorOrigins) window.parent.postMessage(message, origin);
      timer.current = setTimeout(() => finish(null), timeout);
    });

  let firstGet = true;
  const retryDelay = 250;

  return {
    getItem: async (key: string) => {
      let result = await request("lovable-preview-auth:get", key);
      if (!result && firstGet) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        result = await request("lovable-preview-auth:get", key);
      }
      firstGet = false;
      if (result?.ok && typeof result.value === "string") {
        if (result.value === "") {
          localStorage.removeItem(key);
          return null;
        }
        return result.value;
      }
      return localStorage.getItem(key);
    },
    setItem: (key: string, value: string) => {
      localStorage.setItem(key, value);
      return request("lovable-preview-auth:set", key, value).then(() => undefined);
    },
    removeItem: (key: string) => {
      localStorage.removeItem(key);
      return request("lovable-preview-auth:remove", key).then(() => undefined);
    },
  };
}
