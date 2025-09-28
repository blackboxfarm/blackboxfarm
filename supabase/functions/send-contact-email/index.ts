import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ContactFormRequest {
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, subject, category, message }: ContactFormRequest = await req.json();

    // Send notification to support team
    const supportEmail = await resend.emails.send({
      from: "BlackBox Farm <noreply@blackbox.farm>",
      to: ["support@blackbox.farm"],
      subject: `New Contact Form: ${category} - ${subject}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Category:</strong> ${category}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <h3>Message:</h3>
        <p>${message.replace(/\n/g, '<br>')}</p>
        <hr>
        <p><small>Submitted from BlackBox Farm contact form</small></p>
      `,
    });

    // Send confirmation to user
    const userEmail = await resend.emails.send({
      from: "BlackBox Farm <support@blackbox.farm>",
      to: [email],
      subject: "We received your message - BlackBox Farm",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
            Thank you for contacting BlackBox Farm!
          </h1>
          
          <p>Hi ${name},</p>
          
          <p>We've received your message and will get back to you within 24 hours. Here's a summary of your inquiry:</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Category:</strong> ${category}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Your message:</strong></p>
            <p style="font-style: italic;">"${message}"</p>
          </div>
          
          <p>In the meantime, you might find these resources helpful:</p>
          <ul>
            <li><a href="https://blackboxfarm.io/whitepaper">White Paper</a> - Learn about our technology and vision</li>
            <li><a href="https://blackboxfarm.io/">Fee Calculator</a> - Estimate your trading costs</li>
            <li><a href="https://discord.gg/blackboxfarm">Discord Community</a> - Join our community for real-time discussions</li>
          </ul>
          
          <p>Best regards,<br>
          The BlackBox Farm Team</p>
          
          <hr style="margin: 30px 0;">
          <p style="font-size: 12px; color: #666;">
            BlackBox Farm - Democratizing DeFi Trading<br>
            This email was sent in response to your contact form submission.
          </p>
        </div>
      `,
    });

    console.log("Contact emails sent successfully:", { supportEmail, userEmail });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Email sent successfully" 
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
    console.error("Error in send-contact-email function:", error);
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