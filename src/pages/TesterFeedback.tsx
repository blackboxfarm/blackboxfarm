import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";
import { CheckCircle, Star, ClipboardList } from "lucide-react";

function QuestionnaireRenderer({ questionnaire, onComplete }: { questionnaire: any; onComplete: () => void }) {
  const { user } = useAuth();
  const [answers, setAnswers] = useState<Record<string, any>>({});

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tester_questionnaire_responses").insert({
        questionnaire_id: questionnaire.id,
        user_id: user!.id,
        answers,
        completed_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Thank you!", description: "Your responses have been recorded." });
      onComplete();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const questions = questionnaire.questions as any[];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{questionnaire.title}</CardTitle>
        {questionnaire.description && <CardDescription>{questionnaire.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-6">
        {questions.map((q: any, i: number) => (
          <div key={i} className="space-y-2">
            <label className="text-sm font-medium">{q.label}</label>

            {q.type === "text" && (
              <Textarea
                value={answers[i] || ""}
                onChange={e => setAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                placeholder="Your answer..."
              />
            )}

            {q.type === "rating" && (
              <div className="flex gap-2">
                {Array.from({ length: (q.max || 5) - (q.min || 1) + 1 }, (_, j) => j + (q.min || 1)).map(n => (
                  <button
                    key={n}
                    onClick={() => setAnswers(prev => ({ ...prev, [i]: n }))}
                    className={`h-10 w-10 rounded-lg border transition-all flex items-center justify-center ${
                      answers[i] === n ? "bg-primary text-primary-foreground" : "bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

            {q.type === "choice" && (
              <div className="flex flex-wrap gap-2">
                {(q.options || []).map((opt: string) => (
                  <button
                    key={opt}
                    onClick={() => {
                      if (q.multi) {
                        const current = (answers[i] as string[]) || [];
                        setAnswers(prev => ({
                          ...prev,
                          [i]: current.includes(opt) ? current.filter((x: string) => x !== opt) : [...current, opt],
                        }));
                      } else {
                        setAnswers(prev => ({ ...prev, [i]: opt }));
                      }
                    }}
                    className={`text-sm px-3 py-1.5 rounded-md border transition-all ${
                      (q.multi ? (answers[i] || []).includes(opt) : answers[i] === opt)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {q.type === "yesno" && (
              <div className="flex gap-2">
                {["Yes", "No"].map(opt => (
                  <button
                    key={opt}
                    onClick={() => setAnswers(prev => ({ ...prev, [i]: opt }))}
                    className={`text-sm px-4 py-2 rounded-md border transition-all ${
                      answers[i] === opt ? "bg-primary text-primary-foreground" : "bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <Button onClick={() => submit.mutate()} disabled={submit.isPending} className="w-full">
          <CheckCircle className="h-4 w-4 mr-2" />
          {submit.isPending ? "Submitting..." : "Submit Responses"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function TesterFeedback() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: isTester, isLoading: checkingTester } = useQuery({
    queryKey: ["is-tester", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data } = await supabase
        .from("promo_redemptions")
        .select("id, expires_at, promo_codes(code, source_label)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gte("expires_at", new Date().toISOString())
        .limit(1);
      return (data?.length || 0) > 0 ? data![0] : null;
    },
    enabled: !!user?.id,
  });

  const { data: questionnaires } = useQuery({
    queryKey: ["tester-available-questionnaires"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tester_questionnaires")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!isTester,
  });

  const { data: myResponses } = useQuery({
    queryKey: ["my-questionnaire-responses", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tester_questionnaire_responses")
        .select("questionnaire_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return new Set(data?.map(r => r.questionnaire_id));
    },
    enabled: !!user?.id && !!isTester,
  });

  if (checkingTester) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  if (!isTester) return <Navigate to="/" replace />;

  const unanswered = questionnaires?.filter(q => !myResponses?.has(q.id)) || [];
  const completed = questionnaires?.filter(q => myResponses?.has(q.id)) || [];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">🧪 Tester Feedback Center</h1>
        <p className="text-muted-foreground mt-1">
          Thank you for being a tester! Complete questionnaires below to help us improve.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="default">Active Tester</Badge>
          <span className="text-xs text-muted-foreground">
            Expires {new Date((isTester as any).expires_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      {unanswered.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> Pending Questionnaires ({unanswered.length})
          </h2>
          {unanswered.map(q => (
            <QuestionnaireRenderer
              key={q.id}
              questionnaire={q}
              onComplete={() => {
                queryClient.invalidateQueries({ queryKey: ["my-questionnaire-responses"] });
              }}
            />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-400" /> Completed ({completed.length})
          </h2>
          {completed.map(q => (
            <div key={q.id} className="flex items-center gap-2 p-3 rounded-lg border bg-card">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span className="text-sm">{q.title}</span>
            </div>
          ))}
        </div>
      )}

      {!questionnaires?.length && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No questionnaires available yet. Check back soon!</p>
            <p className="text-xs mt-1">You can use the feedback widget (bottom-right) to share quick thoughts anytime.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
