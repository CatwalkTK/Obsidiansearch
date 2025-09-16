/**
 * インテリジェント要約・抽出サービス
 * 複数のドキュメントチャンクから階層的な要約を生成
 */

import { ApiProvider, DocChunk } from '../types';
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export interface TopicSummary {
  summary: string;           // メイン要約
  keyPoints: string[];       // 重要ポイント
  references: string[];      // 参照元ファイル
  confidence: number;        // 信頼度 (0-1)
  relatedTopics: string[];   // 関連トピック
}

export interface SummaryRequest {
  topic: string;
  chunks: DocChunk[];
  maxLength?: number;        // 要約の最大文字数
  includeExamples?: boolean; // 具体例を含むか
}

/**
 * トピックに関する包括的な要約を生成
 */
export async function generateTopicSummary(
  request: SummaryRequest,
  provider: ApiProvider,
  apiKey: string
): Promise<TopicSummary> {
  try {
    // 関連するチャンクを選択・整理
    const relevantChunks = selectRelevantChunks(request.chunks, request.topic);
    
    if (relevantChunks.length === 0) {
      return {
        summary: `「${request.topic}」に関する情報が見つかりませんでした。`,
        keyPoints: [],
        references: [],
        confidence: 0,
        relatedTopics: []
      };
    }

    // AIを使って要約生成
    const summaryResult = await generateAISummary(
      request.topic,
      relevantChunks,
      provider,
      apiKey,
      request.maxLength,
      request.includeExamples
    );

    // 参照元ファイルを抽出
    const references = [...new Set(relevantChunks.map(chunk => chunk.path))];

    // 関連トピックを抽出
    const relatedTopics = await extractRelatedTopics(
      summaryResult.summary,
      provider,
      apiKey
    );

    return {
      ...summaryResult,
      references,
      relatedTopics,
      confidence: calculateConfidence(relevantChunks, request.topic)
    };

  } catch (error) {
    console.error('要約生成エラー:', error);
    return {
      summary: `要約の生成中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
      keyPoints: [],
      references: [],
      confidence: 0,
      relatedTopics: []
    };
  }
}

/**
 * トピックに最も関連するチャンクを選択
 */
function selectRelevantChunks(chunks: DocChunk[], topic: string): DocChunk[] {
  const normalizedTopic = topic.toLowerCase().normalize('NFKC');
  
  // トピックに関連するキーワードを抽出
  const keywords = extractTopicKeywords(normalizedTopic);
  
  // 各チャンクとトピックの関連度を計算
  const scoredChunks = chunks.map(chunk => {
    const normalizedContent = chunk.content.toLowerCase().normalize('NFKC');
    const normalizedPath = chunk.path.toLowerCase().normalize('NFKC');
    
    let score = 0;
    
    // キーワードマッチング
    keywords.forEach(keyword => {
      if (normalizedContent.includes(keyword)) score += 2;
      if (normalizedPath.includes(keyword)) score += 3;
    });
    
    // トピック直接マッチング
    if (normalizedContent.includes(normalizedTopic)) score += 5;
    if (normalizedPath.includes(normalizedTopic)) score += 7;
    
    return { chunk, score };
  });
  
  // スコアの高い順にソートして上位を選択
  return scoredChunks
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15) // 最大15チャンクまで
    .map(item => item.chunk);
}

/**
 * トピックからキーワードを抽出
 */
function extractTopicKeywords(topic: string): string[] {
  // 基本的な単語分割
  const words = topic
    .replace(/[？？。、，！!]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2);
  
  // ストップワード除去
  const stopWords = new Set(['について', 'に関して', 'の方法', 'のやり方', 'とは']);
  
  return words.filter(word => !stopWords.has(word));
}

/**
 * AIを使った要約生成
 */
async function generateAISummary(
  topic: string,
  chunks: DocChunk[],
  provider: ApiProvider,
  apiKey: string,
  maxLength: number = 800,
  includeExamples: boolean = true
): Promise<{summary: string, keyPoints: string[]}> {
  
  // コンテキスト作成
  const context = chunks.map((chunk, index) => 
    `【文書${index + 1}: ${chunk.path}】\n${chunk.content}`
  ).join('\n\n');
  
  const examplesInstruction = includeExamples 
    ? "具体例や実践的な情報があれば含めてください。" 
    : "";
  
  const prompt = `以下の社内ナレッジから「${topic}」について包括的に要約してください。

【要求事項】
- 要約は${maxLength}文字以内で簡潔に
- 重要なポイントを3-7個のリストで整理
- 階層構造を意識し、概要→詳細の順で記述
- ${examplesInstruction}
- 曖昧な情報は「詳細は文書を参照」として処理

【出力フォーマット】
## 要約
[ここに要約を記載]

## 重要ポイント
- ポイント1
- ポイント2
- ポイント3

【社内ナレッジ】
${context}`;

  try {
    let response: string;
    
    if (provider === 'gemini') {
      response = await generateGeminiSummary(prompt, apiKey);
    } else {
      response = await generateOpenAISummary(prompt, apiKey);
    }
    
    return parseSummaryResponse(response);
    
  } catch (error) {
    console.error('AI要約生成エラー:', error);
    throw error;
  }
}

/**
 * Geminiを使った要約生成
 */
async function generateGeminiSummary(prompt: string, apiKey: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.3,
      maxOutputTokens: 1500
    }
  });
  
  return response.text?.trim() || '';
}

/**
 * OpenAIを使った要約生成
 */
async function generateOpenAISummary(prompt: string, apiKey: string): Promise<string> {
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 1500
  });
  
  return response.choices[0]?.message?.content?.trim() || '';
}

/**
 * AI応答を解析して構造化データに変換
 */
function parseSummaryResponse(response: string): {summary: string, keyPoints: string[]} {
  const lines = response.split('\n').map(line => line.trim());
  
  let summary = '';
  const keyPoints: string[] = [];
  let currentSection: 'summary' | 'points' | 'none' = 'none';
  
  for (const line of lines) {
    if (line.includes('## 要約') || line.includes('要約')) {
      currentSection = 'summary';
      continue;
    } else if (line.includes('## 重要ポイント') || line.includes('重要ポイント') || line.includes('ポイント')) {
      currentSection = 'points';
      continue;
    } else if (line.startsWith('## ') || line.startsWith('# ')) {
      currentSection = 'none';
      continue;
    }
    
    if (currentSection === 'summary' && line.length > 0) {
      summary += line + '\n';
    } else if (currentSection === 'points' && (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('・'))) {
      keyPoints.push(line.replace(/^[- •・]\s*/, ''));
    }
  }
  
  // フォールバック: 構造が認識できない場合
  if (!summary && !keyPoints.length) {
    const paragraphs = response.split('\n\n').filter(p => p.trim().length > 0);
    summary = paragraphs[0] || response.substring(0, 400) + '...';
  }
  
  return {
    summary: summary.trim() || '要約の生成に失敗しました',
    keyPoints: keyPoints.length > 0 ? keyPoints : ['要約から重要ポイントを抽出できませんでした']
  };
}

/**
 * 関連トピックを抽出
 */
async function extractRelatedTopics(
  summary: string, 
  provider: ApiProvider, 
  apiKey: string
): Promise<string[]> {
  try {
    const prompt = `以下のテキストから関連するトピック・キーワードを3-5個抽出してください。
    
出力形式: トピック1,トピック2,トピック3 (カンマ区切り、説明不要)

テキスト:
${summary.substring(0, 500)}`;

    let response: string;
    
    if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.2, maxOutputTokens: 100 }
      });
      response = result.text?.trim() || '';
    } else {
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      const result = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 100
      });
      response = result.choices[0]?.message?.content?.trim() || '';
    }
    
    return response
      .split(/[,，、]/)
      .map(t => t.trim())
      .filter(t => t.length > 0 && t.length < 30)
      .slice(0, 5);
      
  } catch (error) {
    console.warn('関連トピック抽出エラー:', error);
    return [];
  }
}

/**
 * 信頼度を計算
 */
function calculateConfidence(chunks: DocChunk[], topic: string): number {
  if (chunks.length === 0) return 0;
  
  const normalizedTopic = topic.toLowerCase();
  let totalRelevance = 0;
  
  chunks.forEach(chunk => {
    const content = chunk.content.toLowerCase();
    const path = chunk.path.toLowerCase();
    
    let relevance = 0;
    if (content.includes(normalizedTopic)) relevance += 0.3;
    if (path.includes(normalizedTopic)) relevance += 0.4;
    if (content.length > 200) relevance += 0.2; // 長い文書は信頼性が高い
    if (chunk.path.includes('.md')) relevance += 0.1; // markdown文書
    
    totalRelevance += Math.min(relevance, 1.0);
  });
  
  const confidence = Math.min(totalRelevance / chunks.length, 1.0);
  return Math.round(confidence * 100) / 100;
}

/**
 * 要約を短縮（必要に応じて）
 */
export function truncateSummary(summary: string, maxLength: number): string {
  if (summary.length <= maxLength) return summary;
  
  const truncated = summary.substring(0, maxLength - 3);
  const lastSentence = truncated.lastIndexOf('。');
  
  if (lastSentence > maxLength * 0.7) {
    return truncated.substring(0, lastSentence + 1);
  }
  
  return truncated + '...';
}