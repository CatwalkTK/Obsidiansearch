/**
 * スマート質問候補生成サービス
 * ナレッジベースから文脈に応じた質問候補を自動生成
 */

import { ApiProvider, DocChunk } from '../types';
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export interface QuestionCategory {
  category: string;
  icon: string;
  questions: SmartQuestion[];
}

export interface SmartQuestion {
  question: string;
  confidence: number;
  relatedFiles: string[];
  estimatedAnswerQuality: 'high' | 'medium' | 'low';
}

export interface QuestionSuggestionOptions {
  maxQuestionsPerCategory: number;
  includePersonalized: boolean;
  focusAreas?: string[];
  userHistory?: string[];
}

// 質問候補のキャッシュ
const questionCache = new Map<string, QuestionCategory[]>();
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 60分
const cacheTimestamps = new Map<string, number>();

/**
 * 文脈感知質問候補を生成
 */
export async function generateSmartQuestions(
  docChunks: DocChunk[],
  options: QuestionSuggestionOptions,
  provider: ApiProvider,
  apiKey: string,
  userHistory: string[] = []
): Promise<QuestionCategory[]> {
  
  try {
    // キャッシュキーを生成
    const cacheKey = generateCacheKey(docChunks, options, userHistory);
    
    // キャッシュチェック
    if (questionCache.has(cacheKey)) {
      const timestamp = cacheTimestamps.get(cacheKey) || 0;
      if (Date.now() - timestamp < CACHE_EXPIRY_MS) {
        console.log('📋 キャッシュから質問候補を取得');
        return questionCache.get(cacheKey) || [];
      }
    }

    // ナレッジベースから重要トピックを抽出
    const topics = await extractImportantTopics(docChunks, provider, apiKey);
    
    // カテゴリ別に質問を生成
    const categories: QuestionCategory[] = [];
    
    // 1. 基本操作・概要カテゴリ
    const basicQuestions = await generateBasicQuestions(topics, provider, apiKey, options);
    if (basicQuestions.questions.length > 0) {
      categories.push(basicQuestions);
    }
    
    // 2. 詳細・技術カテゴリ
    const detailedQuestions = await generateDetailedQuestions(topics, provider, apiKey, options);
    if (detailedQuestions.questions.length > 0) {
      categories.push(detailedQuestions);
    }
    
    // 3. トラブルシューティングカテゴリ
    const troubleshootingQuestions = await generateTroubleshootingQuestions(topics, provider, apiKey, options);
    if (troubleshootingQuestions.questions.length > 0) {
      categories.push(troubleshootingQuestions);
    }
    
    // 4. 個人化カテゴリ（ユーザー履歴がある場合）
    if (options.includePersonalized && userHistory.length > 0) {
      const personalizedQuestions = await generatePersonalizedQuestions(
        topics, userHistory, provider, apiKey, options
      );
      if (personalizedQuestions.questions.length > 0) {
        categories.push(personalizedQuestions);
      }
    }
    
    // 質問の品質をチェックして関連ファイルを特定
    const enhancedCategories = await enhanceQuestionsWithContext(categories, docChunks);
    
    // キャッシュに保存
    questionCache.set(cacheKey, enhancedCategories);
    cacheTimestamps.set(cacheKey, Date.now());
    
    console.log('💡 生成された質問候補:', {
      categories: enhancedCategories.length,
      totalQuestions: enhancedCategories.reduce((sum, cat) => sum + cat.questions.length, 0)
    });
    
    return enhancedCategories;
    
  } catch (error) {
    console.error('質問候補生成エラー:', error);
    return generateFallbackQuestions(docChunks);
  }
}

/**
 * ナレッジベースから重要トピックを抽出
 */
async function extractImportantTopics(
  docChunks: DocChunk[],
  provider: ApiProvider,
  apiKey: string
): Promise<string[]> {
  
  // ファイルパスとコンテンツから頻出キーワードを抽出
  const allText = docChunks.map(chunk => `${chunk.path} ${chunk.content}`).join(' ');
  const sample = allText.substring(0, 3000); // サンプルテキスト
  
  const prompt = `以下の社内ナレッジから、主要なトピック・概念を8-12個抽出してください。

出力形式: トピック1,トピック2,トピック3 (カンマ区切り、説明不要)

要件:
- ビジネス・技術・手順に関する重要な概念のみ
- 具体的で質問に適した名詞・概念
- 一般的すぎない、このナレッジベース特有のトピック

ナレッジサンプル:
${sample}`;

  try {
    let response: string;
    
    if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.3, maxOutputTokens: 200 }
      });
      response = result.text?.trim() || '';
    } else {
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      const result = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 200
      });
      response = result.choices[0]?.message?.content?.trim() || '';
    }
    
    const topics = response
      .split(/[,，、]/)
      .map(t => t.trim())
      .filter(t => t.length > 2 && t.length < 30)
      .slice(0, 12);
    
    console.log('🎯 抽出されたトピック:', topics);
    return topics;
    
  } catch (error) {
    console.error('トピック抽出エラー:', error);
    return extractTopicsFromPaths(docChunks);
  }
}

/**
 * 基本操作・概要の質問を生成
 */
async function generateBasicQuestions(
  topics: string[],
  provider: ApiProvider,
  apiKey: string,
  options: QuestionSuggestionOptions
): Promise<QuestionCategory> {
  
  const prompt = `以下のトピックに関する「基本的な概要・手順」を知りたい人が聞きそうな質問を${options.maxQuestionsPerCategory}個生成してください。

トピック: ${topics.join(', ')}

要件:
- 初心者や新入社員が聞きそうな基本的な質問
- 「〜とは何ですか？」「〜の手順は？」「〜の基本は？」等
- 具体的で実用的な質問のみ
- 質問は日本語で自然な表現

出力形式: 1つの質問を1行ずつ（番号不要、説明不要）`;

  const questions = await generateQuestionsFromPrompt(prompt, provider, apiKey);
  
  return {
    category: '基本・概要',
    icon: '📚',
    questions: questions.map(q => ({
      question: q,
      confidence: 0.8,
      relatedFiles: [],
      estimatedAnswerQuality: 'high' as const
    }))
  };
}

/**
 * 詳細・技術的な質問を生成
 */
async function generateDetailedQuestions(
  topics: string[],
  provider: ApiProvider,
  apiKey: string,
  options: QuestionSuggestionOptions
): Promise<QuestionCategory> {
  
  const prompt = `以下のトピックに関する「詳細な技術情報・応用方法」を知りたい人が聞きそうな質問を${options.maxQuestionsPerCategory}個生成してください。

トピック: ${topics.join(', ')}

要件:
- 経験者や専門スタッフが聞きそうな詳細な質問
- 「〜の詳細設定は？」「〜を最適化するには？」「〜の応用例は？」等
- 技術的で実践的な質問のみ
- 質問は日本語で自然な表現

出力形式: 1つの質問を1行ずつ（番号不要、説明不要）`;

  const questions = await generateQuestionsFromPrompt(prompt, provider, apiKey);
  
  return {
    category: '詳細・技術',
    icon: '🔧',
    questions: questions.map(q => ({
      question: q,
      confidence: 0.7,
      relatedFiles: [],
      estimatedAnswerQuality: 'medium' as const
    }))
  };
}

/**
 * トラブルシューティングの質問を生成
 */
async function generateTroubleshootingQuestions(
  topics: string[],
  provider: ApiProvider,
  apiKey: string,
  options: QuestionSuggestionOptions
): Promise<QuestionCategory> {
  
  const prompt = `以下のトピックに関する「問題解決・トラブル対応」を知りたい人が聞きそうな質問を${options.maxQuestionsPerCategory}個生成してください。

トピック: ${topics.join(', ')}

要件:
- 困ったときや問題が発生したときの質問
- 「〜がうまくいかない時は？」「〜のエラーの対処法は？」「〜で困ったら？」等
- 実際に起こりがちな問題・課題への質問
- 質問は日本語で自然な表現

出力形式: 1つの質問を1行ずつ（番号不要、説明不要）`;

  const questions = await generateQuestionsFromPrompt(prompt, provider, apiKey);
  
  return {
    category: 'トラブル対応',
    icon: '🚨',
    questions: questions.map(q => ({
      question: q,
      confidence: 0.6,
      relatedFiles: [],
      estimatedAnswerQuality: 'medium' as const
    }))
  };
}

/**
 * 個人化された質問を生成
 */
async function generatePersonalizedQuestions(
  topics: string[],
  userHistory: string[],
  provider: ApiProvider,
  apiKey: string,
  options: QuestionSuggestionOptions
): Promise<QuestionCategory> {
  
  // ユーザーの興味分野を分析
  const recentQueries = userHistory.slice(-10).join(', ');
  
  const prompt = `以下の情報から、このユーザーが興味を持ちそうな質問を${options.maxQuestionsPerCategory}個生成してください。

利用可能なトピック: ${topics.join(', ')}
ユーザーの最近の質問: ${recentQueries}

要件:
- ユーザーの興味・関心に基づいた個人化された質問
- 過去の質問パターンから推測される関心事項
- フォローアップや関連する深掘り質問
- 質問は日本語で自然な表現

出力形式: 1つの質問を1行ずつ（番号不要、説明不要）`;

  const questions = await generateQuestionsFromPrompt(prompt, provider, apiKey);
  
  return {
    category: 'あなたへの提案',
    icon: '🎯',
    questions: questions.map(q => ({
      question: q,
      confidence: 0.9,
      relatedFiles: [],
      estimatedAnswerQuality: 'high' as const
    }))
  };
}

/**
 * プロンプトから質問リストを生成
 */
async function generateQuestionsFromPrompt(
  prompt: string,
  provider: ApiProvider,
  apiKey: string
): Promise<string[]> {
  
  try {
    let response: string;
    
    if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.4, maxOutputTokens: 400 }
      });
      response = result.text?.trim() || '';
    } else {
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      const result = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 400
      });
      response = result.choices[0]?.message?.content?.trim() || '';
    }
    
    const questions = response
      .split('\n')
      .map(line => line.replace(/^\d+\.?\s*/, '').trim()) // 番号を削除
      .filter(line => line.length > 5 && line.includes('？' || '?'))
      .slice(0, 8); // 最大8個まで
    
    return questions;
    
  } catch (error) {
    console.error('質問生成エラー:', error);
    return [];
  }
}

/**
 * 質問に関連ファイルと品質評価を追加
 */
async function enhanceQuestionsWithContext(
  categories: QuestionCategory[],
  docChunks: DocChunk[]
): Promise<QuestionCategory[]> {
  
  return categories.map(category => ({
    ...category,
    questions: category.questions.map(question => {
      // 質問に関連するファイルを検索
      const relatedFiles = findRelatedFiles(question.question, docChunks);
      
      // 回答品質を推定
      const estimatedQuality = estimateAnswerQuality(relatedFiles.length);
      
      return {
        ...question,
        relatedFiles: relatedFiles.slice(0, 3), // 最大3ファイル
        estimatedAnswerQuality: estimatedQuality
      };
    })
  }));
}

/**
 * 質問に関連するファイルを検索
 */
function findRelatedFiles(question: string, docChunks: DocChunk[]): string[] {
  const keywords = extractKeywordsFromQuestion(question);
  const fileScores = new Map<string, number>();
  
  docChunks.forEach(chunk => {
    let score = 0;
    const content = chunk.content.toLowerCase();
    const path = chunk.path.toLowerCase();
    
    keywords.forEach(keyword => {
      if (content.includes(keyword)) score += 2;
      if (path.includes(keyword)) score += 3;
    });
    
    if (score > 0) {
      const currentScore = fileScores.get(chunk.path) || 0;
      fileScores.set(chunk.path, currentScore + score);
    }
  });
  
  return Array.from(fileScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([file]) => file);
}

/**
 * 質問からキーワードを抽出
 */
function extractKeywordsFromQuestion(question: string): string[] {
  const stopWords = new Set([
    'は', 'を', 'が', 'に', 'で', 'て', 'です', 'ます', 'する', 'から',
    'とは', 'について', 'どの', 'どこ', '何', 'いつ', '？', '?'
  ]);
  
  return question
    .toLowerCase()
    .replace(/[？?。、，！!]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 2 && !stopWords.has(word))
    .slice(0, 5);
}

/**
 * 回答品質を推定
 */
function estimateAnswerQuality(relatedFilesCount: number): 'high' | 'medium' | 'low' {
  if (relatedFilesCount >= 3) return 'high';
  if (relatedFilesCount >= 1) return 'medium';
  return 'low';
}

/**
 * フォールバック質問を生成
 */
function generateFallbackQuestions(docChunks: DocChunk[]): QuestionCategory[] {
  const topics = extractTopicsFromPaths(docChunks);
  
  return [
    {
      category: '一般的な質問',
      icon: '💡',
      questions: [
        { question: 'このナレッジベースの概要は？', confidence: 0.7, relatedFiles: [], estimatedAnswerQuality: 'medium' },
        { question: '主な手順や方法について教えて', confidence: 0.6, relatedFiles: [], estimatedAnswerQuality: 'medium' },
        { question: '重要なポイントをまとめて', confidence: 0.6, relatedFiles: [], estimatedAnswerQuality: 'medium' },
        ...topics.slice(0, 3).map(topic => ({
          question: `${topic}について詳しく教えて`,
          confidence: 0.5,
          relatedFiles: [],
          estimatedAnswerQuality: 'low' as const
        }))
      ]
    }
  ];
}

/**
 * ファイルパスからトピックを抽出
 */
function extractTopicsFromPaths(docChunks: DocChunk[]): string[] {
  const pathWords = new Map<string, number>();
  
  docChunks.forEach(chunk => {
    const pathParts = chunk.path
      .replace(/\.(md|txt)$/, '')
      .split(/[\/\\]/)
      .flatMap(part => part.split(/[-_\s]/));
    
    pathParts.forEach(part => {
      if (part.length >= 3) {
        pathWords.set(part, (pathWords.get(part) || 0) + 1);
      }
    });
  });
  
  return Array.from(pathWords.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

/**
 * キャッシュキー生成
 */
function generateCacheKey(
  docChunks: DocChunk[],
  options: QuestionSuggestionOptions,
  userHistory: string[]
): string {
  const chunkHash = docChunks.length.toString();
  const optionsHash = JSON.stringify(options);
  const historyHash = userHistory.slice(-5).join('|');
  
  return `questions_${chunkHash}_${optionsHash}_${historyHash}`.replace(/\s/g, '_');
}

/**
 * キャッシュクリア
 */
export function clearQuestionCache(): void {
  questionCache.clear();
  cacheTimestamps.clear();
  console.log('🗑️ 質問候補キャッシュをクリアしました');
}

/**
 * キャッシュ統計取得
 */
export function getQuestionCacheStats(): { size: number; oldestEntry?: number } {
  const timestamps = Array.from(cacheTimestamps.values());
  const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : undefined;
  
  return {
    size: questionCache.size,
    oldestEntry
  };
}