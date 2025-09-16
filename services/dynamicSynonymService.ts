/**
 * AI駆動の動的同義語生成サービス
 * 手動辞書を使わず、AIが文脈に応じて同義語を生成
 */

import { ApiProvider } from '../types';
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

// 同義語生成結果のキャッシュ
const synonymCache = new Map<string, string[]>();
const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30分
const cacheTimestamps = new Map<string, number>();

/**
 * AIを使って動的に同義語を生成します
 * @param keywords - 元のキーワード配列
 * @param provider - AIプロバイダー
 * @param apiKey - APIキー
 * @returns 同義語を含む拡張されたキーワード配列
 */
export async function generateDynamicSynonyms(
  keywords: string[], 
  provider: ApiProvider, 
  apiKey: string
): Promise<string[]> {
  const expandedKeywords = new Set<string>();
  
  // 元のキーワードを追加
  keywords.forEach(keyword => expandedKeywords.add(keyword));
  
  try {
    // 各キーワードの同義語を生成
    for (const keyword of keywords) {
      // 短すぎるキーワードや記号はスキップ
      if (keyword.length < 2 || /^[？！。、\s]+$/.test(keyword)) {
        continue;
      }
      
      const synonyms = await getSynonymsFromAI(keyword, provider, apiKey);
      synonyms.forEach(synonym => expandedKeywords.add(synonym));
    }
    
    console.log('🤖 AI同義語生成結果:', {
      元のキーワード: keywords,
      拡張後: Array.from(expandedKeywords),
      追加された同義語: Array.from(expandedKeywords).filter(kw => !keywords.includes(kw))
    });
    
  } catch (error) {
    console.error('AI同義語生成エラー:', error);
    // エラー時は元のキーワードをそのまま返す
  }
  
  return Array.from(expandedKeywords);
}

/**
 * 単一キーワードの同義語をAIから取得（キャッシュ付き）
 */
async function getSynonymsFromAI(keyword: string, provider: ApiProvider, apiKey: string): Promise<string[]> {
  const cacheKey = `${keyword.toLowerCase()}_${provider}`;
  
  // キャッシュチェック
  if (synonymCache.has(cacheKey)) {
    const timestamp = cacheTimestamps.get(cacheKey) || 0;
    if (Date.now() - timestamp < CACHE_EXPIRY_MS) {
      return synonymCache.get(cacheKey) || [];
    }
  }
  
  try {
    let synonyms: string[] = [];
    
    if (provider === 'gemini') {
      synonyms = await getGeminiSynonyms(keyword, apiKey);
    } else {
      synonyms = await getOpenAISynonyms(keyword, apiKey);
    }
    
    // キャッシュに保存
    synonymCache.set(cacheKey, synonyms);
    cacheTimestamps.set(cacheKey, Date.now());
    
    return synonyms;
    
  } catch (error) {
    console.warn(`同義語生成失敗 (${keyword}):`, error);
    return [];
  }
}

/**
 * Geminiを使った同義語生成
 */
async function getGeminiSynonyms(keyword: string, apiKey: string): Promise<string[]> {
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `「${keyword}」の日本語同義語を3〜5個、カンマ区切りで生成してください。

要件:
- ビジネス・学習文脈で使われる自然な同義語のみ
- 元の語と同じ品詞・意味レベルの語
- 文脈で置き換え可能な語のみ
- 略語や俗語は避ける

例:
入力: 会社 → 出力: 企業,組織,職場,勤務先
入力: 手続き → 出力: 手順,プロセス,方法,やり方
入力: 学習 → 出力: 勉強,習得,修得,学ぶ

出力形式: 同義語1,同義語2,同義語3（説明不要）`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.3, // 一貫性重視
      maxOutputTokens: 100
    }
  });

  const result = response.text?.trim() || '';
  return parseSynonymResponse(result);
}

/**
 * OpenAIを使った同義語生成
 */
async function getOpenAISynonyms(keyword: string, apiKey: string): Promise<string[]> {
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  
  const prompt = `「${keyword}」の日本語同義語を3〜5個、カンマ区切りで生成してください。

要件:
- ビジネス・学習文脈で使われる自然な同義語のみ
- 元の語と同じ品詞・意味レベルの語
- 文脈で置き換え可能な語のみ
- 略語や俗語は避ける

例:
入力: 会社 → 出力: 企業,組織,職場,勤務先
入力: 手続き → 出力: 手順,プロセス,方法,やり方

出力形式: 同義語1,同義語2,同義語3（説明不要）`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 100
  });

  const result = response.choices[0]?.message?.content?.trim() || '';
  return parseSynonymResponse(result);
}

/**
 * AI応答から同義語を抽出
 */
function parseSynonymResponse(response: string): string[] {
  // カンマ区切りの同義語を抽出
  const synonyms = response
    .split(/[,、，]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 20) // 長すぎる応答を除外
    .filter(s => !/[a-zA-Z]/.test(s)) // 英語を除外
    .slice(0, 5); // 最大5個まで
  
  return synonyms;
}

/**
 * 質問全体から重要キーワードを抽出してから同義語生成
 * @param question - 質問文
 * @param provider - AIプロバイダー 
 * @param apiKey - APIキー
 * @returns 同義語で拡張された検索クエリ
 */
export async function createAIExpandedQuery(
  question: string, 
  provider: ApiProvider, 
  apiKey: string
): Promise<string> {
  try {
    // 重要キーワードを抽出
    const keywords = extractImportantKeywords(question);
    
    // 日付クエリの場合は同義語生成をスキップ
    if (/(\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2}|\d{4}-\d{1,2}-\d{1,2})/i.test(question)) {
      console.log('📅 日付クエリのため同義語生成をスキップ');
      return question;
    }
    
    // AI同義語生成
    const expandedKeywords = await generateDynamicSynonyms(keywords, provider, apiKey);
    const newSynonyms = expandedKeywords.filter(kw => !keywords.includes(kw));
    
    if (newSynonyms.length > 0) {
      const expandedQuery = `${question} ${newSynonyms.join(' ')}`;
      console.log('🔍 AI拡張検索クエリ:', expandedQuery);
      return expandedQuery;
    }
    
    return question;
    
  } catch (error) {
    console.error('AI同義語拡張エラー:', error);
    return question;
  }
}

/**
 * 質問から重要なキーワードを抽出
 */
function extractImportantKeywords(question: string): string[] {
  const normalized = question.normalize('NFKC');
  
  // ストップワード
  const stopWords = new Set([
    'は', 'を', 'が', 'に', 'で', 'て', 'です', 'ます', 'ある', 'いる', 'する',
    'から', 'まで', 'について', 'どの', 'どこ', '何', 'いつ', '？', '?', '。'
  ]);
  
  // 単語分割（簡易版）
  const words = normalized
    .replace(/[？？。、，！!]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2)
    .filter(w => !stopWords.has(w))
    .slice(0, 5); // 最重要な5語まで
  
  return words;
}

/**
 * キャッシュクリア（メモリ管理用）
 */
export function clearSynonymCache(): void {
  synonymCache.clear();
  cacheTimestamps.clear();
  console.log('🗑️ 同義語キャッシュをクリアしました');
}

/**
 * キャッシュ統計取得（デバッグ用）
 */
export function getSynonymCacheStats(): { size: number; oldestEntry?: number } {
  const timestamps = Array.from(cacheTimestamps.values());
  const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : undefined;
  
  return {
    size: synonymCache.size,
    oldestEntry
  };
}