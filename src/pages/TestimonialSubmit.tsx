import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function TestimonialSubmit() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { toast } = useToast();

  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    display_name: '',
    twitter_handle: '',
    testimonial_text: '',
  });

  useEffect(() => {
    if (!token) { setIsValid(false); setLoading(false); return; }
    
    supabase
      .from('testimonial_invites')
      .select('id, max_uses, use_count, is_active, expires_at')
      .eq('token', token)
      .single()
      .then(({ data }) => {
        if (!data || !data.is_active) { setIsValid(false); }
        else if (data.max_uses && data.use_count >= data.max_uses) { setIsValid(false); }
        else if (data.expires_at && new Date(data.expires_at) < new Date()) { setIsValid(false); }
        else { setIsValid(true); }
        setLoading(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.testimonial_text.trim() || !form.display_name.trim()) {
      toast({ title: 'Please fill in your name and testimonial', variant: 'destructive' });
      return;
    }
    
    setSubmitting(true);
    const handle = form.twitter_handle.replace(/^@/, '').trim();
    
    const { error } = await supabase.from('testimonials').insert({
      display_name: form.display_name.trim(),
      twitter_handle: handle || null,
      avatar_url: handle ? `https://unavatar.io/twitter/${handle}` : null,
      testimonial_text: form.testimonial_text.trim(),
      invite_token: token,
      is_approved: false,
      is_internal: false,
    });

    if (error) {
      toast({ title: 'Submission failed', description: error.message, variant: 'destructive' });
    } else {
      // Increment use_count
      if (token) {
        await supabase.rpc('increment_invite_use_count' as any, { _token: token }).catch(() => {});
      }
      setSubmitted(true);
      toast({ title: 'Thank you!', description: 'Your testimonial has been submitted for review.' });
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Validating invite...</p>
      </div>
    );
  }

  if (!isValid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <XCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-bold">Invalid or Expired Invite</h2>
            <p className="text-sm text-muted-foreground text-center">
              This invite link is invalid, expired, or has already been used. Please contact the BlackBox team for a new invite.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <h2 className="text-xl font-bold">Thank You!</h2>
            <p className="text-sm text-muted-foreground text-center">
              Your testimonial has been submitted and will appear on the site after review by the BlackBox team.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Share Your Experience
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            We'd love to hear your thoughts about BlackBox Farm. Your testimonial may be featured on our website.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Your Name *</label>
              <Input 
                value={form.display_name}
                onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                placeholder="John Doe"
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">𝕏 Handle (optional)</label>
              <Input 
                value={form.twitter_handle}
                onChange={e => setForm(f => ({ ...f, twitter_handle: e.target.value }))}
                placeholder="@yourhandle"
                maxLength={50}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Your Testimonial *</label>
              <Textarea 
                value={form.testimonial_text}
                onChange={e => setForm(f => ({ ...f, testimonial_text: e.target.value }))}
                placeholder="Tell us about your experience with BlackBox Farm..."
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground mt-1">{form.testimonial_text.length}/500</p>
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Submitting...' : 'Submit Testimonial'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
