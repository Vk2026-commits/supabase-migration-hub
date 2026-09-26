import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExpressInterestRequest {
  officerId: string;
  companyId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("Authentication error:", authError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { officerId, companyId }: ExpressInterestRequest = await req.json();

    // Get company profile
    let companyQuery = supabase
      .from("company_profiles")
      .select("id, user_id, company_name, contact_person_name, industry, subscription_tier");
    // Older clients may omit the workspace only when exactly one owned company exists.
    companyQuery = companyId ? companyQuery.eq("id", companyId) : companyQuery.eq("user_id", user.id);
    const { data: companies, error: companyError } = await companyQuery.limit(2);
    if (!companyError && companies && companies.length > 1) {
      return new Response(JSON.stringify({ error: "Choose a company workspace before sending interest" }), {
        status: 409, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const companyProfile = companies?.[0];

    if (companyError || !companyProfile) {
      console.error("Company profile error:", companyError);
      return new Response(JSON.stringify({ error: "Company profile not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (companyProfile.user_id !== user.id) {
      const { data: membership, error: membershipError } = await supabase.from("company_members")
        .select("role,status").eq("company_id", companyProfile.id).eq("user_id", user.id).maybeSingle();
      if (membershipError || membership?.status !== "active" || !["owner", "admin", "hiring_manager"].includes(membership.role)) {
        return new Response(JSON.stringify({ error: "Company hiring access denied" }), {
          status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Check if company has paid tier
    if (companyProfile.subscription_tier === 'free') {
      console.log("Free tier company attempted to send interest email");
      return new Response(JSON.stringify({ error: "This feature requires Professional or Premium subscription" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get officer profile and user email
    const { data: officerProfile, error: officerError } = await supabase
      .from("officer_profiles")
      .select(`
        id,
        user_id,
        profiles!inner(email, full_name)
      `)
      .eq("id", officerId)
      .single();

    if (officerError || !officerProfile) {
      console.error("Officer profile error:", officerError);
      return new Response(JSON.stringify({ error: "Officer profile not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const profile = Array.isArray(officerProfile.profiles) 
      ? officerProfile.profiles[0] 
      : officerProfile.profiles;
    const officerEmail = profile.email;
    const officerName = profile.full_name || "Security Professional";

    // Check if interest already expressed
    const { data: existingInterest } = await supabase
      .from("officer_interests")
      .select("id")
      .eq("officer_id", officerId)
      .eq("company_id", companyProfile.id)
      .maybeSingle();

    if (!existingInterest) {
      // Create interest record
      const { error: interestError } = await supabase
        .from("officer_interests")
        .insert({
          officer_id: officerId,
          company_id: companyProfile.id,
          status: "interested",
        });

      if (interestError) {
        console.error("Error creating interest record:", interestError);
      }
    }

    // Send email
    const emailResponse = await resend.emails.send({
      from: "We Find Guards <noreply@wefindguards.com>",
      to: [officerEmail],
      subject: `${companyProfile.company_name} is Interested in Your Profile`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Great News, ${officerName}!</h2>
          
          <p style="color: #555; line-height: 1.6;">
            We are pleased to inform you that <strong>${companyProfile.company_name}</strong> 
            has reviewed your profile on We Find Guards and is interested in potentially hiring you 
            for a security position.
          </p>
          
          ${companyProfile.industry ? `<p style="color: #555; line-height: 1.6;">
            <strong>Industry:</strong> ${companyProfile.industry}
          </p>` : ''}
          
          ${companyProfile.contact_person_name ? `<p style="color: #555; line-height: 1.6;">
            <strong>Contact Person:</strong> ${companyProfile.contact_person_name}
          </p>` : ''}
          
          <p style="color: #555; line-height: 1.6;">
            You can log in to your We Find Guards dashboard to view more details about this company 
            and communicate directly through our platform.
          </p>
          
          <div style="margin: 30px 0;">
            <a href="https://lovable.app/dashboard" 
               style="background-color: #4F46E5; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              View Dashboard
            </a>
          </div>
          
          <p style="color: #777; font-size: 12px; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
            This is an automated message from We Find Guards. Please do not reply to this email. 
            Log in to your account to communicate with employers.
          </p>
        </div>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ 
      success: true,
      message: "Interest expressed and notification sent" 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in express-interest function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
