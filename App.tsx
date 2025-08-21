
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Message, ApiProvider, DocChunk } from './types';
import { getGeminiAnswer } from './services/geminiService';
import { getOpenAIAnswer } from './services/openaiService';
import { generateEmbeddings } from './services/embeddingService';
import { cosineSimilarity } from './utils/vectorUtils';
import { searchExternalData } from './services/externalDataService';
// 手動同義語辞書は削除済み - AI動的同義語生成に完全移行
import { createAIExpandedQuery } from './services/dynamicSynonymService';
import VaultUpload from './components/VaultUpload';
import ChatInterface from './components/ChatInterface';

// チャンク化の定数 - 日付検索の精度向上のため調整
const MAX_CHUNK_SIZE = 1200; // 文字（短くしてより細かい検索を可能に）
const CHUNK_OVERLAP = 300;  // 文字（重複を増やして情報の欠落を防止）

/**
 * ドキュメントを意味的な単位で分割し、重複するチャンクに分割します。
 * @param text - ドキュメントのコンテンツ。
 * @returns テキストチャンクの配列。
 */
const chunkText = (text: string): string[] => {
    const chunks: string[] = [];
    if (text.length <= MAX_CHUNK_SIZE) {
        return [text.trim()];
    }
    
    // 改行でパラグラフに分割
    const paragraphs = text.split(/\n\s*\n/);
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
        const trimmedParagraph = paragraph.trim();
        if (!trimmedParagraph) continue;
        
        // 現在のチャンクに追加できるかチェック
        if (currentChunk.length + trimmedParagraph.length + 2 <= MAX_CHUNK_SIZE) {
            currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph;
        } else {
            // 現在のチャンクを保存
            if (currentChunk) {
                chunks.push(currentChunk);
            }
            
            // パラグラフが大きすぎる場合は文単位で分割
            if (trimmedParagraph.length > MAX_CHUNK_SIZE) {
                const sentences = trimmedParagraph.split(/[.｡。!?！？]\s*/);
                let sentenceChunk = '';
                
                for (const sentence of sentences) {
                    const trimmedSentence = sentence.trim();
                    if (!trimmedSentence) continue;
                    
                    if (sentenceChunk.length + trimmedSentence.length + 1 <= MAX_CHUNK_SIZE) {
                        sentenceChunk += (sentenceChunk ? ' ' : '') + trimmedSentence;
                    } else {
                        if (sentenceChunk) {
                            chunks.push(sentenceChunk);
                        }
                        // 文が長すぎる場合は強制分割
                        if (trimmedSentence.length > MAX_CHUNK_SIZE) {
                            let pos = 0;
                            while (pos < trimmedSentence.length) {
                                const chunk = trimmedSentence.substring(pos, pos + MAX_CHUNK_SIZE);
                                chunks.push(chunk);
                                pos += MAX_CHUNK_SIZE - CHUNK_OVERLAP;
                            }
                            sentenceChunk = '';
                        } else {
                            sentenceChunk = trimmedSentence;
                        }
                    }
                }
                if (sentenceChunk) {
                    currentChunk = sentenceChunk;
                } else {
                    currentChunk = '';
                }
            } else {
                currentChunk = trimmedParagraph;
            }
        }
    }
    
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    
    return chunks.filter(chunk => chunk.trim().length > 0);
};

/**
 * 日本語の質問から助詞などのストップワードを除去し、キーワードを抽出します。
 * @param question ユーザーの質問文字列。
 * @returns キーワードの配列。
 */
const extractKeywords = (question: string): string[] => {
  const normalized = question.normalize('NFKC').toLowerCase();
  console.log('🔍 キーワード抽出開始:', question, '→', normalized);
  
  // まず日付表現を抽出・保護する
  const datePatterns = [
    // 月日パターン（1月1日、12月31日など）
    /(\d{1,2}月\d{1,2}日)/g,
    // 年月日パターン（2024年9月5日など）
    /(\d{4}年\d{1,2}月\d{1,2}日)/g,
    // スラッシュ区切り（2024/9/5、9/5など）
    /(\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2})/g,
    // ハイフン区切り（2024-09-05、9-5など）
    /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}-\d{1,2})/g,
    // ドット区切り（2024.9.5、9.5など）
    /(\d{4}\.\d{1,2}\.\d{1,2}|\d{1,2}\.\d{1,2})/g
  ];

  const protectedDates: string[] = [];
  let processedQuestion = normalized;
  
  // 日付表現を特別なトークンで置換して保護
  datePatterns.forEach((pattern, index) => {
    processedQuestion = processedQuestion.replace(pattern, (match) => {
      const token = `__DATE_${index}_${protectedDates.length}__`;
      protectedDates.push(match);
      return token;
    });
  });

  // 日本語の一般的な助詞、助動詞、記号などのストップワードリスト
  const stopWords = new Set([
    'の', 'に', 'は', 'を', 'が', 'で', 'て', 'ます', 'です', 'ある', 'いる', 'する',
    'から', 'まで', 'とも', 'として', 'もの', 'こと', 'という', 'といった', 'について',
    '関して', '対して', 'ため', 'よう', 'みたい', 'らしい', 'なら', 'そして', 'また',
    'しかし', 'それで', 'なお', 'および', 'あるいは', 'または', 'かつ',
    'ください', 'おしえ', '教え', '何', 'どの', 'どこ', '誰', 'いつ',
    '、', '。', '？', '！', '「', '」', '（', '）', ' ', '　'
  ]);

  const stopWordsRegex = new RegExp([...stopWords].join('|'), 'g');
  const processed = processedQuestion.replace(stopWordsRegex, ' ').trim();

  // スペースで分割してキーワードの配列を作成
  const keywords = processed.split(/\s+/).filter(kw => kw.length > 0);
  
  // 保護されたトークンを元の日付表現に戻す
  const finalKeywords = keywords.map(keyword => {
    if (keyword.startsWith('__DATE_')) {
      const match = keyword.match(/__DATE_\d+_(\d+)__/);
      if (match) {
        const index = parseInt(match[1]);
        return protectedDates[index] || keyword;
      }
    }
    return keyword;
  });

  // もしキーワードが抽出できなかった場合、元の質問を返す
  if (finalKeywords.length === 0 && question.trim().length > 0) {
      console.log('⚠️ キーワード抽出失敗、元の質問を使用:', [normalized]);
      return [normalized];
  }

  console.log('✅ 抽出されたキーワード:', finalKeywords);
  return finalKeywords;
};

/**
 * 日付表現の様々なバリエーションを生成します。
 * @param dateStr 元の日付文字列（例: "9月5日"）
 * @returns 日付の様々な表現形式の配列
 */
const generateDateVariations = (dateStr: string): string[] => {
  const variations = new Set<string>([dateStr]);
  
  // "9月5日"のような形式をパース
  const japaneseDate = dateStr.match(/(\d{1,2})月(\d{1,2})日/);
  if (japaneseDate) {
    const month = japaneseDate[1];
    const day = japaneseDate[2];
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    
    // 様々な形式を生成
    variations.add(`${month}月${day}日`);
    variations.add(`${paddedMonth}月${paddedDay}日`);
    variations.add(`${month}/${day}`);
    variations.add(`${paddedMonth}/${paddedDay}`);
    variations.add(`${month}-${day}`);
    variations.add(`${paddedMonth}-${paddedDay}`);
    variations.add(`${month}.${day}`);
    variations.add(`${paddedMonth}.${paddedDay}`);
    
    // 年を含む可能性も考慮（現在年を想定）
    const currentYear = new Date().getFullYear();
    variations.add(`${currentYear}年${month}月${day}日`);
    variations.add(`${currentYear}/${month}/${day}`);
    variations.add(`${currentYear}/${paddedMonth}/${paddedDay}`);
    variations.add(`${currentYear}-${paddedMonth}-${paddedDay}`);
    variations.add(`${currentYear}.${paddedMonth}.${paddedDay}`);
    
    // 前年も考慮
    variations.add(`${currentYear-1}年${month}月${day}日`);
    variations.add(`${currentYear-1}/${month}/${day}`);
    variations.add(`${currentYear-1}/${paddedMonth}/${paddedDay}`);
    variations.add(`${currentYear-1}-${paddedMonth}-${paddedDay}`);
  }
  
  return Array.from(variations);
};

/**
 * 「統合的スコアリング」を使用して、質問に最適なコンテキストを生成します。
 * @param question ユーザーの元の質問。
 * @param questionEmbedding 質問のベクトル。
 * @param docChunks Vault内の全ドキュメントチャンク。
 * @returns AIに渡すためのコンテキスト文字列、またはnull。
 */
const createContext = (
  question: string,
  questionEmbedding: number[],
  docChunks: DocChunk[]
): string | null => {
  // AI同義語システムに移行済み - キーワード抽出のみ使用
  const keywords = extractKeywords(question);
  const MAX_CONTEXT_CHARS = 10000;

  const scoredChunks = docChunks.map(chunk => {
    const normalizedPath = chunk.path.normalize('NFKC').toLowerCase();
    const normalizedContent = chunk.content.normalize('NFKC').toLowerCase();

    // 1. Path Score (ファイルパスとキーワードの一致度)
    let pathScore = 0;
    if (keywords.length > 0) {
        pathScore = keywords.reduce((acc, keyword) => {
            // 日付表現の場合は、様々な形式でマッチングを試行
            if (keyword.includes('月') && keyword.includes('日')) {
                const dateVariations = generateDateVariations(keyword);
                const hasMatch = dateVariations.some(variation => normalizedPath.includes(variation));
                if (chunk.path.includes('9月5日') || chunk.path.includes('授業')) {
                    console.log('🎯 日付ファイルチェック:', {
                        path: chunk.path,
                        keyword,
                        dateVariations,
                        hasMatch,
                        normalizedPath
                    });
                }
                if (hasMatch) {
                    // 日付がファイルパスに完全一致する場合は非常に高いスコア
                    return acc + 5; // 通常の2.5倍
                }
                return acc;
            }
            return acc + (normalizedPath.includes(keyword) ? 1 : 0);
        }, 0);
    }
    
    // 2. Semantic Score (意味の近さ)
    const semanticScore = cosineSimilarity(questionEmbedding, chunk.vector);

    // 3. Content Score (本文とキーワードの一致度)
    let contentScore = 0;
    if (keywords.length > 0) {
        contentScore = keywords.reduce((acc, keyword) => {
            // 日付表現の場合は、様々な形式でマッチングを試行
            if (keyword.includes('月') && keyword.includes('日')) {
                const dateVariations = generateDateVariations(keyword);
                const hasMatch = dateVariations.some(variation => normalizedContent.includes(variation));
                if (hasMatch) {
                    // 日付がコンテンツに一致する場合は高いスコア
                    return acc + 3; // 通常の1.5倍
                }
                return acc;
            }
            return acc + (normalizedContent.includes(keyword) ? 1 : 0);
        }, 0);
    }

    // 各スコアの重み付け。セマンティック検索を重視しつつパスも考慮
    const pathWeight = 1.5; // パスの重要度を下げてバランスを改善
    const semanticWeight = 2.0; // 意味的検索を最重要視
    const contentWeight = 1.2; // コンテンツスコアも重視

    const finalScore = (pathScore * pathWeight) + (semanticScore * semanticWeight) + (contentScore * contentWeight);
    
    return {
      chunk,
      finalScore,
    };
  });

  // 最終的な統合スコアで全チャンクをランク付け
  const rankedChunks = scoredChunks.sort((a, b) => b.finalScore - a.finalScore);

  const TOP_K_FINAL = 10;
  const relevantChunks = rankedChunks.slice(0, TOP_K_FINAL);

  if (relevantChunks.length === 0) {
    return null;
  }

  // セマンティックスコアと統合スコアの両方で判定
  // 承認機能を確実に動作させるため、より厳格なしきい値を設定
  const isDateQuery = /(\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2}|\d{4}-\d{1,2}-\d{1,2})/i.test(question);
  
  // ベクター検索の精度を高めるためにしきい値を調整
  let MIN_SEMANTIC_THRESHOLD = 0.4; // セマンティック類似度の最小値を緩和
  let MIN_THRESHOLD_SCORE = 0.5; // 統合スコアの最小値を緩和
  
  // 日付クエリの特別判定: パスマッチングがあるかチェック
  if (isDateQuery) {
    const dateKeywords = keywords.filter(k => k.includes('月') && k.includes('日'));
    const hasDatePathMatch = dateKeywords.some(dateKeyword => {
      const dateVariations = generateDateVariations(dateKeyword);
      return relevantChunks.some(item => 
        dateVariations.some(variation => item.chunk.path.toLowerCase().includes(variation.toLowerCase()))
      );
    });
    
    if (hasDatePathMatch) {
      // 日付ファイルが存在する場合は緩和した判定
      MIN_SEMANTIC_THRESHOLD = 0.1;
      MIN_THRESHOLD_SCORE = 0.3;
      console.log('📅 日付ファイルマッチあり - 緩和した判定を適用');
    } else {
      // 日付ファイルが存在しない場合は通常の判定
      console.log('❌ 日付ファイルマッチなし - 通常の判定を適用');
    }
  }
  
  const bestChunk = relevantChunks[0];
  const bestSemanticScore = cosineSimilarity(questionEmbedding, bestChunk.chunk.vector);
  
  // デバッグ用ログ（開発時のみ）
  console.log('📊 検索結果分析:');
  console.log(`質問: "${question}"`);
  console.log(`抽出キーワード:`, keywords);
  console.log(`日付クエリ判定: ${isDateQuery}`);
  console.log(`最高統合スコア: ${bestChunk.finalScore}, セマンティックスコア: ${bestSemanticScore}`);
  console.log(`最高スコアファイル: ${bestChunk.chunk.path}`);
  console.log(`しきい値 - 統合: ${MIN_THRESHOLD_SCORE}, セマンティック: ${MIN_SEMANTIC_THRESHOLD}`);
  console.log(`統合スコア判定: ${bestChunk.finalScore >= MIN_THRESHOLD_SCORE}`);
  
  // 統合スコアが非常に高い場合はセマンティック要件を緩和
  const isHighScore = bestChunk.finalScore >= 5.0; // 非常に高いスコア
  const relaxedSemanticThreshold = isHighScore ? 0.05 : MIN_SEMANTIC_THRESHOLD;
  
  console.log(`セマンティック判定: ${bestSemanticScore >= relaxedSemanticThreshold} (緩和セマンティック: ${relaxedSemanticThreshold})`);
  console.log('🔝 トップ5チャンク:');
  relevantChunks.slice(0, 5).forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.chunk.path} (スコア: ${item.finalScore.toFixed(3)})`);
  });
  console.log(`最終判定: ${bestChunk.finalScore >= MIN_THRESHOLD_SCORE && bestSemanticScore >= relaxedSemanticThreshold ? 'コンテキスト採用' : '承認プロンプト表示'}`);
  
  if (bestChunk.finalScore < MIN_THRESHOLD_SCORE || bestSemanticScore < relaxedSemanticThreshold) {
    console.log(`❌ コンテキストなし → 承認プロンプト表示予定 (緩和セマンティック: ${relaxedSemanticThreshold})`);
    return null;
  }
  
  console.log('✅ コンテキスト採用 → AI回答生成');
  
  let context = "";
  // 重複を避けつつ、最も関連性の高いチャンクからコンテキストを構築
  const seenContents = new Set<string>();
  for (const { chunk } of relevantChunks) {
    const chunkString = `--- FILE: ${chunk.path} ---\n${chunk.content}\n\n`;
    if (!seenContents.has(chunkString)) {
        if (context.length + chunkString.length > MAX_CONTEXT_CHARS) {
            break;
        }
        context += chunkString;
        seenContents.add(chunkString);
    }
  }

  return context.trim().length > 0 ? context : null;
};

// Web Speech APIの型定義 (ブラウザの互換性のために定義)
interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
}

interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: (event: SpeechRecognitionEvent) => void;
    onstart: () => void;
    onend: () => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
}

interface SpeechRecognitionStatic {
    new (): SpeechRecognition;
}

declare global {
    interface Window {
        SpeechRecognition: SpeechRecognitionStatic;
        webkitSpeechRecognition: SpeechRecognitionStatic;
    }
}

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

const App: React.FC = () => {
  const [docChunks, setDocChunks] = useState<DocChunk[] | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [apiConfig, setApiConfig] = useState<{ provider: ApiProvider; key: string } | null>(null);
  const [lastQueryContext, setLastQueryContext] = useState<string | null>(null);

  // --- 音声機能用 ---
  const [input, setInput] = useState('');
  const [isTtsEnabled, setIsTtsEnabled] = useState(false);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recognitionRetryCount, setRecognitionRetryCount] = useState(0);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const handleError = useCallback((errorMessage: string) => {
      setError(errorMessage);
      setIsProcessing(false);
      setTimeout(() => setError(null), 5000);
  }, []);

  const handleSendMessage = useCallback(async (question: string) => {
    if (!docChunks || !apiConfig) {
      setError("社内ナレッジのチャンクまたはAPI設定が読み込まれていません。");
      return;
    }

    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    
    const newUserMessage: Message = { id: Date.now().toString(), role: 'user', content: question };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);
    setError(null);
    
    // フォローアップ質問の判定
    const isGenericFollowUp = /^(詳細|詳しく|もっと|なぜ|どうして|他には|それで|その後|つまり|要するに|というのは)/i.test(question.trim());
    
    // システムメッセージ（承認プロンプト等）と承認拒否メッセージを会話履歴から除外
    const filteredMessages = messages.filter(msg => 
      msg.role !== 'system' && 
      !(msg.role === 'model' && msg.requiresExternalDataConfirmation === false)
    );
    
    // 各質問を独立して処理するため、会話履歴を最近の数回に制限
    // または、フォローアップ質問でない場合は単独の質問として処理
    let conversationHistory: Message[];
    
    if (isGenericFollowUp) {
      // フォローアップ質問の場合は直近の会話を含める（最大3往復）
      const recentMessages = filteredMessages.slice(-6);
      conversationHistory = [...recentMessages, newUserMessage];
      console.log('フォローアップ質問として処理 - 直近の会話履歴を使用');
    } else {
      // 独立した質問の場合は、現在の質問のみで処理
      conversationHistory = [newUserMessage];
      console.log('独立した質問として処理 - 会話履歴なし');
    }
    
    console.log(`元の会話履歴数: ${messages.length}, フィルタリング後: ${filteredMessages.length}, AIに送信: ${conversationHistory.length}`);
    console.log('AIに送信される会話履歴:', conversationHistory.map(m => `${m.role}: ${m.content.substring(0, 50)}...`));

    try {
      let context: string | null = null;

      if (isGenericFollowUp && lastQueryContext) {
        context = lastQueryContext;
      } else {
        let searchQuery = question;
        
        // 今日の日付処理
        if (/(今日|today)/i.test(question)) {
            const today = new Date();
            const year = today.getFullYear();
            const month = today.getMonth() + 1;
            const day = today.getDate();
            const dateFormats = [`${month}.${day}`, `${month}-${day}`, `${month}月${day}日`, `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, `${year}年${month}月${day}日`, `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`];
            searchQuery = `${question} ${dateFormats.join(' ')}`;
        } else {
            // AI同義語拡張クエリを作成（非同期で高速化）
            try {
                searchQuery = await createAIExpandedQuery(question, apiConfig.provider, apiConfig.key);
            } catch (error) {
                console.warn('AI同義語生成エラー:', error);
                // フォールバック: 元のクエリをそのまま使用
                console.log('⚠️ AI同義語生成失敗 - 元のクエリを使用:', question);
                searchQuery = question;
            }
        }
        
        // 日付表現が含まれる場合、より包括的な検索クエリを作成
        const dateMatch = question.match(/(\d{1,2})月(\d{1,2})日/);
        if (dateMatch) {
            const dateVariations = generateDateVariations(dateMatch[0]);
            searchQuery = `${question} ${dateVariations.join(' ')}`;
        }
        const questionEmbedding = (await generateEmbeddings([searchQuery], apiConfig.provider, apiConfig.key, () => {}))[0];
        const newContext = createContext(question, questionEmbedding, docChunks);
        context = newContext;
        setLastQueryContext(newContext);
      }

      if (!context) {
        console.log('メインロジック: コンテキストが見つからないため承認プロンプトを表示');
        // 承認プロンプトを表示
        const confirmationMessage: Message = {
          id: Date.now().toString(),
          role: 'system',
          content: '',
          requiresExternalDataConfirmation: true,
          originalQuestion: question
        };
        console.log('承認プロンプトメッセージを追加:', confirmationMessage);
        setMessages(prev => {
          const updated = [...prev, confirmationMessage];
          console.log('メッセージ配列更新後:', updated.length, '件');
          return updated;
        });
        setLastQueryContext(null);
        setIsLoading(false);
        return;
      } else {
        console.log('メインロジック: コンテキストが見つかったためAIに送信');
      }
      
      let answer = '';
      if (apiConfig.provider === 'gemini') {
          answer = await getGeminiAnswer(apiConfig.key, context, conversationHistory);
      } else {
          answer = await getOpenAIAnswer(apiConfig.key, context, conversationHistory);
      }
      const newModelMessage: Message = { id: Date.now().toString(), role: 'model', content: answer };
      setMessages(prev => [...prev, newModelMessage]);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : '不明なエラーが発生しました。';
      setError(`回答の取得に失敗しました: ${errorMessage}`);
      const newErrorMessage: Message = { id: Date.now().toString(), role: 'model', content: `申し訳ありません、エラーが発生しました: ${errorMessage}` };
      setMessages(prev => [...prev, newErrorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [docChunks, apiConfig, lastQueryContext, messages]);

  // 外部データ使用の承認ハンドラー
  const handleExternalDataApprove = useCallback(async (messageId: string) => {
    if (!apiConfig) return;
    
    const confirmationMessage = messages.find(msg => msg.id === messageId);
    if (!confirmationMessage?.originalQuestion) return;

    setIsLoading(true);
    
    try {
      // 承認メッセージを削除
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      
      // 外部データから回答を取得
      const answer = await searchExternalData(
        confirmationMessage.originalQuestion, 
        apiConfig.provider, 
        apiConfig.key
      );
      
      const newModelMessage: Message = { 
        id: Date.now().toString(), 
        role: 'model', 
        content: answer 
      };
      setMessages(prev => [...prev, newModelMessage]);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : '不明なエラーが発生しました。';
      setError(`外部データの取得に失敗しました: ${errorMessage}`);
      const newErrorMessage: Message = { 
        id: Date.now().toString(), 
        role: 'model', 
        content: `申し訳ありません、外部データの取得中にエラーが発生しました: ${errorMessage}` 
      };
      setMessages(prev => [...prev, newErrorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, apiConfig, setError]);

  // 外部データ使用の拒否ハンドラー
  const handleExternalDataDecline = useCallback((messageId: string) => {
    // 承認メッセージを削除し、通常の"見つかりません"メッセージに置き換える
    setMessages(prev => prev.filter(msg => msg.id !== messageId));
    
    const noContextMessage: Message = { 
      id: Date.now().toString(), 
      role: 'model', 
      content: "提供された社内ナレッジの情報の中から、その質問に対する回答を見つけることができませんでした。",
      requiresExternalDataConfirmation: false // 承認拒否メッセージであることを示すフラグ
    };
    setMessages(prev => [...prev, noContextMessage]);
  }, []);

  // --- SpeechRecognitionの初期化 ---
  useEffect(() => {
    if (!SpeechRecognitionAPI) {
      console.warn("このブラウザはWeb Speech APIをサポートしていません。");
      return;
    }
    
    // GitHub Codespacesなどでは音声認識が機能しない場合があるため、
    // 一時的に無効化
    if (window.location.hostname.includes('github.dev') || 
        window.location.hostname.includes('gitpod.io') || 
        window.location.hostname.includes('codespaces')) {
      console.warn("開発環境では音声認識を無効化しています。");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'ja-JP';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }
        setInput(transcript);

        if (event.results[event.results.length - 1].isFinal) {
            const finalTranscript = transcript.trim();
            if (finalTranscript) {
                handleSendMessage(finalTranscript);
                setInput('');
            }
        }
    };

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("SpeechRecognition error:", event.error);
        let errorMessage = `音声認識で予期せぬエラーが発生しました: ${event.error}`;
        let shouldRetry = false;
        
        switch (event.error) {
            case 'network':
                if (recognitionRetryCount < 2) {
                    shouldRetry = true;
                    setRecognitionRetryCount(prev => prev + 1);
                    console.log(`Network error, retrying... (${recognitionRetryCount + 1}/3)`);
                    setTimeout(() => {
                        try {
                            recognitionRef.current?.start();
                        } catch (e) {
                            console.error("Retry failed:", e);
                            handleError('音声認識の再試行に失敗しました。手動で入力してください。');
                            setIsRecording(false);
                        }
                    }, 1000);
                    return;
                } else {
                    errorMessage = '音声認識に失敗しました。ネットワーク接続が不安定です。手動で入力してください。';
                }
                break;
            case 'not-allowed':
            case 'service-not-allowed':
                errorMessage = 'マイクの使用が許可されていません。ブラウザの設定を確認してください。';
                break;
            case 'no-speech':
                errorMessage = '音声が検出されませんでした。マイクに向かって話してください。';
                break;
            case 'aborted':
                // User aborted the recognition, no error message needed.
                setIsRecording(false);
                setRecognitionRetryCount(0);
                return;
            case 'audio-capture':
                errorMessage = 'マイクからの音声取得に失敗しました。マイクが正しく接続されているか確認してください。';
                break;
        }
        
        if (!shouldRetry) {
            handleError(errorMessage);
            setIsRecording(false);
            setRecognitionRetryCount(0);
        }
    };
    recognitionRef.current = recognition;
  }, [handleError, handleSendMessage, recognitionRetryCount]);

  const handleToggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setRecognitionRetryCount(0);
    } else {
      if (isLoading) return;
      if (!navigator.onLine) {
          handleError("音声認識にはインターネット接続が必要です。手動で入力してください。");
          return;
      }
      setInput('');
      setRecognitionRetryCount(0);
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error("Could not start recognition", e);
        handleError("音声認識を開始できませんでした。マイクの権限を確認してください。");
      }
    }
  };

  // --- Text-to-Speech ---
  useEffect(() => {
    if (!isTtsEnabled) {
      window.speechSynthesis.cancel();
      setSpeakingMessageIndex(null);
      return;
    }

    if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === 'model' && lastMessage.content && !isLoading) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(lastMessage.content);
          utterance.lang = 'ja-JP';
          utterance.onstart = () => setSpeakingMessageIndex(messages.length - 1);
          utterance.onend = () => setSpeakingMessageIndex(null);
          utterance.onerror = (e) => {
            console.error("SpeechSynthesis Error", e);
            setSpeakingMessageIndex(null);
            handleError("音声の読み上げに失敗しました。");
          };
          window.speechSynthesis.speak(utterance);
        }
    }
    
    return () => window.speechSynthesis.cancel();
  }, [messages, isTtsEnabled, isLoading, handleError]);

  
  const handleFilesSelected = useCallback(async (files: { path: string; content: string }[], provider: ApiProvider, key: string) => {
    setIsProcessing(true);
    setError(null);
    setApiConfig({ provider, key });
    setLastQueryContext(null);
    
    try {
        setProcessingMessage(`ファイルをチャンク化中 (${files.length}個)...`);
        const allTextChunks: { path: string; content: string }[] = [];
        for (const file of files) {
            if (!file.content || file.content.trim() === '') continue;
            const chunks = chunkText(file.content);
            for (const chunkContent of chunks) {
                if (chunkContent.trim() !== '') {
                    allTextChunks.push({ path: file.path, content: chunkContent });
                }
            }
        }
        
        if (allTextChunks.length === 0) {
            throw new Error("チャンク化できるコンテンツがファイル内に見つかりませんでした。");
        }

        const textsToEmbed = allTextChunks.map(chunk => chunk.content);
        setProcessingMessage(`埋め込みを生成中 (0%)...`);
        
        const embeddings = await generateEmbeddings(textsToEmbed, provider, key, (progress) => {
            setProcessingMessage(`埋め込みを生成中 (${Math.round(progress * 100)}%)...`);
        });

        const newDocChunks: DocChunk[] = allTextChunks.map((chunk, index) => ({
            ...chunk, vector: embeddings[index],
        }));

        setDocChunks(newDocChunks);
        setFileCount(files.length);
        setMessages([
            { id: Date.now().toString(), role: 'model', content: `こんにちは！社内ナレッジから${files.length}個のファイルを処理し、${newDocChunks.length}個の知識チャンクを準備しました。何を知りたいですか？` }
        ]);

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'ファイルの処理中に不明なエラーが発生しました。';
        handleError(errorMessage);
    } finally {
        setIsProcessing(false);
        setProcessingMessage('');
    }
  }, [handleError]);


  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex flex-col">
      {error && (
        <div className="absolute top-4 right-4 bg-red-600/90 text-white py-2 px-4 rounded-lg shadow-lg z-50">
          <p>{error}</p>
        </div>
      )}

      {!docChunks ? (
        <VaultUpload 
          onFilesSelected={handleFilesSelected} 
          onError={handleError}
          isProcessing={isProcessing}
          processingMessage={processingMessage}
        />
      ) : (
        <ChatInterface 
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          fileCount={fileCount}
          input={input}
          onInputChange={setInput}
          isRecording={isRecording}
          onToggleRecording={handleToggleRecording}
          isTtsEnabled={isTtsEnabled}
          onTtsToggle={() => setIsTtsEnabled(prev => !prev)}
          speakingMessageIndex={speakingMessageIndex}
          onExternalDataApprove={handleExternalDataApprove}
          onExternalDataDecline={handleExternalDataDecline}
        />
      )}
    </div>
  );
};

export default App;
