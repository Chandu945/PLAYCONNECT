export const PUSH_SENDER_PORT = Symbol('PUSH_SENDER_PORT');

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSenderPort {
  sendToTokens(tokens: string[], message: PushMessage): Promise<string[]>;
}
