import { heliusRestFetch } from '../_shared/helius-client.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WALLETS = [
  'CpZR7V5cgRA3cvCSg2Uy13YkVYqPqHKrMNmPVYBvyK7D',
  'Dng4Gig7PBeSriFivdtBuf4rsJkF8NspJbPK8RfggDk9',
  '2uLzYEq4ofhAcm3PCpS8548RBt5oHKzvF9H7naZ3feMk',
  '7318iWvbUQvLZdmZvoYHhyRaGtu7yYbP9qQFZBFwqDFb',
  '4oCMYAjVcteGfTRh8RT37QjZ11db34toGQn6dbhTJKfJ',
  '3DWZMm4U7ewYb5ofH3zYWLsQLRuf3Jij1f8mL1TheD5Y',
  'BcJLUUugZbJKdV9mJaaFAFdRwzqpNJqodofXEGr8Dprt',
  'EzBQmwdwgVJoH4nRXVFqGvE6gM5CvjgLVpXm2DrcxSe1',
  'EBXbPuShc2e7X9ReoWpqSvVADqTP2jAGYynjJBuR9JQS',
];

const MINTS = new Set([
  '6oGuFDbEeaSzTcvrmmd2MqfNYwHKXFoN7regcR22pump',
  '6bgMByoiBvNmmZ13YwPoHJSwB5DWTMQZTQRNuR91pump',
  'ByJykJQJVLZXuYViV8BWcj9m9ZwtMmxX1WuGvUpGpump',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  let body: any = {}; try { body = await req.json(); } catch {}
  const targets: string[] = Array.isArray(body.wallets) && body.wallets.length ? body.wallets : WALLETS;
  const out: any[] = [];
  for (const w of targets) {
    let before: string | undefined;
    const buys: any[] = [];
    let pages = 0;
    let err: string | null = null;
    while (pages < 20) {
      pages++;
      const path = `/v0/addresses/${w}/transactions?limit=100${before ? `&before=${before}` : ''}`;
      let txs: any[] = [];
      try {
        const res = await heliusRestFetch(path);
        if (!res.ok) { err = `helius ${res.status}`; break; }
        txs = await res.json();
      } catch (e) { err = String(e); break; }
      if (!Array.isArray(txs) || txs.length === 0) break;
      for (const tx of txs) {
        const transfers = tx.tokenTransfers || [];
        for (const t of transfers) {
          if (MINTS.has(t.mint) && t.toUserAccount === w) {
            let solIn = 0;
            for (const nt of (tx.nativeTransfers || [])) {
              if (nt.fromUserAccount === w) solIn += (nt.amount || 0) / 1e9;
            }
            buys.push({
              ts: tx.timestamp,
              date: new Date(tx.timestamp * 1000).toISOString(),
              mint: t.mint,
              amount: t.tokenAmount,
              sol_spent: solIn,
              sig: tx.signature,
            });
          }
        }
      }
      before = txs[txs.length - 1]?.signature;
      if (txs.length < 100) break;
      await new Promise(r => setTimeout(r, 1300));
    }
    buys.sort((a, b) => a.ts - b.ts);
    out.push({ wallet: w, pages, error: err, buy_count: buys.length, first: buys[0] || null, all: buys });
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
