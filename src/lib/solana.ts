import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

export async function getLatestInboundFunder(connection: Connection, recipient: PublicKey): Promise<PublicKey | null> {
  try {
    const sigs = await connection.getSignaturesForAddress(recipient, { limit: 40 });
    for (const sig of sigs) {
      const tx = await connection.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
      const meta = tx?.meta as any;
      const msgAny: any = tx?.transaction?.message as any;
      if (!meta || !msgAny) continue;
      let keys: any[] = [];
      try {
        if (typeof msgAny.getAccountKeys === "function") {
          keys = msgAny.getAccountKeys().staticAccountKeys as any[];
        } else if (Array.isArray((msgAny as any).accountKeys)) {
          keys = (msgAny as any).accountKeys as any[];
        }
      } catch {}
      if (!keys || !keys.length) continue;
      const idx = keys.findIndex((k: any) => new PublicKey(k).equals(recipient));
      if (idx >= 0 && meta.postBalances && meta.preBalances) {
        const pre = Number(meta.preBalances[idx] ?? 0);
        const post = Number(meta.postBalances[idx] ?? 0);
        if (post > pre) {
          const fromIdx = (meta.preBalances as any[]).findIndex((_: any, i: number) => i !== idx && Number(meta.preBalances[i] ?? 0) > Number(meta.postBalances[i] ?? 0));
          if (fromIdx >= 0) return new PublicKey(keys[fromIdx]);
        }
      }
    }
  } catch {}
  return null;
}

export async function refundToFunder(params: {
  connection: Connection;
  owner: Keypair;
  overrideDestination?: PublicKey | null;
  feeBufferLamports?: number;
}): Promise<string | null> {
  const { connection, owner, overrideDestination, feeBufferLamports = 5000 } = params;
  try {
    const balance = await connection.getBalance(owner.publicKey);
    const minRent = 0; // not closing, only transfer SOL
    const spendable = Math.max(0, balance - minRent - feeBufferLamports);
    if (spendable <= 0) return null;
    let dest = overrideDestination ?? null;
    if (!dest) dest = await getLatestInboundFunder(connection, owner.publicKey);
    if (!dest) return null;
    const ix = SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: dest, lamports: spendable });
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey }).add(ix);
    tx.sign(owner);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
    await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "confirmed");
    return sig;
  } catch {
    return null;
  }
}

export async function splitEvenly(params: {
  connection: Connection;
  owner: Keypair;
  targets: PublicKey[];
  feeBufferLamports?: number;
}): Promise<string | null> {
  const { connection, owner, targets, feeBufferLamports = 10000 } = params;
  if (!targets.length) return null;
  try {
    const balance = await connection.getBalance(owner.publicKey);
    const spendable = Math.max(0, balance - feeBufferLamports);
    if (spendable <= 0) return null;
    const per = Math.floor(spendable / targets.length);
    if (per <= 0) return null;
    const ixs = targets.map((t) => SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: t, lamports: per }));
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey });
    tx.add(...ixs);
    tx.sign(owner);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
    await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig }, "confirmed");
    return sig;
  } catch {
    return null;
  }
}
