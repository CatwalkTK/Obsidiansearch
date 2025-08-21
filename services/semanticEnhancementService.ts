/**
 * セマンティック検索強化サービス
 * 同義語辞書に依存せず、意味的類似性を向上
 */

import { ApiProvider } from '../types';
import { generateEmbeddings } from './embeddingService';

/**
 * 質問を複数の表現パターンに展開してベクトル化
 * @param originalQuery - 元の質問
 * @param provider - APIプロバイダー
 * @param apiKey - APIキー
 * @returns 複数パターンの埋め込みベクトル平均
 */
export async function generateEnhancedEmbedding(
  originalQuery: string,
  provider: ApiProvider,
  apiKey: string
): Promise<number[]> {
  
  const queryVariations = generateQueryVariations(originalQuery);
  
  console.log('🔄 クエリバリエーション生成:', {
    元の質問: originalQuery,
    バリエーション: queryVariations
  });
  
  try {
    // 全てのバリエーションをベクトル化
    const embeddings = await generateEmbeddings(queryVariations, provider, apiKey, () => {});
    
    // 平均ベクトルを計算
    const averageEmbedding = calculateAverageEmbedding(embeddings);
    
    return averageEmbedding;
    
  } catch (error) {
    console.error('拡張埋め込み生成エラー:', error);
    // フォールバック: 元の質問のみを使用
    const fallbackEmbeddings = await generateEmbeddings([originalQuery], provider, apiKey, () => {});
    return fallbackEmbeddings[0] || [];
  }
}

/**
 * 質問を複数の表現パターンに展開
 */
function generateQueryVariations(query: string): string[] {
  const variations = [query]; // 元の質問を含める
  
  // 日付クエリの場合は早期リターン
  if (/(\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2}|\d{4}-\d{1,2}-\d{1,2})/i.test(query)) {
    return variations;
  }
  
  // パターン1: 丁寧語・敬語バリエーション
  if (query.includes('？') || query.includes('?')) {
    const polite = query
      .replace(/は？$/, 'について教えてください')
      .replace(/\?$/, 'について教えてください')
      .replace(/？$/, 'について教えてください');
    if (polite !== query) variations.push(polite);
    
    const casual = query
      .replace(/について教えてください$/, 'は？')
      .replace(/を教えて$/, 'は？');
    if (casual !== query) variations.push(casual);
  }
  
  // パターン2: 動詞形変換
  const verbVariations = generateVerbVariations(query);
  verbVariations.forEach(v => {
    if (!variations.includes(v)) variations.push(v);
  });
  
  // パターン3: 助詞バリエーション
  const particleVariations = generateParticleVariations(query);
  particleVariations.forEach(v => {
    if (!variations.includes(v)) variations.push(v);
  });
  
  // パターン4: 語順バリエーション
  const orderVariations = generateOrderVariations(query);
  orderVariations.forEach(v => {
    if (!variations.includes(v)) variations.push(v);
  });
  
  return variations.slice(0, 5); // 最大5パターンまで
}

/**
 * 動詞形のバリエーション生成
 */
function generateVerbVariations(query: string): string[] {
  const variations: string[] = [];
  
  // よくある動詞変換パターン
  const verbPatterns = [
    { from: /辞める/g, to: '退職する' },
    { from: /退職する/g, to: '辞める' },
    { from: /やめる/g, to: '退職する' },
    { from: /始める/g, to: '開始する' },
    { from: /開始する/g, to: '始める' },
    { from: /終わる/g, to: '完了する' },
    { from: /完了する/g, to: '終わる' },
    { from: /学ぶ/g, to: '勉強する' },
    { from: /勉強する/g, to: '学習する' },
    { from: /作る/g, to: '作成する' },
    { from: /作成する/g, to: '作る' }
  ];
  
  verbPatterns.forEach(pattern => {
    if (pattern.from.test(query)) {
      const variation = query.replace(pattern.from, pattern.to);
      variations.push(variation);
    }
  });
  
  return variations;
}

/**
 * 助詞バリエーション生成
 */
function generateParticleVariations(query: string): string[] {
  const variations: string[] = [];
  
  // 助詞の変換パターン
  const particlePatterns = [
    { from: /の手続き/g, to: 'について' },
    { from: /の方法/g, to: 'のやり方' },
    { from: /はどう/g, to: 'について' },
    { from: /について/g, to: 'に関して' },
    { from: /に関して/g, to: 'について' }
  ];
  
  particlePatterns.forEach(pattern => {
    if (pattern.from.test(query)) {
      const variation = query.replace(pattern.from, pattern.to);
      variations.push(variation);
    }
  });
  
  return variations;
}

/**
 * 語順バリエーション生成
 */
function generateOrderVariations(query: string): string[] {
  const variations: string[] = [];
  
  // 「AのBは？」→「BはAの？」のような語順変更
  const orderPattern = /(.+?)の(.+?)は？$/;
  const match = query.match(orderPattern);
  if (match) {
    const [, a, b] = match;
    const reordered = `${b}は${a}の？`;
    variations.push(reordered);
  }
  
  return variations;
}

/**
 * 複数の埋め込みベクトルの平均を計算
 */
function calculateAverageEmbedding(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  if (embeddings.length === 1) return embeddings[0];
  
  const dimension = embeddings[0].length;
  const average = new Array(dimension).fill(0);
  
  // 各次元の平均を計算
  for (let i = 0; i < dimension; i++) {
    let sum = 0;
    for (const embedding of embeddings) {
      sum += embedding[i] || 0;
    }
    average[i] = sum / embeddings.length;
  }
  
  return average;
}

/**
 * クエリ複雑度評価（簡単なクエリは拡張しない）
 */
export function shouldEnhanceQuery(query: string): boolean {
  // 非常に短いクエリは拡張しない
  if (query.length < 5) return false;
  
  // 単一単語クエリは拡張しない  
  if (!/\s/.test(query.trim()) && query.length < 10) return false;
  
  // 日付クエリは拡張しない
  if (/(\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2}|\d{4}-\d{1,2}-\d{1,2})/i.test(query)) {
    return false;
  }
  
  return true;
}

/**
 * セマンティック検索信頼度計算
 * 類似度スコアの信頼性を評価
 */
export function calculateSemanticConfidence(
  scores: number[]
): { confidence: number; shouldRelax: boolean } {
  
  if (scores.length === 0) return { confidence: 0, shouldRelax: false };
  
  const maxScore = Math.max(...scores);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const scoreVariance = calculateVariance(scores);
  
  // 信頼度計算（0-1）
  const confidence = Math.min(1, (maxScore * 0.7) + (avgScore * 0.2) + ((1 - scoreVariance) * 0.1));
  
  // しきい値緩和判定
  const shouldRelax = confidence > 0.6 && maxScore > 0.3;
  
  console.log('🎯 セマンティック信頼度評価:', {
    最高スコア: maxScore.toFixed(3),
    平均スコア: avgScore.toFixed(3),
    分散: scoreVariance.toFixed(3),
    信頼度: confidence.toFixed(3),
    しきい値緩和: shouldRelax
  });
  
  return { confidence, shouldRelax };
}

/**
 * 分散計算
 */
function calculateVariance(numbers: number[]): number {
  const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const squaredDiffs = numbers.map(num => Math.pow(num - avg, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
}