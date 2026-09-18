import { createHash } from 'node:crypto';
import type { Store } from './store.ts';

/** Export observations, never the private transcript, pipe path or access token. */
export function evidence(store:Store,threadId:string) {
  const messages=store.messages(threadId);
  const submissions=store.submissions(threadId);
  const ordinals=messages.map(m=>m.ordinal);
  return {
    schemaVersion:1,generatedAt:new Date().toISOString(),stage:'DEV-01',compatibility:'not-certified',
    threadFingerprint:createHash('sha256').update(threadId).digest('hex').slice(0,16),
    messageCount:messages.length,uniqueHostMessageCount:new Set(messages.map(m=>m.id)).size,
    hostOrderMonotonic:ordinals.every((n,i)=>i===0||n>=ordinals[i-1]),
    submissionCounts:Object.fromEntries(['submitting','accepted','confirmed','unknown'].map(k=>[k,submissions.filter(s=>s.status===k).length])),
    checks:store.get('verification-checks',{}),
    note:'Confirmed means a matching host record was observed. Native-window visibility and multi-round acceptance require separate evidence. No automatic compatibility certification.',
  };
}
