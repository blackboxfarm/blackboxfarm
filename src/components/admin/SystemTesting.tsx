import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlayCircle, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const SystemTesting = () => {
  const [isRunningIntegration, setIsRunningIntegration] = useState(false);
  const [isRunningDiscovery, setIsRunningDiscovery] = useState(false);
  const [testTokenMint, setTestTokenMint] = useState("");
  const [integrationResults, setIntegrationResults] = useState<any>(null);
  const [discoveryResults, setDiscoveryResults] = useState<any>(null);

  const runIntegrationTests = async () => {
    setIsRunningIntegration(true);
    setIntegrationResults(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in to run integration tests");
        return;
      }

      const { data, error } = await supabase.functions.invoke("test-developer-intelligence", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      
      if (error) throw error;
      
      setIntegrationResults(data);
      
      if (data.summary.failed === 0) {
        toast.success(`All ${data.summary.passed} tests passed!`);
      } else {
        toast.warning(`${data.summary.passed} passed, ${data.summary.failed} failed`);
      }
    } catch (error) {
      toast.error("Integration tests failed");
      console.error(error);
    } finally {
      setIsRunningIntegration(false);
    }
  };

  const runDiscoveryTest = async () => {
    if (!testTokenMint) {
      toast.error("Please enter a token mint address");
      return;
    }

    setIsRunningDiscovery(true);
    setDiscoveryResults(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in to run discovery tests");
        return;
      }

      const { data, error } = await supabase.functions.invoke("test-discovery-job", {
        body: { tokenMint: testTokenMint },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      
      if (error) throw error;
      
      setDiscoveryResults(data);
      
      if (data.success) {
        toast.success("Discovery test completed successfully!");
      } else {
        toast.error("Discovery test failed");
      }
    } catch (error) {
      toast.error("Discovery test failed");
      console.error(error);
    } finally {
      setIsRunningDiscovery(false);
    }
  };

  const getTestStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Integration Tests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Run comprehensive system tests to verify all components are working correctly
            </p>
            <Button onClick={runIntegrationTests} disabled={isRunningIntegration}>
              {isRunningIntegration ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Run Tests
                </>
              )}
            </Button>
          </div>

          {integrationResults && (
            <div className="space-y-4 mt-4">
              <div className="flex gap-4">
                <Badge variant="outline" className="bg-green-500/20 text-green-500">
                  ✓ {integrationResults.summary.passed} Passed
                </Badge>
                {integrationResults.summary.failed > 0 && (
                  <Badge variant="destructive">
                    ✗ {integrationResults.summary.failed} Failed
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                {integrationResults.tests.map((test: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg">
                    {getTestStatusIcon(test.status)}
                    <div className="flex-1">
                      <div className="font-medium">{test.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {Object.entries(test.details).map(([key, value]) => (
                          <div key={key}>
                            {key}: {typeof value === 'string' ? value : JSON.stringify(value)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discovery Job Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Test Token Mint Address</label>
            <Input
              placeholder="Enter a real token mint address to test..."
              value={testTokenMint}
              onChange={(e) => setTestTokenMint(e.target.value)}
            />
          </div>
          
          <Button onClick={runDiscoveryTest} disabled={isRunningDiscovery || !testTokenMint} className="w-full">
            {isRunningDiscovery ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running Discovery Test...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" />
                Test Discovery Job
              </>
            )}
          </Button>

          {discoveryResults && (
            <div className="space-y-4 mt-4 p-4 border rounded-lg">
              <div className="flex items-center gap-2">
                {discoveryResults.success ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="font-medium">
                  {discoveryResults.success ? "Test Passed" : "Test Failed"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <div className="font-medium">{discoveryResults.status}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Duration</div>
                  <div className="font-medium">{discoveryResults.duration || "N/A"}s</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Wallets Discovered</div>
                  <div className="font-medium">{discoveryResults.walletsDiscovered || 0}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Tokens Discovered</div>
                  <div className="font-medium">{discoveryResults.tokensDiscovered || 0}</div>
                </div>
              </div>

              {discoveryResults.developerProfile && (
                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <div className="font-medium mb-2">Developer Profile Created</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Trust Level: {discoveryResults.developerProfile.trustLevel}</div>
                    <div>Reputation: {discoveryResults.developerProfile.reputationScore}</div>
                    <div>Total Tokens: {discoveryResults.developerProfile.totalTokens}</div>
                    <div>Successful: {discoveryResults.developerProfile.successfulTokens}</div>
                  </div>
                </div>
              )}

              {discoveryResults.errorMessage && (
                <div className="text-sm text-destructive">
                  Error: {discoveryResults.errorMessage}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
