import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get evaluations that are due and haven't been sent yet
    const today = new Date().toISOString().split('T')[0];
    const { data: dueEvaluations, error: evalError } = await supabase
      .from("evaluations")
      .select(`
        id,
        evaluation_period,
        due_date,
        hires!inner(
          id,
          hire_date,
          officer_id,
          hired_by_user_id,
          company_profiles!inner(
            company_name,
            profiles!inner(email, full_name)
          ),
          officer_profiles!inner(
            profiles!inner(full_name)
          )
        )
      `)
      .lte("due_date", today)
      .is("sent_date", null)
      .is("completed_date", null);

    if (evalError) {
      console.error("Error fetching evaluations:", evalError);
      throw evalError;
    }

    console.log(`Found ${dueEvaluations?.length || 0} evaluations to send`);

    if (!dueEvaluations || dueEvaluations.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "No evaluations due",
        sent: 0 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    let sentCount = 0;

    for (const evaluation of dueEvaluations) {
      try {
        const hire = Array.isArray(evaluation.hires) ? evaluation.hires[0] : evaluation.hires;
        const companyProfile = Array.isArray(hire.company_profiles) 
          ? hire.company_profiles[0] 
          : hire.company_profiles;
        const companyUserProfile = Array.isArray(companyProfile.profiles)
          ? companyProfile.profiles[0]
          : companyProfile.profiles;
        const officerProfile = Array.isArray(hire.officer_profiles)
          ? hire.officer_profiles[0]
          : hire.officer_profiles;
        const officerUserProfile = Array.isArray(officerProfile.profiles)
          ? officerProfile.profiles[0]
          : officerProfile.profiles;

        const companyEmail = companyUserProfile.email;
        const companyName = companyProfile.company_name;
        const officerName = officerUserProfile.full_name || "Officer";
        
        const periodNames: Record<string, string> = {
          '30_day': '30-Day',
          '90_day': '90-Day',
          '1_year': '1-Year'
        };
        const periodName = periodNames[evaluation.evaluation_period] || evaluation.evaluation_period;

        // Generate evaluation link
        const evaluationLink = `${supabaseUrl?.replace('.supabase.co', '.lovable.app') || 'https://lovable.app'}/dashboard?evaluation=${evaluation.id}`;

        // Send email
        const emailResponse = await resend.emails.send({
          from: "We Find Guards <noreply@wefindguards.com>",
          to: [companyEmail],
          subject: `${periodName} Performance Evaluation Due for ${officerName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Performance Evaluation Request</h2>
              
              <p style="color: #555; line-height: 1.6;">
                Hello ${companyName},
              </p>
              
              <p style="color: #555; line-height: 1.6;">
                It's time for the <strong>${periodName} performance evaluation</strong> for 
                <strong>${officerName}</strong>, who was hired on ${new Date(hire.hire_date).toLocaleDateString()}.
              </p>
              
              <p style="color: #555; line-height: 1.6;">
                Please take a few minutes to complete this evaluation. Your feedback helps us:
              </p>
              
              <ul style="color: #555; line-height: 1.8;">
                <li>Track officer performance and reliability</li>
                <li>Improve our placement services</li>
                <li>Ensure quality security professionals</li>
                <li>Support officer professional development</li>
              </ul>
              
              <div style="margin: 30px 0;">
                <a href="${evaluationLink}" 
                   style="background-color: #4F46E5; color: white; padding: 12px 30px; 
                          text-decoration: none; border-radius: 5px; display: inline-block;">
                  Complete Evaluation
                </a>
              </div>
              
              <p style="color: #777; font-size: 14px;">
                This evaluation should take approximately 5 minutes to complete.
              </p>
              
              <p style="color: #777; font-size: 12px; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
                This is an automated reminder from We Find Guards. If you have already completed this evaluation, 
                please disregard this message.
              </p>
            </div>
          `,
        });

        console.log("Email sent:", emailResponse);

        // Mark evaluation as sent
        const { error: updateError } = await supabase
          .from("evaluations")
          .update({ sent_date: new Date().toISOString() })
          .eq("id", evaluation.id);

        if (updateError) {
          console.error("Error updating evaluation:", updateError);
        } else {
          sentCount++;
        }
      } catch (error) {
        console.error(`Error processing evaluation ${evaluation.id}:`, error);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Sent ${sentCount} evaluation reminders`,
      sent: sentCount 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-evaluation-reminder function:", error);
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
