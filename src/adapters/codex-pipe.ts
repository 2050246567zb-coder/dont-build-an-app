import net from 'node:net';
import { randomUUID } from 'node:crypto';

const MAX_FRAME = 8 * 1024 * 1024;
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

/** Version-specific transport used by the installed Codex app-tools plugin.
 * Only the narrowly allowed host methods below are exposed by this adapter.
 * No new app-server process, model, or conversation is started.
 */
export class CodexPipe {
  private socket?: net.Socket;
  private connecting?: Promise<void>;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private catalog?: Map<string, { name: string; namespace: string; inputSchema: unknown }>;

  constructor(private pipePath: string, readonly threadId: string) {}

  private async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;
    this.connecting = new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(this.pipePath);
      const timer = setTimeout(() => socket.destroy(new Error('Codex connection timed out')), 5000);
      const initialError = (error: Error) => { clearTimeout(timer); reject(error); };
      socket.once('error', initialError);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.off('error', initialError);
        this.socket = socket;
        this.buffer = Buffer.alloc(0);
        socket.on('data', chunk => { if (this.socket === socket) this.onData(chunk); });
        socket.on('error', error => { if (this.socket === socket) this.disconnect(error); });
        socket.on('close', () => { if (this.socket === socket) this.disconnect(new Error('Codex connection closed')); });
        resolve();
      });
    }).finally(() => { this.connecting = undefined; });
    return this.connecting;
  }

  private disconnect(error: Error): void {
    const socket = this.socket;
    this.socket = undefined;
    this.buffer = Buffer.alloc(0);
    socket?.destroy();
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear();
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const size = this.buffer.readUInt32LE(0);
      if (size > MAX_FRAME) { this.disconnect(new Error('Codex response exceeds frame limit')); return; }
      if (this.buffer.length < size + 4) return;
      const body = this.buffer.subarray(4, size + 4);
      this.buffer = this.buffer.subarray(size + 4);
      try {
        const response = JSON.parse(body.toString('utf8'));
        const pending = this.pending.get(Number(response.id));
        if (!pending) continue;
        this.pending.delete(Number(response.id));
        clearTimeout(pending.timer);
        if (response.error) pending.reject(new Error(response.error.message));
        else pending.resolve(response.result);
      } catch { this.disconnect(new Error('Invalid Codex response')); return; }
    }
  }

  private async request(method: string, params: unknown): Promise<any> {
    await this.connect();
    const id = this.nextId++;
    const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    if (payload.length > MAX_FRAME) throw new Error('Request exceeds frame limit');
    const frame = Buffer.alloc(4 + payload.length);
    frame.writeUInt32LE(payload.length);
    payload.copy(frame, 4);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Codex request timed out; mutation result may be unknown'));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket!.write(frame, error => {
        if (error) { this.pending.delete(id); clearTimeout(timer); reject(error); }
      });
    });
  }

  async capabilities(): Promise<{ name: string; namespace: string; inputSchema: unknown }[]> {
    const result = await this.request('tools/list', { threadStartKind: 'all' });
    const allowed = new Set(['read_thread', 'send_message_to_thread', 'navigate_to_codex_page']);
    const tools = result.tools.filter((tool: any) => allowed.has(tool.name) && tool.namespace === 'codex_app');
    this.catalog = new Map(tools.map((tool: any) => [tool.name, tool]));
    return tools;
  }

  async call(name: 'read_thread' | 'send_message_to_thread' | 'navigate_to_codex_page', args: Record<string, unknown>): Promise<any> {
    if (!this.catalog) await this.capabilities();
    const tool = this.catalog!.get(name);
    if (!tool) throw new Error(`Current Codex host does not expose ${name}`);
    if (args.threadId !== this.threadId) throw new Error('Cross-conversation calls are not allowed');
    const result = await this.request('tools/call', {
      arguments: args, namespace: tool.namespace, tool: tool.name,
      threadId: this.threadId, callId: `galgame-${randomUUID()}`, turnId: `galgame-${randomUUID()}`,
    });
    const text = result.contentItems?.filter((item: any) => item.type === 'inputText').map((item: any) => item.text).join('\n') ?? '';
    if (!result.success) throw new Error(text || 'Codex tool failed');
    try { return JSON.parse(text); } catch { return { text }; }
  }

  readThread(): Promise<any> {
    return this.call('read_thread', { threadId: this.threadId, turnLimit: 2, includeOutputs: false });
  }

  send(text: string): Promise<any> {
    return this.call('send_message_to_thread', { threadId: this.threadId, prompt: text });
  }

  close(): void { this.disconnect(new Error('Adapter closed')); }
}
