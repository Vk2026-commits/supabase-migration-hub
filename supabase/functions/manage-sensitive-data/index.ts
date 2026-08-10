import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deployed through the We Find Guards production integration.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Encryption key should be stored as a secret (must be 32 bytes for AES-256)
const ENCRYPTION_KEY = Deno.env.get("SENSITIVE_DATA_ENCRYPTION_KEY") || "";

// AES-256-GCM encryption utilities
async function getEncryptionKey(): Promise<CryptoKey | null> {
  if (!ENCRYPTION_KEY) return null;
  
  // Create a consistent 32-byte key from the secret using SHA-256
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_KEY);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyData);
  
  return await crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(text: string): Promise<string> {
  if (!text || !ENCRYPTION_KEY) return "";
  
  try {
    const key = await getEncryptionKey();
    if (!key) return "";
    
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // Generate a random 12-byte IV (recommended for AES-GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );
    
    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error("Encryption error:", error);
    return "";
  }
}

async function decrypt(encryptedBase64: string): Promise<string> {
  if (!encryptedBase64 || !ENCRYPTION_KEY) return "";
  
  try {
    const key = await getEncryptionKey();
    if (!key) return "";
    
    // Decode base64 to bytes
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    
    // Extract IV (first 12 bytes) and ciphertext (rest)
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption error:", error);
    return "";
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create authenticated client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify JWT token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, data } = await req.json();

    // Get officer_id for the current user
    const { data: officerProfile, error: profileError } = await supabase
      .from("officer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !officerProfile) {
      return new Response(
        JSON.stringify({ error: "Officer profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const officerId = officerProfile.id;

    // Log the access for audit
    await supabase.rpc("log_sensitive_access", {
      _action: action,
      _table_name: "officer_sensitive_data",
      _record_id: officerId,
      _details: { user_id: user.id, timestamp: new Date().toISOString() }
    });

    switch (action) {
      case "save_ssn": {
        const { ssn } = data;
        
        // Validate SSN format (XXX-XX-XXXX)
        const ssnRegex = /^\d{3}-\d{2}-\d{4}$/;
        if (!ssnRegex.test(ssn)) {
          return new Response(
            JSON.stringify({ error: "Invalid SSN format. Use XXX-XX-XXXX" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const ssnLastFour = `***-**-${ssn.slice(-4)}`;
        const ssnEncrypted = await encrypt(ssn);

        if (!ssnEncrypted) {
          console.error("Failed to encrypt SSN - encryption key may not be configured");
          return new Response(
            JSON.stringify({ error: "Encryption service unavailable" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: upsertError } = await supabase
          .from("officer_sensitive_data")
          .upsert({
            officer_id: officerId,
            ssn_encrypted: ssnEncrypted,
            ssn_last_four: ssnLastFour,
            updated_at: new Date().toISOString()
          }, { onConflict: "officer_id" });

        if (upsertError) {
          console.error("Upsert error:", upsertError);
          return new Response(
            JSON.stringify({ error: "Failed to save SSN" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, ssn_last_four: ssnLastFour }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "save_drivers_license": {
        const { license_number, state, expiry_date } = data;
        
        if (!license_number || !state) {
          return new Response(
            JSON.stringify({ error: "License number and state are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const licenseEncrypted = await encrypt(license_number);

        if (!licenseEncrypted) {
          console.error("Failed to encrypt driver's license - encryption key may not be configured");
          return new Response(
            JSON.stringify({ error: "Encryption service unavailable" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: upsertError } = await supabase
          .from("officer_sensitive_data")
          .upsert({
            officer_id: officerId,
            drivers_license_number_encrypted: licenseEncrypted,
            drivers_license_state: state,
            drivers_license_expiry: expiry_date || null,
            updated_at: new Date().toISOString()
          }, { onConflict: "officer_id" });

        if (upsertError) {
          console.error("Upsert error:", upsertError);
          return new Response(
            JSON.stringify({ error: "Failed to save driver's license" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_masked_data": {
        const { data: sensitiveData, error: fetchError } = await supabase
          .from("officer_sensitive_data")
          .select("ssn_last_four, drivers_license_state, drivers_license_expiry, ssn_verified, drivers_license_verified")
          .eq("officer_id", officerId)
          .single();

        if (fetchError && fetchError.code !== "PGRST116") {
          return new Response(
            JSON.stringify({ error: "Failed to fetch data" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ data: sensitiveData || null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
