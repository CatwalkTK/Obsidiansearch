
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Message, ApiProvider, DocChunk } from './types';
import { getGeminiAnswer } from './services/geminiService';
import { getOpenAIAnswer } from './services/openaiService';
import { generateEmbeddings } from './services/embeddingService';
import { cosineSimilarity } from './utils/vectorUtils';
import VaultUpload from './components/VaultUpload';
import ChatInterface from './components/ChatInterface';

// チャンク化の定数
const MAX_CHUNK_SIZE = 1500; // 文字
const CHUNK_OVERLAP = 200;  // 文字

/**
 * ドキュメントをより小さく、重複するチャンクに分割します。
 * @param text - ドキュメントのコンテンツ。
 * @returns テキストチャンクの配列。
 */
const chunkText = (text: string): string[] => {
    const chunks: string[] = [];
    if (text.length <= MAX_CHUNK_SIZE) {
        return [text];
    }
    
    let i = 0;
    while (i < text.length) {
        const chunk = text.substring(i, i + MAX_CHUNK_SIZE);
        chunks.push(chunk);
        i += MAX_CHUNK_SIZE - CHUNK_OVERLAP;
    }
    return chunks;
};

/**
 * 日本語の質問から助詞などのストップワードを除去し、キーワードを抽出します。
 * @param question ユーザーの質問文字列。
 * @returns キーワードの配列。
 */
const extractKeywords = (question: string): string[] => {
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
  const processed = question.normalize('NFKC').toLowerCase().replace(stopWordsRegex, ' ').trim();

  // 連続するスペースを一つにまとめ、スペースで分割してキーワードの配列を作成
  const keywords = processed.split(/\s+/).filter(kw => kw.length > 0);
  
  // もしキーワードが抽出できなかった場合（非常に短い質問など）、元の質問を返す
  if (keywords.length === 0 && question.trim().length > 0) {
      return [question.trim().normalize('NFKC').toLowerCase()];
  }

  return keywords;
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
  const keywords = extractKeywords(question);
  const MAX_CONTEXT_CHARS = 10000;

  const scoredChunks = docChunks.map(chunk => {
    const normalizedPath = chunk.path.normalize('NFKC').toLowerCase();
    const normalizedContent = chunk.content.normalize('NFKC').toLowerCase();

    // 1. Path Score (ファイルパスとキーワードの一致度)
    let pathScore = 0;
    if (keywords.length > 0) {
        pathScore = keywords.reduce((acc, keyword) => 
            acc + (normalizedPath.includes(keyword) ? 1 : 0), 0);
    }
    
    // 2. Semantic Score (意味の近さ)
    const semanticScore = cosineSimilarity(questionEmbedding, chunk.vector);

    // 3. Content Score (本文とキーワードの一致度)
    let contentScore = 0;
    if (keywords.length > 0) {
        contentScore = keywords.reduce((acc, keyword) => 
            acc + (normalizedContent.includes(keyword) ? 1 : 0), 0);
    }

    // 各スコアの重み付け。パススコアを最も重要視する。
    const pathWeight = 1.5;
    const semanticWeight = 1.0;
    const contentWeight = 0.5;

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
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const handleError = useCallback((errorMessage: string) => {
      setError(errorMessage);
      setIsProcessing(false);
      setTimeout(() => setError(null), 5000);
  }, []);

  const handleSendMessage = useCallback(async (question: string) => {
    if (!docChunks || !apiConfig) {
      setError("VaultのチャンクまたはAPI設定が読み込まれていません。");
      return;
    }

    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    
    const newUserMessage: Message = { id: Date.now().toString(), role: 'user', content: question };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);
    setError(null);
    
    const conversationHistory = [...messages, newUserMessage];

    try {
      let context: string | null = null;
      const isGenericFollowUp = /^(詳細|詳しく|もっと|なぜ|どうして|他には|それで|その後|つまり|要するに|というのは)/i.test(question.trim());

      if (isGenericFollowUp && lastQueryContext) {
        context = lastQueryContext;
      } else {
        let searchQuery = question;
        if (/(今日|today)/i.test(question)) {
            const today = new Date();
            const year = today.getFullYear();
            const month = today.getMonth() + 1;
            const day = today.getDate();
            const dateFormats = [`${month}.${day}`, `${month}-${day}`, `${month}月${day}日`, `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, `${year}年${month}月${day}日`, `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`];
            searchQuery = `${question} ${dateFormats.join(' ')}`;
        }
        const questionEmbedding = (await generateEmbeddings([searchQuery], apiConfig.provider, apiConfig.key, () => {}))[0];
        const newContext = createContext(searchQuery, questionEmbedding, docChunks);
        context = newContext;
        setLastQueryContext(newContext);
      }

      if (!context) {
        const noContextMessage: Message = { id: Date.now().toString(), role: 'model', content: "提供されたVaultの情報の中から、その質問に対する回答を見つけることができませんでした。" };
        setMessages(prev => [...prev, noContextMessage]);
        setLastQueryContext(null);
        setIsLoading(false);
        return;
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

  // --- SpeechRecognitionの初期化 ---
  useEffect(() => {
    if (!SpeechRecognitionAPI) {
      console.warn("このブラウザはWeb Speech APIをサポートしていません。");
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
        switch (event.error) {
            case 'network':
                errorMessage = '音声認識に失敗しました。インターネット接続を確認するか、しばらくしてからもう一度お試しください。';
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
                return;
            case 'audio-capture':
                errorMessage = 'マイクからの音声取得に失敗しました。マイクが正しく接続されているか確認してください。';
                break;
        }
        handleError(errorMessage);
        setIsRecording(false);
    };
    recognitionRef.current = recognition;
  }, [handleError, handleSendMessage]);

  const handleToggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      if (isLoading) return;
      if (!navigator.onLine) {
          handleError("音声認識にはインターネット接続が必要です。");
          return;
      }
      setInput('');
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
            { id: Date.now().toString(), role: 'model', content: `こんにちは！Vaultから${files.length}個のファイルを処理し、${newDocChunks.length}個の知識チャンクを準備しました。何を知りたいですか？` }
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
        />
      )}
    </div>
  );
};

export default App;
