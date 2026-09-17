import type {HostMessage} from './rollout.ts';
export interface HistoryReader {poll(onMessage:(message:HostMessage)=>void):Promise<void>}
export interface HostAdapter {
  readonly threadId: string;
  readonly name?:string;
  readonly label?:string;
  readonly reader?:HistoryReader;
  capabilities(): Promise<{name:string;namespace:string;inputSchema:unknown}[]>;
  readThread(): Promise<any>;
  send(text:string,submissionId?:string): Promise<any>;
  openOriginal?(): Promise<any>;
  close(): void;
}
