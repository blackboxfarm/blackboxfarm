import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Gift, X } from 'lucide-react';

export const SurveyPopup = () => {
  const [survey, setSurvey] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [startTime] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const checkForSurvey = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-active-survey');
        
        if (!error && data?.survey) {
          setSurvey(data.survey);
          setOpen(true);
        }
      } catch (error) {
        console.error('Error fetching survey:', error);
      }
    };

    // Check after a delay to not interrupt initial page load
    const timer = setTimeout(checkForSurvey, 3000);
    return () => clearTimeout(timer);
  }, [user]);

  const handleSubmit = async () => {
    if (!survey || !user) return;

    // Validate all questions answered
    const questions = survey.questions as any[];
    const allAnswered = questions.every((q: any) => responses[q.id]);

    if (!allAnswered) {
      toast.error('Please answer all questions');
      return;
    }

    setSubmitting(true);
    try {
      const completionTime = Math.floor((Date.now() - startTime) / 1000);

      const { error } = await supabase.from('survey_responses').insert({
        survey_id: survey.id,
        user_id: user.id,
        responses: responses,
        completion_time_seconds: completionTime,
      });

      if (error) throw error;

      toast.success(`🎉 Thank you! You're entered to win: ${survey.prize_description}`);
      setOpen(false);
    } catch (error: any) {
      console.error('Error submitting survey:', error);
      toast.error('Failed to submit survey');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (!user) return;

    // Update last shown timestamp to prevent showing again soon
    await supabase.from('user_preferences').upsert({
      user_id: user.id,
      last_survey_shown_at: new Date().toISOString(),
    });

    setOpen(false);
  };

  if (!survey) return null;

  const questions = (survey.questions || []) as any[];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleSkip();
    }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Gift className="w-5 h-5 text-primary animate-pulse" />
                {survey.title}
              </DialogTitle>
              <DialogDescription className="mt-2">
                {survey.description}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {survey.prize_description && (
            <div className="mt-3 p-3 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-lg border border-primary/30">
              <div className="text-sm font-semibold text-primary mb-1">🎁 Prize</div>
              <div className="text-sm">{survey.prize_description}</div>
              {survey.prize_value && (
                <div className="text-xs text-muted-foreground mt-1">
                  Value: ${survey.prize_value}
                </div>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {questions.map((question: any, idx: number) => (
            <div key={question.id} className="space-y-2">
              <Label className="text-sm font-semibold">
                {idx + 1}. {question.text}
                {question.required && <span className="text-destructive ml-1">*</span>}
              </Label>

              {question.type === 'text' && (
                <Input
                  value={responses[question.id] || ''}
                  onChange={(e) => setResponses({ ...responses, [question.id]: e.target.value })}
                  placeholder="Your answer..."
                />
              )}

              {question.type === 'textarea' && (
                <Textarea
                  value={responses[question.id] || ''}
                  onChange={(e) => setResponses({ ...responses, [question.id]: e.target.value })}
                  placeholder="Your detailed answer..."
                  rows={3}
                />
              )}

              {question.type === 'multiple_choice' && (
                <RadioGroup
                  value={responses[question.id]}
                  onValueChange={(value) => setResponses({ ...responses, [question.id]: value })}
                >
                  {(question.options || []).map((option: string) => (
                    <div key={option} className="flex items-center space-x-2">
                      <RadioGroupItem value={option} id={`${question.id}-${option}`} />
                      <Label htmlFor={`${question.id}-${option}`} className="font-normal cursor-pointer">
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}

              {question.type === 'rating' && (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <Button
                      key={rating}
                      variant={responses[question.id] === rating ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setResponses({ ...responses, [question.id]: rating })}
                      className="w-12"
                    >
                      {rating}⭐
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-6">
          <Button onClick={handleSubmit} disabled={submitting} className="flex-1 tech-button">
            {submitting ? 'Submitting...' : 'Submit & Enter Prize Draw'}
          </Button>
          <Button onClick={handleSkip} variant="outline">
            Maybe Later
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-2">
          Takes ~2 minutes • Responses are confidential
        </p>
      </DialogContent>
    </Dialog>
  );
};
