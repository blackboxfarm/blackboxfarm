import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AdvertiserInquiryRequest {
  name: string;
  email: string;
  company: string;
  website?: string;
  budget: string;
  campaignGoals: string;
  additionalInfo?: string;
}

const budgetLabels: Record<string, string> = {
  "under-1k": "Under $1,000",
  "1k-5k": "$1,000 - $5,000",
  "5k-10k": "$5,000 - $10,000",
  "10k-plus": "$10,000+",
  "tbd": "To Be Determined",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      name,
      email,
      company,
      website,
      budget,
      campaignGoals,
      additionalInfo,
    }: AdvertiserInquiryRequest = await req.json();

    // Validate required fields
    if (!name || !email || !company || !budget || !campaignGoals) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const budgetLabel = budgetLabels[budget] || budget;

    // Send email to BlackBox Farm team
    const teamEmailResponse = await resend.emails.send({
      from: "BlackBox Farm <onboarding@resend.dev>",
      to: ["support@blackbox.farm"],
      subject: `New Advertising Inquiry from ${company}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #8b5cf6; border-bottom: 2px solid #8b5cf6; padding-bottom: 10px;">
            New Advertising Inquiry
          </h1>
          
          <h2 style="color: #333; margin-top: 20px;">Contact Information</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; font-weight: bold; width: 150px;">Name:</td>
              <td style="padding: 8px;">${name}</td>
            </tr>
            <tr style="background-color: #f9f9f9;">
              <td style="padding: 8px; font-weight: bold;">Email:</td>
              <td style="padding: 8px;"><a href="mailto:${email}">${email}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Company:</td>
              <td style="padding: 8px;">${company}</td>
            </tr>
            ${website ? `
            <tr style="background-color: #f9f9f9;">
              <td style="padding: 8px; font-weight: bold;">Website:</td>
              <td style="padding: 8px;"><a href="${website}" target="_blank">${website}</a></td>
            </tr>
            ` : ''}
          </table>

          <h2 style="color: #333; margin-top: 30px;">Campaign Details</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; font-weight: bold; width: 150px;">Budget Range:</td>
              <td style="padding: 8px;">${budgetLabel}</td>
            </tr>
          </table>

          <h3 style="color: #333; margin-top: 20px;">Campaign Goals:</h3>
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; white-space: pre-wrap;">
            ${campaignGoals}
          </div>

          ${additionalInfo ? `
          <h3 style="color: #333; margin-top: 20px;">Additional Information:</h3>
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; white-space: pre-wrap;">
            ${additionalInfo}
          </div>
          ` : ''}

          <div style="margin-top: 30px; padding: 15px; background-color: #e0e7ff; border-radius: 5px;">
            <p style="margin: 0; font-weight: bold; color: #4c1d95;">Action Required:</p>
            <p style="margin: 5px 0 0 0;">Please respond to this inquiry within 24 hours.</p>
          </div>
        </div>
      `,
    });

    console.log("Team notification email sent:", teamEmailResponse);

    // Send confirmation email to advertiser
    const confirmationEmailResponse = await resend.emails.send({
      from: "BlackBox Farm <onboarding@resend.dev>",
      to: [email],
      subject: "We Received Your Advertising Inquiry - BlackBox Farm",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #8b5cf6; border-bottom: 2px solid #8b5cf6; padding-bottom: 10px;">
            Thank You for Your Interest!
          </h1>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333;">
            Hi ${name},
          </p>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333;">
            Thank you for your interest in advertising with <strong>BlackBox Farm</strong>! 
            We've received your inquiry and are excited to discuss how we can help you reach 
            active Solana traders at the moment they're making buy decisions.
          </p>

          <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; border-left: 4px solid #22c55e; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #15803d;">What Happens Next?</h3>
            <ul style="margin: 0; padding-left: 20px; color: #166534;">
              <li style="margin: 8px 0;">Our advertising team will review your requirements</li>
              <li style="margin: 8px 0;">We'll prepare a custom proposal tailored to your goals</li>
              <li style="margin: 8px 0;">You'll receive our response within 24 hours</li>
            </ul>
          </div>

          <h3 style="color: #333; margin-top: 30px;">Your Inquiry Summary:</h3>
          <table style="width: 100%; border-collapse: collapse; background-color: #f9f9f9; border-radius: 5px;">
            <tr>
              <td style="padding: 12px; font-weight: bold; width: 150px;">Company:</td>
              <td style="padding: 12px;">${company}</td>
            </tr>
            <tr style="background-color: #fff;">
              <td style="padding: 12px; font-weight: bold;">Budget Range:</td>
              <td style="padding: 12px;">${budgetLabel}</td>
            </tr>
          </table>

          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-top: 30px;">
            In the meantime, if you have any urgent questions, feel free to reach out to us at 
            <a href="mailto:support@blackbox.farm" style="color: #8b5cf6; text-decoration: none;">support@blackbox.farm</a>.
          </p>

          <p style="font-size: 16px; line-height: 1.6; color: #333;">
            Best regards,<br>
            <strong>The BlackBox Farm Team</strong>
          </p>

          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
            <p style="font-size: 12px; color: #6b7280; margin: 0;">
              BlackBox Farm | Democratizing DeFi Trading<br>
              <a href="https://blackbox.farm" style="color: #8b5cf6; text-decoration: none;">blackbox.farm</a>
            </p>
          </div>
        </div>
      `,
    });

    console.log("Confirmation email sent to advertiser:", confirmationEmailResponse);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Inquiry submitted successfully" 
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error in send-advertiser-inquiry function:", error);
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