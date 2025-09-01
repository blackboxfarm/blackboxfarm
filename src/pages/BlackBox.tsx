import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthButton } from "@/components/auth/AuthButton";
import { FarmBanner } from "@/components/FarmBanner";
import { useAuth } from "@/hooks/useAuth";

export default function BlackBox() {
  const [activeTab, setActiveTab] = useState("about");
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Farm Banner Header */}
      <FarmBanner />
      <div className="container mx-auto py-6 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start space-y-4 md:space-y-0">
          <div className="text-center md:text-left flex-1 space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              BlackBox Farm
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto md:mx-0">
              Putting the needle in the Haystack - Bumps for the whole Fam!
            </p>
            <div className="flex justify-center md:hidden space-x-3">
              <AuthButton />
            </div>
          </div>
          <div className="hidden md:flex flex-shrink-0 items-center gap-3">
            <AuthButton />
          </div>
        </div>

        {/* Main Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Welcome to BlackBox Farm</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  BlackBox Farm is your comprehensive solution for cryptocurrency trading automation and volume generation.
                  Our platform provides cutting-edge tools for traders looking to optimize their strategies and increase their market presence.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Key Features</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-primary mb-2">Automated Trading</h4>
                    <p className="text-sm text-muted-foreground">Advanced algorithms for optimal trade execution</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-primary mb-2">Volume Generation</h4>
                    <p className="text-sm text-muted-foreground">Increase market visibility and liquidity</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-primary mb-2">Real-time Analytics</h4>
                    <p className="text-sm text-muted-foreground">Monitor performance with live dashboards</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-primary mb-2">Security First</h4>
                    <p className="text-sm text-muted-foreground">Enterprise-grade encryption and 2FA</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Marketing Section */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-8">
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div>
                <h3 className="text-2xl font-bold text-primary mb-2">Cheaper</h3>
                <p className="text-muted-foreground">We Undercut our competitors with transparent flat-rate pricing</p>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-primary mb-2">Security First</h3>
                <p className="text-muted-foreground">2FA, phone verification, and enterprise-grade encryption</p>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-primary mb-2">Real-Time</h3>
                <p className="text-muted-foreground">Live dashboard, instant execution, 24/7 monitoring</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}