export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  requiresExternalDataConfirmation?: boolean;
  originalQuestion?: string;
  summary?: import('./services/summaryService').TopicSummary;
}

export type ApiProvider = 'gemini' | 'openai';

// ドキュメントのチャンクと、そのベクトル表現。
export interface DocChunk {
  path: string;           // 相対パス（表示用）
  absolutePath: string;   // 絶対パス（ファイル開く用）
  content: string;
  vector: number[];
}