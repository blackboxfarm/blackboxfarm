import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageSquare, Phone, MapPin, Clock, Send, CheckCircle, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FarmBanner } from "@/components/FarmBanner";
import { AuthButton } from "@/components/auth/AuthButton";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";

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
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase.functions.invoke('send-contact-email', {
        body: formData
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
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
            <p className="text-muted-foreground mb-6">
              Your message has been sent successfully. We'll get back to you within 24 hours.
            </p>
            <Button onClick={() => setIsSubmitted(false)}>
              Send Another Message
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Farm Banner Header */}
      <FarmBanner />
      <div className="container mx-auto py-6 space-y-8">
        {/* Main Header Section */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start space-y-4 md:space-y-0">
          <div className="text-center md:text-left flex-1 space-y-4">
            <div className="flex items-center justify-center md:justify-start gap-3">
              <img 
                src="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" 
                alt="BlackBox Cube Logo" 
                className="w-10 h-10 md:w-12 md:h-12"
              />
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                BlackBox Farm
              </h1>
            </div>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto md:mx-0">
              Putting the needle in the Haystack - Bumps for the whole Fam!
            </p>
            <div className="flex justify-center md:hidden space-x-3">
              <AuthButton />
            </div>
          </div>
          <div className="hidden md:flex flex-shrink-0 items-center gap-3">
            <NotificationCenter />
            <AuthButton />
          </div>
        </div>

      <div className="container mx-auto py-12 space-y-12">
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

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isSubmitting}
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
                  <h3 className="font-medium mb-2">How do I get started with BlackBox Farm?</h3>
                  <p className="text-sm text-muted-foreground">
                    Simply create an account, complete the security verification process, and you can start using our fee calculator immediately. No upfront payments required.
                  </p>
                </div>
                <div>
                  <h3 className="font-medium mb-2">What makes your pricing different?</h3>
                  <p className="text-sm text-muted-foreground">
                    We use smart pricing that automatically chooses between batch processing and per-transaction fees based on your trading volume, typically saving 70-90% compared to competitors.
                  </p>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Is my data secure?</h3>
                  <p className="text-sm text-muted-foreground">
                    Yes, we use enterprise-grade encryption, 2FA, and follow industry best practices. All sensitive data is encrypted and we never store your private keys in plain text.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Do you offer custom solutions?</h3>
                  <p className="text-sm text-muted-foreground">
                    Yes, we provide custom enterprise solutions for high-volume traders and institutions. Contact our partnerships team for details.
                  </p>
                </div>
                <div>
                  <h3 className="font-medium mb-2">What about community campaigns?</h3>
                  <p className="text-sm text-muted-foreground">
                    Community campaigns allow users to pool resources for larger operations while maintaining individual control and transparency. Perfect for coordinated trading strategies.
                  </p>
                </div>
                <div>
                  <h3 className="font-medium mb-2">How can I track my usage and costs?</h3>
                  <p className="text-sm text-muted-foreground">
                    Our analytics dashboard provides real-time monitoring of all your campaigns, costs, and performance metrics with detailed breakdowns and historical data.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}