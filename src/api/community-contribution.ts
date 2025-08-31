import { supabase } from '@/integrations/supabase/client';

interface ContributionRequest {
  campaignId: string;
  contributionAmount: number;
  contributorPublicKey: string;
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { campaignId, contributionAmount, contributorPublicKey }: ContributionRequest = req.body;

    const { data, error } = await supabase.functions.invoke('community-contribution', {
      body: {
        campaignId,
        contributionAmount,
        contributorPublicKey
      }
    });

    if (error) {
      throw error;
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}