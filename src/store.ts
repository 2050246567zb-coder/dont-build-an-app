import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HostMessage } from './adapters/rollout.ts';

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL, host_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, timestamp TEXT NOT NULL, UNIQUE(thread_id,host_id));
      CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, host_id TEXT, error TEXT);
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    this.db.exec('BEGIN IMMEDIATE');
    try{if (!this.get('message-schema-v2',false)) {
      // Only rebuild our disposable mirror; never edit the host conversation.
      this.db.exec("DELETE FROM messages; ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'native'; ALTER TABLE messages ADD COLUMN ordinal INTEGER NOT NULL DEFAULT 0; ALTER TABLE submissions ADD COLUMN base_ordinal INTEGER NOT NULL DEFAULT 0; ALTER TABLE submissions ADD COLUMN host_result TEXT;");
      this.put('message-schema-v2',true);
    }this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');this.db.close();throw error;}
  }
  addMessage(threadId: string, message: HostMessage): boolean {
    if(message.kind === 'delegated' && (message.sourceThreadId !== threadId || !this.submissions(threadId).some(s=>s.text.trim()===message.text.trim() && message.ordinal>s.base_ordinal && Date.parse(message.timestamp)>=Date.parse(s.created_at)-2000))) return false;
    return Number(this.db.prepare('INSERT OR IGNORE INTO messages(thread_id,host_id,role,text,timestamp,kind,ordinal) VALUES(?,?,?,?,?,?,?)').run(threadId,message.id,message.role,message.text,message.timestamp,message.kind,message.ordinal).changes) > 0;
  }
  messages(threadId: string, after = 0): any[] {
    return this.db.prepare('SELECT seq, host_id AS id, role, text, timestamp,kind,ordinal FROM messages WHERE thread_id=? AND seq>? ORDER BY ordinal,seq').all(threadId,after);
  }
  submissions(threadId: string): any[] { return this.db.prepare('SELECT * FROM submissions WHERE thread_id=? ORDER BY created_at').all(threadId); }
  submission(id: string): any { return this.db.prepare('SELECT * FROM submissions WHERE id=?').get(id); }
  beginSubmission(id: string, threadId: string, text: string): void {
    const base = this.messages(threadId).at(-1)?.ordinal ?? 0;
    this.db.prepare('INSERT INTO submissions(id,thread_id,text,created_at,status,base_ordinal) VALUES(?,?,?,?,?,?)').run(id,threadId,text,new Date().toISOString(),'submitting',base);
  }
  setSubmission(id: string, status: string, error: string | null = null): void {
    this.db.prepare('UPDATE submissions SET status=?,error=? WHERE id=?').run(status,error,id);
  }
  reconcile(threadId: string): void {
    for (const submission of this.submissions(threadId).filter(s => s.status !== 'confirmed')) {
      const match = this.messages(threadId).find(m => m.role === 'user' && m.kind==='delegated' && m.ordinal>submission.base_ordinal && m.text.trim() === submission.text.trim() && Date.parse(m.timestamp) >= Date.parse(submission.created_at) - 2000 && !this.db.prepare('SELECT 1 FROM submissions WHERE host_id=?').get(m.id));
      if (match) this.db.prepare('UPDATE submissions SET status=?,host_id=?,error=NULL WHERE id=?').run('confirmed',match.id,submission.id);
    }
  }
  hostResult(id:string,result:unknown):void { this.db.prepare('UPDATE submissions SET host_result=? WHERE id=?').run(JSON.stringify(result),id); }
  get<T>(key: string, fallback: T): T { const row = this.db.prepare('SELECT value FROM kv WHERE key=?').get(key) as any; return row ? JSON.parse(row.value) : fallback; }
  put(key: string, value: unknown): void { this.db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value)); }
  close(): void { this.db.close(); }
}
