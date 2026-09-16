export interface HostAdapter {
  readonly threadId: string;
  capabilities(): Promise<{name:string;namespace:string;inputSchema:unknown}[]>;
  readThread(): Promise<any>;
  send(text:string): Promise<any>;
  close(): void;
}
