export async function authDeadline<T>(operation: PromiseLike<T>, milliseconds = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Sign-in is taking too long. Please try again. Your application has not been cleared.")), milliseconds);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

// Cancel a slow account read as well as ending its loading state. Otherwise
// each Retry would leave another database request running in the background.
export async function requestWithDeadline<T>(operation: (signal: AbortSignal) => PromiseLike<T>, milliseconds = 12000): Promise<T> {
  const controller = new AbortController();
  try {
    return await authDeadline(operation(controller.signal), milliseconds);
  } finally {
    controller.abort();
  }
}

// Abort stalled auth HTTP requests so they release the session refresh queue.
// Do not apply this deadline to uploads or application submission writes.
export async function authBoundedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const authUrl = new URL(url);
  if (!authUrl.pathname.startsWith("/auth/v1/")) return fetch(input, init);
  // Password verification can exceed 12s during provider congestion. Keep
  // ordinary session reads short, but allow a single login request to finish.
  const timeoutMs = authUrl.pathname.endsWith("/token") && authUrl.searchParams.get("grant_type") === "password" ? 30000 : 12000;
  const controller = new AbortController();
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Sign-in connection timed out. Please try again.")), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
