import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  TrendingUp, 
  Award, 
  Target, 
  DollarSign, 
  UserCheck,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface ReferralAnalytics {
  totalUsers: number;
  totalReferrals: number;
  successfulReferrals: number;
  conversionRate: number;
  discountsEarned: number;
  discountsUsed: number;
  topReferrers: Array<{
    user_id: string;
    referrals_count: number;
    successful_referrals: number;
    conversion_rate: number;
    discount_earned: boolean;
    discount_used: boolean;
  }>;
  monthlyStats: Array<{
    month: string;
    signups: number;
    conversions: number;
    rate: number;
  }>;
  recentActivity: Array<{
    id: string;
    type: 'signup' | 'conversion' | 'discount_earned' | 'discount_used';
    timestamp: string;
    details: any;
  }>;
}

export function SuperAdminReferralsView() {
  const [analytics, setAnalytics] = useState<ReferralAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('30d');
  const { toast } = useToast();

  useEffect(() => {
    loadReferralAnalytics();
  }, [timeframe]);

  const loadReferralAnalytics = async () => {
    try {
      setIsLoading(true);

      // Load referral programs overview
      const { data: programs } = await supabase
        .from('referral_programs')
        .select('*')
        .order('created_at', { ascending: false });

      // Load referrals data
      const { data: referrals } = await supabase
        .from('referrals')
        .select('*')
        .order('created_at', { ascending: false });

      // Calculate analytics
      const totalUsers = programs?.length || 0;
      const totalReferrals = referrals?.length || 0;
      const successfulReferrals = referrals?.filter(r => r.campaign_created).length || 0;
      const conversionRate = totalReferrals > 0 ? (successfulReferrals / totalReferrals) * 100 : 0;
      
      const discountsEarned = programs?.filter(p => p.discount_earned).length || 0;
      const discountsUsed = programs?.filter(p => p.discount_used).length || 0;

      // Top referrers
      const topReferrers = programs
        ?.filter(p => p.referrals_count > 0)
        .map(program => ({
          user_id: program.user_id,
          referrals_count: program.referrals_count,
          successful_referrals: program.successful_referrals,
          conversion_rate: program.referrals_count > 0 ? (program.successful_referrals / program.referrals_count) * 100 : 0,
          discount_earned: program.discount_earned,
          discount_used: program.discount_used
        }))
        .sort((a, b) => b.successful_referrals - a.successful_referrals)
        .slice(0, 10) || [];

      // Monthly stats (simplified)
      const monthlyStats = [
        { month: 'Current', signups: totalReferrals, conversions: successfulReferrals, rate: conversionRate }
      ];

      // Recent activity (simplified)
      const recentActivity = referrals
        ?.slice(0, 10)
        .map(referral => ({
          id: referral.id,
          type: (referral.campaign_created ? 'conversion' : 'signup') as 'conversion' | 'signup',
          timestamp: referral.created_at,
          details: {
            referral_code: referral.referral_code,
            campaign_created: referral.campaign_created
          }
        })) || [];

      setAnalytics({
        totalUsers,
        totalReferrals,
        successfulReferrals,
        conversionRate,
        discountsEarned,
        discountsUsed,
        topReferrers,
        monthlyStats,
        recentActivity
      });

    } catch (error) {
      console.error('Error loading referral analytics:', error);
      toast({
        title: "Error",
        description: "Failed to load referral analytics",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-muted animate-pulse rounded" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">No referral data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Referral Program Analytics</h1>
          <p className="text-muted-foreground">
            System-wide referral performance and user management
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant={timeframe === '7d' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setTimeframe('7d')}
          >
            7 Days
          </Button>
          <Button 
            variant={timeframe === '30d' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setTimeframe('30d')}
          >
            30 Days
          </Button>
          <Button 
            variant={timeframe === '90d' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setTimeframe('90d')}
          >
            90 Days
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">{analytics.totalUsers}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Referrals</p>
                <p className="text-2xl font-bold">{analytics.totalReferrals}</p>
              </div>
              <UserCheck className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conversions</p>
                <p className="text-2xl font-bold">{analytics.successfulReferrals}</p>
              </div>
              <Target className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conversion Rate</p>
                <p className="text-2xl font-bold">{analytics.conversionRate.toFixed(1)}%</p>
              </div>
              <TrendingUp className={`h-8 w-8 ${analytics.conversionRate > 20 ? 'text-green-600' : analytics.conversionRate > 10 ? 'text-yellow-600' : 'text-red-600'}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Discounts Earned</p>
                <p className="text-2xl font-bold">{analytics.discountsEarned}</p>
              </div>
              <Award className="h-8 w-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Discounts Used</p>
                <p className="text-2xl font-bold">{analytics.discountsUsed}</p>
              </div>
              <DollarSign className="h-8 w-8 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="leaderboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="leaderboard">Top Referrers</TabsTrigger>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Top Performing Referrers
              </CardTitle>
              <CardDescription>Users generating the most successful referrals</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.topReferrers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No referral activity yet
                  </p>
                ) : (
                  analytics.topReferrers.map((referrer, index) => (
                    <div key={referrer.user_id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <Badge variant={index < 3 ? 'default' : 'outline'}>
                          #{index + 1}
                        </Badge>
                        <div>
                          <div className="font-medium">
                            User {referrer.user_id.slice(0, 8)}...
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {referrer.successful_referrals} conversions from {referrer.referrals_count} referrals
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {referrer.conversion_rate.toFixed(1)}%
                          </span>
                          {referrer.conversion_rate > 50 ? (
                            <ArrowUpRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {referrer.discount_earned && (
                            <Badge variant="secondary" className="text-xs">
                              {referrer.discount_used ? 'Used Discount' : 'Earned Discount'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Recent Referral Activity
              </CardTitle>
              <CardDescription>Latest referral signups and conversions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics.recentActivity.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No recent activity
                  </p>
                ) : (
                  analytics.recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          activity.type === 'conversion' ? 'bg-green-500' :
                          activity.type === 'signup' ? 'bg-blue-500' :
                          activity.type === 'discount_earned' ? 'bg-purple-500' :
                          'bg-orange-500'
                        }`} />
                        <div>
                          <p className="text-sm font-medium">
                            {activity.type === 'conversion' ? 'Campaign Created' :
                             activity.type === 'signup' ? 'New Referral Signup' :
                             activity.type === 'discount_earned' ? 'Discount Earned' :
                             'Discount Used'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Code: {activity.details.referral_code} • {new Date(activity.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Badge variant={
                        activity.type === 'conversion' ? 'default' :
                        activity.type === 'signup' ? 'secondary' :
                        'outline'
                      }>
                        {activity.type}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Program Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Conversion Rate</span>
                    <span>{analytics.conversionRate.toFixed(1)}%</span>
                  </div>
                  <Progress value={analytics.conversionRate} />
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Discount Utilization</span>
                    <span>{analytics.discountsEarned > 0 ? ((analytics.discountsUsed / analytics.discountsEarned) * 100).toFixed(1) : 0}%</span>
                  </div>
                  <Progress value={analytics.discountsEarned > 0 ? (analytics.discountsUsed / analytics.discountsEarned) * 100 : 0} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {analytics.conversionRate < 20 && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="font-medium text-yellow-800">Low Conversion Rate</p>
                      <p className="text-yellow-700">Consider improving onboarding or referral incentives</p>
                    </div>
                  )}
                  
                  {analytics.discountsEarned > analytics.discountsUsed && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="font-medium text-blue-800">Unused Discounts</p>
                      <p className="text-blue-700">Send reminders to users with earned discounts</p>
                    </div>
                  )}
                  
                  {analytics.totalReferrals < 50 && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="font-medium text-green-800">Growth Opportunity</p>
                      <p className="text-green-700">Promote referral program more actively to increase participation</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}