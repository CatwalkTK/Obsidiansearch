export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
}

export type ApiProvider = 'gemini' | 'openai';

// ドキュメントのチャンクと、そのベクトル表現。
export interface DocChunk {
  path: string;
  content: string;
  vector: number[];
}