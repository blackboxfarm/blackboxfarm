import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageSquare, Phone, Clock, Send, CheckCircle, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

export default function ContactUs() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    category: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) {
      toast({ title: "Please complete the verification", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    try {
      const { error } = await supabase.functions.invoke('send-contact-email', {
        body: { ...formData, cf_turnstile_token: turnstileToken }
      });

      if (error) throw error;

      setIsSubmitted(true);
      toast({
        title: "Message Sent Successfully!",
        description: "We'll get back to you within 24 hours.",
      });
    } catch (error) {
      console.error('Contact form error:', error);
      toast({
        title: "Error Sending Message",
        description: "Please try again or contact us directly at support@blackbox.farm",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      setTurnstileToken(null);
      turnstileRef.current?.reset();
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const successContent = isSubmitted ? (
    <div className="flex items-center justify-center py-20">
      <Card className="w-full max-w-md text-center">
        <CardContent className="p-8">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
          <p className="text-muted-foreground mb-6">
            Your message has been sent successfully. We'll get back to you within 24 hours.
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={() => setIsSubmitted(false)}>
              Send Another Message
            </Button>
            <Link to="/">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  ) : null;

  return (
    <SiteLayout>
      {successContent || (
      <div className="container mx-auto py-12 space-y-12 px-4">
        {/* Header */}
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center gap-4 mb-8">
            <Link to="/" className="hover:opacity-80 transition-opacity">
              <ArrowLeft className="h-10 w-10 text-primary" strokeWidth={3} />
            </Link>
            <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Contact Us
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Have questions about BlackBox Farm? Need support? Want to explore partnership opportunities? 
            We're here to help and always excited to connect with our community.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Contact Information */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  Get In Touch
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">General Inquiries</p>
                     <p className="text-sm text-muted-foreground">support@blackbox.farm</p>
                   </div>
                 </div>
                 
                 <div className="flex items-center gap-3">
                   <MessageSquare className="h-5 w-5 text-muted-foreground" />
                   <div>
                     <p className="font-medium">Technical Support</p>
                     <p className="text-sm text-muted-foreground">tech@blackbox.farm</p>
                   </div>
                 </div>

                 <div className="flex items-center gap-3">
                   <Phone className="h-5 w-5 text-muted-foreground" />
                   <div>
                     <p className="font-medium">Partnership Inquiries</p>
                     <p className="text-sm text-muted-foreground">partnerships@blackbox.farm</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Response Times
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">General Inquiries</span>
                  <Badge variant="secondary">24 hours</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Technical Support</span>
                  <Badge variant="secondary">12 hours</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Critical Issues</span>
                  <Badge variant="default">2 hours</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Partnership</span>
                  <Badge variant="secondary">48 hours</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20 hidden">
              <CardContent className="p-6">
                <h3 className="font-medium mb-2">Need Immediate Help?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Join our Discord community for real-time support and discussions with other traders.
                </p>
                <Button variant="outline" className="w-full">
                  Join Discord Community
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5 text-primary" />
                  Send us a Message
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        required
                        placeholder="Your full name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        required
                        placeholder="your.email@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="category">Category *</Label>
                      <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select inquiry type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">General Question</SelectItem>
                          <SelectItem value="technical">Technical Support</SelectItem>
                          <SelectItem value="billing">Billing & Pricing</SelectItem>
                          <SelectItem value="advertising">Advertising</SelectItem>
                          <SelectItem value="partnership">Partnership</SelectItem>
                          <SelectItem value="feedback">Feature Request/Feedback</SelectItem>
                          <SelectItem value="security">Security Concern</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="subject">Subject *</Label>
                      <Input
                        id="subject"
                        value={formData.subject}
                        onChange={(e) => handleInputChange('subject', e.target.value)}
                        required
                        placeholder="Brief description of your inquiry"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="message">Message *</Label>
                    <Textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => handleInputChange('message', e.target.value)}
                      required
                      placeholder="Please provide detailed information about your inquiry..."
                      rows={6}
                    />
                  </div>

                  <div className="flex justify-center">
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"}
                      onSuccess={setTurnstileToken}
                      onExpire={() => setTurnstileToken(null)}
                      options={{ theme: "dark" }}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isSubmitting || !turnstileToken}
                  >
                    {isSubmitting ? (
                      <>Sending...</>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>

                {/* Self-Serve Advertising Link */}
                <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <h4 className="font-medium mb-2">Want to advertise?</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Self-serve banner ads starting at $40/day. Get your ad live in minutes!
                  </p>
                  <Link to="/buy-banner">
                    <Button variant="outline" size="sm" className="w-full">
                      Get Banner Space →
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* FAQ Section */}
        <Card>
          <CardHeader>
            <CardTitle>Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">How do I get started?</h3>
                  <p className="text-sm text-muted-foreground">
                    Just head to the Holders Analysis page and paste any Solana token address. Basic analysis is free with no account needed. Sign up free to unlock AI panels and deeper intel.
                  </p>
                </div>
                <div>
                  <h3 className="font-medium mb-2">What does Holders Intel actually do?</h3>
                  <p className="text-sm text-muted-foreground">
                    We analyze token holder distributions, trace developer wallets, detect recycled scammer identities, and map the entire network from token to KYC root — using AI to surface the signals that matter.
                  </p>
                </div>
                <div>
                  <h3 className="font-medium mb-2">How does the Telegram Bot work?</h3>
                  <p className="text-sm text-muted-foreground">
                    Message @holdersintel_bot with a token address or $TICKER to get instant analysis. Free users get /quick lookups. Registered users unlock /holders, /risk, /ai, and more. Your subscription tier carries over automatically.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">What's the difference between the Bot and the Channel?</h3>
                  <p className="text-sm text-muted-foreground">
                    The @holdersintel_bot is your private query bot for looking up specific tokens. The @HoldersIntel channel is a public feed broadcasting the hottest tokens on-chain — free for everyone.
                  </p>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Who handles billing?</h3>
                  <p className="text-sm text-muted-foreground">
                    All subscriptions are processed via Stripe under our parent company, System Reset (systemreset.ca). You can manage your subscription from the Subscriptions page or via the Stripe customer portal.
                  </p>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Do you offer enterprise or API access?</h3>
                  <p className="text-sm text-muted-foreground">
                    Yes — Developer and Enterprise tiers include API access, higher rate limits, and priority support. Contact us for custom integrations or white-label solutions.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      )}
    </SiteLayout>
  );
}