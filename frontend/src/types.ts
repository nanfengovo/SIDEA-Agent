export interface TraceEvent {
  id: string;
  type: string;
  data: any;
  timestamp: number;
}

export interface ChatMessage {
  role: 'user' | 'agent' | 'system';
  content: string;
}
