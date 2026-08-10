import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Deployed through the We Find Guards production integration.
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cronSecret = Deno.env.get("CRON_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify cron secret for scheduled calls
  const requestCronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization");
  
  // Allow if valid cron secret OR valid admin JWT
  let isAuthorized = false;
  
  if (cronSecret && requestCronSecret === cronSecret) {
    isAuthorized = true;
    console.log("Request authorized via cron secret");
  } else if (authHeader) {
    // Verify if caller is an admin
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (!authError && user) {
      // Check if user has admin role
      const { data: hasAdminRole } = await supabaseAuth.rpc("has_role", {
        _user_id: user.id,
        _role: "admin"
      });
      
      if (hasAdminRole) {
        isAuthorized = true;
        console.log("Request authorized via admin JWT");
      }
    }
  }
  
  if (!isAuthorized) {
    console.error("Unauthorized request - missing or invalid cron secret/admin auth");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    console.log("Starting profile reminder check...");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all officer profiles with user email
    const { data: officers, error: officersError } = await supabase
      .from("officer_profiles")
      .select(`
        id,
        user_id,
        title,
        bio,
        phone,
        address_city,
        address_state,
        avatar_url
      `);

    if (officersError) {
      console.error("Error fetching officers:", officersError);
      throw officersError;
    }

    console.log(`Found ${officers?.length || 0} officer profiles`);

    const incompleteProfiles = [];

    // Check each officer for completeness
    for (const officer of officers || []) {
      // Get user profile info
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", officer.user_id)
        .single();

      if (!userProfile?.email) continue;

      const isProfileComplete = !!(
        officer.title &&
        officer.bio &&
        officer.phone &&
        officer.address_city &&
        officer.address_state
      );

      const hasPhoto = !!officer.avatar_url;

      // Check for certifications
      const { count: certCount } = await supabase
        .from("certifications")
        .select("id", { count: "exact", head: true })
        .eq("officer_id", officer.id);

      // Check for work history
      const { count: workCount } = await supabase
        .from("work_history")
        .select("id", { count: "exact", head: true })
        .eq("officer_id", officer.id);

      const hasCertifications = (certCount || 0) > 0;
      const hasWorkHistory = (workCount || 0) > 0;

      // Profile is incomplete if any of these are missing
      if (!isProfileComplete || !hasPhoto || !hasCertifications || !hasWorkHistory) {
        incompleteProfiles.push({
          email: userProfile.email,
          name: userProfile.full_name || "Officer",
          missingItems: {
            basicInfo: !isProfileComplete,
            photo: !hasPhoto,
            certifications: !hasCertifications,
            workHistory: !hasWorkHistory,
          },
        });
      }
    }

    console.log(`Found ${incompleteProfiles.length} incomplete profiles`);

    // Send emails to incomplete profiles
    const emailResults = [];
    for (const profile of incompleteProfiles) {
      try {
        const missingItems = [];
        if (profile.missingItems.basicInfo) missingItems.push("complete your basic information");
        if (profile.missingItems.photo) missingItems.push("upload a professional headshot");
        if (profile.missingItems.certifications) missingItems.push("add your certifications");
        if (profile.missingItems.workHistory) missingItems.push("add your work history");

        const emailResponse = await resend.emails.send({
          from: "WeFindGuards <noreply@wefindguards.com>",
          to: [profile.email],
          subject: "Complete Your Profile - Increase Your Chances of Getting Hired!",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #333;">Hello ${profile.name},</h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #555;">
                We noticed your profile on <strong>WeFindGuards.com</strong> is not yet complete. 
                A complete profile significantly increases your chances of being hired by potential employers!
              </p>

              <div style="background-color: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h2 style="color: #333; margin-top: 0;">To complete your profile, please:</h2>
                <ul style="font-size: 15px; line-height: 1.8; color: #555;">
                  ${missingItems.map(item => `<li>${item}</li>`).join('')}
                </ul>
              </div>

              <p style="font-size: 16px; line-height: 1.6; color: #555;">
                Employers are actively looking for qualified security professionals. 
                Don't miss out on great opportunities - complete your profile today!
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="https://wefindguards.com/dashboard" 
                   style="background-color: #007bff; color: white; padding: 12px 30px; 
                          text-decoration: none; border-radius: 5px; font-weight: bold; 
                          display: inline-block;">
                  Complete My Profile
                </a>
              </div>

              <p style="font-size: 14px; color: #888; margin-top: 30px;">
                Best regards,<br>
                The WeFindGuards Team
              </p>
            </div>
          `,
        });

        emailResults.push({
          email: profile.email,
          success: true,
          messageId: emailResponse.data?.id,
        });

        console.log(`Email sent to ${profile.email}`);
      } catch (emailError: any) {
        console.error(`Failed to send email to ${profile.email}:`, emailError);
        emailResults.push({
          email: profile.email,
          success: false,
          error: emailError.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        incompleteProfilesCount: incompleteProfiles.length,
        emailsSent: emailResults.filter(r => r.success).length,
        results: emailResults,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-profile-reminder function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
