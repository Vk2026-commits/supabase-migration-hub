import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify requester is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Check if user has admin role
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roles) {
      throw new Error("Unauthorized: Admin access required");
    }

    const { user_id, paused } = await req.json();

    if (!user_id || typeof paused !== 'boolean') {
      throw new Error("User ID and paused status are required");
    }

    // Prevent admin from pausing themselves
    if (user_id === user.id) {
      throw new Error("You cannot pause your own account");
    }

    console.log(`${paused ? 'Pausing' : 'Unpausing'} user: ${user_id}`);

    // Update user ban status (paused = banned)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { ban_duration: paused ? "876000h" : "none" } // 100 years or none
    );

    if (updateError) {
      console.error("Error updating user status:", updateError);
      throw updateError;
    }

    console.log(`User ${paused ? 'paused' : 'unpaused'} successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `User ${paused ? 'paused' : 'unpaused'} successfully`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
