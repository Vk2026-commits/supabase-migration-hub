import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const env = (name: string) => Deno.env.get(name) || "";
const callback = () => `${env("SUPABASE_URL")}/functions/v1/company-drive`;
const configured = () =>
  Boolean(
    env("GOOGLE_DRIVE_CLIENT_ID") &&
    env("GOOGLE_DRIVE_CLIENT_SECRET") &&
    env("GOOGLE_DRIVE_TOKEN_KEY"),
  );
const bytesTo64 = (v: Uint8Array) => btoa(String.fromCharCode(...v));
const from64 = (v: string) => Uint8Array.from(atob(v), (x) => x.charCodeAt(0));
const hash = async (v: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", v)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
async function tokenCrypt(value: string, encrypt: boolean) {
  const key = await crypto.subtle.importKey(
    "raw",
    from64(env("GOOGLE_DRIVE_TOKEN_KEY")),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  if (encrypt) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)),
    );
    return `${bytesTo64(iv)}.${bytesTo64(cipher)}`;
  }
  const [iv, data] = value.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: from64(iv) }, key, from64(data)),
  );
}
async function googleToken(params: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: env("GOOGLE_DRIVE_CLIENT_ID"),
      client_secret: env("GOOGLE_DRIVE_CLIENT_SECRET"),
    }),
  });
  if (!r.ok)
    throw new Error(
      "Google authorization expired or failed. An administrator must reconnect Google Drive.",
    );
  return await r.json();
}
async function google(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!r.ok)
    throw new Error(
      `Google Drive request failed (${r.status}). Check the connected account and folder access.`,
    );
  return r.status === 204 ? {} : await r.json();
}
const requireResult = (result: any) => {
  if (result.error) throw new Error("Could not save Drive export configuration");
  return result.data;
};
async function role(admin: any, companyId: string, userId: string) {
  const company = requireResult(
    await admin
      .from("company_profiles")
      .select("id,user_id,company_name")
      .eq("id", companyId)
      .maybeSingle(),
  );
  if (!company) return null;
  if (company.user_id === userId) return { role: "owner", company };
  const member = requireResult(
    await admin
      .from("company_members")
      .select("role,status")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle(),
  );
  return member?.status === "active" ? { role: member.role, company } : null;
}
async function ensureFolder(token: string, id: string, name: string, parent?: string) {
  const existing = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,trashed&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (existing.ok) {
    if ((await existing.json()).trashed)
      throw new Error(
        "The export folder is in Trash. Restore it in Google Drive before exporting.",
      );
    return;
  }
  if (existing.status !== 404) throw new Error("Could not check Google Drive folder access");
  const r = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parent ? { parents: [parent] } : {}),
    }),
  });
  if (!r.ok && r.status !== 409)
    throw new Error("Could not create the applicant folder in Google Drive");
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const url = new URL(request.url);
    if (request.method === "GET") {
      if (!configured())
        return new Response("Google Drive has not been configured.", { status: 503 });
      const state = url.searchParams.get("state") || "";
      const stateHash = await hash(new TextEncoder().encode(state));
      // DELETE RETURNING atomically consumes the state, preventing callback replay.
      const stateRow = requireResult(
        await admin
          .from("company_drive_oauth_states")
          .delete()
          .eq("state_hash", stateHash)
          .gt("expires_at", new Date().toISOString())
          .select()
          .maybeSingle(),
      );
      if (!stateRow)
        return new Response(
          "This connection link expired. Return to We Find Guards and connect again.",
          { status: 400 },
        );
      const actor = await role(admin, stateRow.company_id, stateRow.user_id);
      if (!actor || !["owner", "admin"].includes(actor.role))
        return new Response("Administrator access is required.", { status: 403 });
      if (url.searchParams.has("error"))
        return new Response("Google Drive connection was canceled. You can close this tab.");
      const tokens = await googleToken({
        grant_type: "authorization_code",
        code: url.searchParams.get("code") || "",
        redirect_uri: callback(),
      });
      if (!tokens.refresh_token)
        throw new Error(
          "Google did not grant offline access. Please reconnect and allow Drive access.",
        );
      // New connection gets its own root; no cross-account folder IDs are reused.
      const ids = await google(
        tokens.access_token,
        "files/generateIds?count=1&space=drive&type=files",
      );
      await ensureFolder(
        tokens.access_token,
        ids.ids[0],
        `${actor.company.company_name} - We Find Guards applicants`,
      );
      requireResult(
        await admin
          .from("company_drive_connections")
          .upsert({
            company_id: stateRow.company_id,
            refresh_token_cipher: await tokenCrypt(tokens.refresh_token, true),
            root_folder_id: ids.ids[0],
            connected_by: stateRow.user_id,
            updated_at: new Date().toISOString(),
          }),
      );
      requireResult(
        await admin.from("company_drive_folders").delete().eq("company_id", stateRow.company_id),
      );
      requireResult(
        await admin.from("company_drive_exports").delete().eq("company_id", stateRow.company_id),
      );
      return new Response(
        "Google Drive connected. Return to We Find Guards, close the connection dialog, and export your PDF. Existing Google files were not deleted.",
        { headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
    });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ error: "Sign in to export documents" }, 401);
    const multipart = (request.headers.get("Content-Type") || "").includes("multipart/form-data");
    if (Number(request.headers.get("Content-Length") || 0) > 28 * 1024 * 1024)
      return json({ error: "PDF must be smaller than 25 MB" }, 413);
    const form = multipart ? await request.formData() : null;
    const body = form ? Object.fromEntries(form.entries()) : await request.json();
    const action = String(body.action || "");
    let companyId = String(body.company_id || "");
    let app: any = null;
    if (!body.application_id && body.hire_id) {
      const offer = requireResult(
        await admin
          .from("employment_offers")
          .select("job_application_id")
          .eq("hire_id", body.hire_id)
          .maybeSingle(),
      );
      if (!offer?.job_application_id)
        return json({ error: "This hire has no linked application to export" }, 400);
      body.application_id = offer.job_application_id;
    }
    if (body.application_id) {
      app = requireResult(
        await admin
          .from("job_applications")
          .select("id,officer_id,test_run_id,job_posting:job_postings!inner(company_id)")
          .eq("id", body.application_id)
          .maybeSingle(),
      );
      if (!app) return json({ error: "Application not found" }, 404);
      companyId = app.job_posting.company_id;
    }
    const actor = await role(admin, companyId, auth.user.id);
    if (!actor || !["owner", "admin", "hiring_manager"].includes(actor.role))
      return json({ error: "Only authorized hiring staff may export documents" }, 403);
    const connection = requireResult(
      await admin
        .from("company_drive_connections")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle(),
    );
    if (action === "status")
      return json({
        configured: configured(),
        connected: Boolean(connection),
        can_connect: ["owner", "admin"].includes(actor.role),
        folder_url: connection?.root_folder_id
          ? `https://drive.google.com/drive/folders/${connection.root_folder_id}`
          : null,
      });
    if (!configured())
      return json(
        {
          error:
            "Google Drive setup is not complete. Contact your administrator to configure the Google connection.",
        },
        503,
      );
    if (action === "connect") {
      if (!["owner", "admin"].includes(actor.role))
        return json({ error: "Only an administrator can connect the company Drive" }, 403);
      const state = crypto.randomUUID() + crypto.randomUUID();
      requireResult(
        await admin
          .from("company_drive_oauth_states")
          .insert({
            state_hash: await hash(new TextEncoder().encode(state)),
            company_id: companyId,
            user_id: auth.user.id,
            expires_at: new Date(Date.now() + 600000).toISOString(),
          }),
      );
      const query = new URLSearchParams({
        client_id: env("GOOGLE_DRIVE_CLIENT_ID"),
        redirect_uri: callback(),
        response_type: "code",
        scope: "https://www.googleapis.com/auth/drive.file",
        access_type: "offline",
        prompt: "consent",
        state,
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${query}` });
    }
    if (action !== "export" || !app) return json({ error: "Invalid export request" }, 400);
    if (!connection)
      return json({ error: "An administrator must connect the company Google Drive first" }, 409);
    const file = form?.get("file");
    const kind = String(body.document_kind || "");
    if (
      !(file instanceof File) ||
      file.size > 25 * 1024 * 1024 ||
      !["application", "onboarding"].includes(kind)
    )
      return json({ error: "Choose an application or onboarding PDF smaller than 25 MB" }, 400);
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(buffer.slice(0, 5)) !== "%PDF-")
      return json({ error: "A valid PDF is required" }, 400);
    const tokens = await googleToken({
      grant_type: "refresh_token",
      refresh_token: await tokenCrypt(connection.refresh_token_cipher, false),
    });
    const token = tokens.access_token;
    const contentHash = await hash(buffer);
    const officer = requireResult(
      await admin.from("officer_profiles").select("user_id").eq("id", app.officer_id).single(),
    );
    const profile = requireResult(
      await admin.from("profiles").select("full_name").eq("id", officer.user_id).single(),
    );
    let folder = requireResult(
      await admin
        .from("company_drive_folders")
        .select("folder_id")
        .eq("company_id", companyId)
        .eq("job_application_id", app.id)
        .maybeSingle(),
    );
    if (!folder) {
      const ids = await google(token, "files/generateIds?count=1&space=drive&type=files");
      requireResult(
        await admin
          .from("company_drive_folders")
          .upsert(
            { company_id: companyId, job_application_id: app.id, folder_id: ids.ids[0] },
            { onConflict: "company_id,job_application_id", ignoreDuplicates: true },
          ),
      );
      folder = requireResult(
        await admin
          .from("company_drive_folders")
          .select("folder_id")
          .eq("company_id", companyId)
          .eq("job_application_id", app.id)
          .single(),
      );
    }
    const prefix = app.test_run_id ? "SAMPLE - TEST ACCOUNT - " : "";
    await ensureFolder(
      token,
      folder.folder_id,
      `${prefix}${profile.full_name || "Applicant"} - ${app.id.slice(0, 8)}`,
      connection.root_folder_id,
    );
    const filter = {
      company_id: companyId,
      job_application_id: app.id,
      document_kind: kind,
      content_hash: contentHash,
    };
    let exported = requireResult(
      await admin.from("company_drive_exports").select("*").match(filter).maybeSingle(),
    );
    if (!exported) {
      const ids = await google(token, "files/generateIds?count=1&space=drive&type=files");
      requireResult(
        await admin
          .from("company_drive_exports")
          .upsert(
            { ...filter, file_id: ids.ids[0], exported_by: auth.user.id },
            {
              onConflict: "company_id,job_application_id,document_kind,content_hash",
              ignoreDuplicates: true,
            },
          ),
      );
      exported = requireResult(
        await admin.from("company_drive_exports").select("*").match(filter).single(),
      );
    }
    const found = await fetch(
      `https://www.googleapis.com/drive/v3/files/${exported.file_id}?fields=id,trashed&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (found.ok) {
      if ((await found.json()).trashed)
        throw new Error("This exported PDF is in Trash. Restore it in Google Drive.");
    } else {
      if (found.status !== 404) throw new Error("Could not check the existing export");
      const boundary = `wfg_${crypto.randomUUID()}`;
      const metadata = {
        id: exported.file_id,
        name: `${prefix}${kind}-${new Date().toISOString().slice(0, 10)}-${contentHash.slice(0, 8)}.pdf`,
        mimeType: "application/pdf",
        parents: [folder.folder_id],
      };
      const payload = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
        buffer,
        `\r\n--${boundary}--`,
      ]);
      const uploaded = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: payload,
        },
      );
      if (!uploaded.ok && uploaded.status !== 409)
        throw new Error(`Google Drive upload failed (${uploaded.status}). Please retry.`);
    }
    requireResult(
      await admin
        .from("company_drive_exports")
        .update({ completed_at: new Date().toISOString() })
        .match(filter),
    );
    return json({
      file_url: `https://drive.google.com/file/d/${exported.file_id}/view`,
      folder_url: `https://drive.google.com/drive/folders/${folder.folder_id}`,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Drive export failed" }, 400);
  }
});
