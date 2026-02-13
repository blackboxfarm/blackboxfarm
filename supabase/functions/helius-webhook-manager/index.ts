import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireHeliusApiKey, getHeliusRestUrl } from '../_shared/helius-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const heliusApiKey = requireHeliusApiKey();

    const supabase = createClient(supabaseUrl, serviceKey)
    const { action, user_id } = await req.json()

    // Webhook URL for our handler
    const webhookUrl = `${supabaseUrl}/functions/v1/helius-whale-webhook`

    if (action === 'create' || action === 'update') {
      // Get all active whale wallets for this user
      const { data: wallets, error: walletsError } = await supabase
        .from('whale_wallets')
        .select('wallet_address')
        .eq('user_id', user_id)
        .eq('is_active', true)

      if (walletsError) {
        console.error('Error fetching wallets:', walletsError)
        return new Response(JSON.stringify({ error: 'Failed to fetch wallets' }), {
          status: 500,
          headers: corsHeaders
        })
      }

      const addresses = wallets?.map(w => w.wallet_address) || []
      
      if (addresses.length === 0) {
        return new Response(JSON.stringify({ error: 'No active whale wallets to monitor' }), {
          status: 400,
          headers: corsHeaders
        })
      }

      console.log(`Setting up webhook for ${addresses.length} whale wallets`)

      // Check if webhook already exists for this user
      const { data: existingConfig } = await supabase
        .from('whale_frenzy_config')
        .select('helius_webhook_id')
        .eq('user_id', user_id)
        .single()

      let webhookId = existingConfig?.helius_webhook_id

      if (webhookId) {
        // Update existing webhook
        console.log(`Updating existing webhook: ${webhookId}`)
        
        const updateResponse = await fetch(getHeliusRestUrl(`/v0/webhooks/${webhookId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            webhookURL: webhookUrl,
            accountAddresses: addresses,
            transactionTypes: ['SWAP', 'TRANSFER'],
            webhookType: 'enhanced'
          })
        })

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text()
          console.error('Helius update error:', errorText)
          
          // If webhook not found, create a new one
          if (updateResponse.status === 404) {
            webhookId = null
          } else {
            return new Response(JSON.stringify({ error: `Helius API error: ${errorText}` }), {
              status: 500,
              headers: corsHeaders
            })
          }
        } else {
          const result = await updateResponse.json()
          console.log('Webhook updated:', result)
          
          return new Response(JSON.stringify({ 
            success: true, 
            webhookId,
            addressCount: addresses.length,
            message: 'Webhook updated successfully'
          }), { headers: corsHeaders })
        }
      }

      if (!webhookId) {
        // Create new webhook
        console.log('Creating new Helius webhook...')
        
        const createResponse = await fetch(getHeliusRestUrl('/v0/webhooks'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            webhookURL: webhookUrl,
            accountAddresses: addresses,
            transactionTypes: ['SWAP', 'TRANSFER'],
            webhookType: 'enhanced'
          })
        })

        if (!createResponse.ok) {
          const errorText = await createResponse.text()
          console.error('Helius create error:', errorText)
          return new Response(JSON.stringify({ error: `Helius API error: ${errorText}` }), {
            status: 500,
            headers: corsHeaders
          })
        }

        const result = await createResponse.json()
        webhookId = result.webhookID
        console.log('Webhook created:', webhookId)

        // Save webhook ID to config and set monitoring active
        await supabase
          .from('whale_frenzy_config')
          .update({ helius_webhook_id: webhookId, monitoring_active: true })
          .eq('user_id', user_id)

        return new Response(JSON.stringify({ 
          success: true, 
          webhookId,
          addressCount: addresses.length,
          message: 'Webhook created successfully'
        }), { headers: corsHeaders })
      }
    }

    if (action === 'delete') {
      // Get webhook ID
      const { data: config } = await supabase
        .from('whale_frenzy_config')
        .select('helius_webhook_id')
        .eq('user_id', user_id)
        .single()

      if (!config?.helius_webhook_id) {
        return new Response(JSON.stringify({ message: 'No webhook to delete' }), { headers: corsHeaders })
      }

      const deleteResponse = await fetch(
        getHeliusRestUrl(`/v0/webhooks/${config.helius_webhook_id}`),
        { method: 'DELETE' }
      )

      if (!deleteResponse.ok && deleteResponse.status !== 404) {
        const errorText = await deleteResponse.text()
        return new Response(JSON.stringify({ error: `Failed to delete webhook: ${errorText}` }), {
          status: 500,
          headers: corsHeaders
        })
      }

      // Clear webhook ID from config and set monitoring inactive
      await supabase
        .from('whale_frenzy_config')
        .update({ helius_webhook_id: null, monitoring_active: false })
        .eq('user_id', user_id)

      return new Response(JSON.stringify({ success: true, message: 'Webhook deleted' }), { headers: corsHeaders })
    }

    if (action === 'status') {
      // Get webhook status
      const { data: config } = await supabase
        .from('whale_frenzy_config')
        .select('helius_webhook_id')
        .eq('user_id', user_id)
        .single()

      if (!config?.helius_webhook_id) {
        return new Response(JSON.stringify({ 
          active: false, 
          message: 'No webhook configured' 
        }), { headers: corsHeaders })
      }

      // Verify webhook exists on Helius
      const statusResponse = await fetch(
        getHeliusRestUrl(`/v0/webhooks/${config.helius_webhook_id}`)
      )

      if (!statusResponse.ok) {
        return new Response(JSON.stringify({ 
          active: false, 
          webhookId: config.helius_webhook_id,
          message: 'Webhook not found on Helius'
        }), { headers: corsHeaders })
      }

      const webhook = await statusResponse.json()
      
      return new Response(JSON.stringify({ 
        active: true,
        webhookId: config.helius_webhook_id,
        addressCount: webhook.accountAddresses?.length || 0,
        webhookUrl: webhook.webhookURL
      }), { headers: corsHeaders })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: corsHeaders
    })

  } catch (error) {
    console.error('Webhook manager error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    })
  }
})
