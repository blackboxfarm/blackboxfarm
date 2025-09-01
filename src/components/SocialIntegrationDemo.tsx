import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Share2, MessageCircle, Send, Users } from 'lucide-react';

export function SocialIntegrationDemo() {
  const shareToTwitter = (referralCode: string) => {
    const text = `Just joined the best DeFi trading bot! 🚀 Get 25% off when you use my code: ${referralCode} 💰 #DeFi #TradingBot #Crypto`;
    const url = `${window.location.origin}?ref=${referralCode}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  };

  const shareToDiscord = (referralCode: string) => {
    const text = `🤖 **DeFi Trading Bot Referral** 🤖\n\nJoin the most advanced automated trading platform!\n\n✅ 24/7 autonomous trading\n✅ Community campaigns\n✅ Smart fee optimization\n\n**Get 25% off with code:** \`${referralCode}\`\n\n🔗 ${window.location.origin}?ref=${referralCode}`;
    navigator.clipboard.writeText(text);
    alert('Discord message copied to clipboard!');
  };

  const shareToTelegram = (referralCode: string) => {
    const text = `🚀 Advanced DeFi Trading Bot\n\n💡 Use my referral code: ${referralCode}\n🎁 Get 25% discount on your first campaign\n\n${window.location.origin}?ref=${referralCode}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.origin + '?ref=' + referralCode)}&text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          Social Sharing Integration
        </CardTitle>
        <CardDescription>
          Examples of how social sharing would work with your referral code
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Twitter Integration */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">𝕏</span>
            </div>
            <div>
              <h4 className="font-medium">Twitter/X Integration</h4>
              <p className="text-sm text-muted-foreground">Share with auto-generated tweet</p>
            </div>
          </div>
          
          <div className="bg-gray-50 p-3 rounded-lg border text-sm">
            <p className="mb-2">Preview tweet:</p>
            <div className="italic text-gray-700">
              "Just joined the best DeFi trading bot! 🚀 Get 25% off when you use my code: ABC123 💰 #DeFi #TradingBot #Crypto"
            </div>
          </div>
          
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => shareToTwitter('ABC123')}
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share on Twitter/X
          </Button>
        </div>

        {/* Discord Integration */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <div>
              <h4 className="font-medium">Discord Integration</h4>
              <p className="text-sm text-muted-foreground">Rich formatted message</p>
            </div>
          </div>
          
          <div className="bg-gray-50 p-3 rounded-lg border text-sm font-mono">
            <p className="mb-2">Discord message format:</p>
            <div className="text-gray-700 whitespace-pre-line">
              {`🤖 **DeFi Trading Bot Referral** 🤖

Join the most advanced automated trading platform!

✅ 24/7 autonomous trading
✅ Community campaigns  
✅ Smart fee optimization

**Get 25% off with code:** \`ABC123\``}
            </div>
          </div>
          
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => shareToDiscord('ABC123')}
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Copy Discord Message
          </Button>
        </div>

        {/* Telegram Integration */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-400 rounded-full flex items-center justify-center">
              <Send className="h-4 w-4 text-white" />
            </div>
            <div>
              <h4 className="font-medium">Telegram Integration</h4>
              <p className="text-sm text-muted-foreground">Direct share via Telegram app</p>
            </div>
          </div>
          
          <div className="bg-gray-50 p-3 rounded-lg border text-sm">
            <p className="mb-2">Telegram message:</p>
            <div className="text-gray-700 whitespace-pre-line">
              {`🚀 Advanced DeFi Trading Bot

💡 Use my referral code: ABC123
🎁 Get 25% discount on your first campaign`}
            </div>
          </div>
          
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => shareToTelegram('ABC123')}
          >
            <Send className="h-4 w-4 mr-2" />
            Share on Telegram
          </Button>
        </div>

        {/* Private Leaderboard Preview */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h4 className="font-medium">Private Leaderboard (1 Tier)</h4>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-yellow-50 to-yellow-100 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-3">
                <Badge className="bg-yellow-500">🥇 1st</Badge>
                <div>
                  <div className="font-medium">You</div>
                  <div className="text-sm text-muted-foreground">7 successful referrals</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-green-600">Earned Discount</div>
                <div className="text-sm text-muted-foreground">25% off</div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-50 border rounded-lg">
              <div className="flex items-center gap-3">
                <Badge variant="outline">🥈 2nd</Badge>
                <div>
                  <div className="font-medium">Alex</div>
                  <div className="text-sm text-muted-foreground">5 successful referrals</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-green-600">Earned Discount</div>
                <div className="text-sm text-muted-foreground">25% off</div>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-50 border rounded-lg">
              <div className="flex items-center gap-3">
                <Badge variant="outline">🥉 3rd</Badge>
                <div>
                  <div className="font-medium">Sarah</div>
                  <div className="text-sm text-muted-foreground">3 successful referrals</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-muted-foreground">2 more needed</div>
                <div className="text-sm text-muted-foreground">for discount</div>
              </div>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            🔒 Private leaderboard - only visible to you and your referrals
          </p>
        </div>
      </CardContent>
    </Card>
  );
}