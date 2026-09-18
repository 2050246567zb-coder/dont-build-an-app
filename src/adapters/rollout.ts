import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';

export type HostMessage = { id: string; role: 'user' | 'assistant'; text: string; timestamp: string; phase: string; ordinal: number; kind: 'native' | 'delegated'; sourceThreadId?: string; submissionId?:string };

export async function findRollout(home: string, threadId: string): Promise<string> {
  if (!/^[a-f0-9-]{36}$/i.test(threadId)) throw new Error('Invalid bound thread ID');
  const visit = async (dir: string, depth: number): Promise<string | undefined> => {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return undefined; }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(`-${threadId}.jsonl`)) return join(dir, entry.name);
      if (entry.isDirectory() && depth > 0) { const found = await visit(join(dir, entry.name), depth - 1); if (found) return found; }
    }
  };
  const path = await visit(join(home, 'sessions'), 3);
  if (!path) throw new Error('Current conversation log was not found; history is not fabricated');
  const input = createReadStream(path);
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    let verified = false;
    for await (const first of lines) {
      const meta = JSON.parse(first);
      if (meta.type !== 'session_meta' || meta.payload.id !== threadId) throw new Error('Conversation identity mismatch');
      verified = true;
      break;
    }
    if (!verified) throw new Error('Empty conversation log');
  } finally { lines.close(); input.destroy(); }
  return path;
}

export function parseMessage(line: string): HostMessage | undefined {
  // Skip tools/reasoning before parsing potentially very large media tool outputs.
  const prefix = line.slice(0, 300);
  if (!/"type"\s*:\s*"response_item"/.test(prefix)) return;
  if (!/"role"\s*:\s*"(?:assistant|user)"/.test(prefix) && !prefix.includes('function_call_output')) return;
  let event: any;
  try { event = JSON.parse(line); } catch { return; }
  const p = event.payload;
  // This precise host format is rendered as a userMessage by Codex Desktop.
  // Do not accept arbitrary tool output, or another agent's forwarded message.
  if (p?.type === 'function_call_output' && p.namespace === 'codex_app' && p.name === 'send_message_to_thread' && typeof p.output === 'string') {
    const match = /^<codex_delegation>\s*<source_thread_id>([a-f0-9-]{36})<\/source_thread_id>\s*<input>([\s\S]*?)<\/input>\s*<\/codex_delegation>$/.exec(p.output.trim());
    if (!match || typeof p.id !== 'string') return;
    const text = match[2].replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
    return { id:p.id,role:'user',text,timestamp:event.timestamp,phase:'user',ordinal:event.ordinal ?? 0,kind:'delegated',sourceThreadId:match[1] };
  }
  if (p?.type !== 'message') return;
  if (p.role === 'assistant' && !['final', 'final_answer'].includes(p.phase)) return;
  if (p.role === 'user' && (typeof p.id !== 'string' || !p.id.startsWith('msg_'))) return;
  // Environment/AGENTS metadata can also have msg_ IDs. Respect the host's item kinds.
  const kinds = p.internal_chat_message_metadata_passthrough?.content_item_kinds;
  const content = (p.content ?? []).filter((c: any, index: number) =>
    ['input_text', 'output_text'].includes(c.type) && (p.role !== 'user' || !Array.isArray(kinds) || kinds[index] === 'user.text'));
  const text = content.map((c: any) => c.text).join('\n');
  if (!text) return;
  if(p.role === 'user' && !kinds && /^(?:<recommended_plugins>|# AGENTS\.md instructions|<environment_context>|<send_user_message_question_reply>)/.test(text.trimStart())) return;
  return { id: p.id || createHash('sha256').update(`${event.timestamp}\0${p.role}\0${text}`).digest('hex'), role: p.role, text, timestamp: event.timestamp, phase: p.phase ?? 'user', ordinal:event.ordinal ?? 0,kind:'native' };
}

/** Read-only incremental reader. Never edits the host's files or database. */
export class RolloutReader {
  private offset = 0;
  private partial = '';
  private decoder = new StringDecoder('utf8');
  private polling = false;
  constructor(readonly path: string) {}
  async poll(onMessage: (message: HostMessage) => void): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const size = (await stat(this.path)).size;
      if (size < this.offset) { this.offset = 0; this.partial = ''; this.decoder = new StringDecoder('utf8'); }
      if (size === this.offset) return;
      const stream = createReadStream(this.path, { start: this.offset, end: size - 1 });
      for await (const chunk of stream) {
        const buffer = chunk as Buffer;
        this.offset += buffer.length;
        this.partial += this.decoder.write(buffer);
        let newline;
        while ((newline = this.partial.indexOf('\n')) >= 0) {
          const line = this.partial.slice(0, newline);
          this.partial = this.partial.slice(newline + 1);
          const message = parseMessage(line);
          if (message) onMessage(message);
        }
      }
    } finally { this.polling = false; }
  }
}
