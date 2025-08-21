import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { ApiProvider } from "../types";

const BATCH_SIZE = 50; // 1回のAPI呼び出しで埋め込むテキストの数

async function getOpenAIEmbeddings(apiKey: string, texts: string[]): Promise<number[][]> {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: texts,
        });
        return response.data.map(embedding => embedding.embedding);
    } catch (error) {
        console.error("OpenAI embedding failed:", error);
        throw new Error("OpenAIでの埋め込み生成に失敗しました。");
    }
}

async function getGeminiEmbeddings(apiKey: string, texts: string[]): Promise<number[][]> {
    const ai = new GoogleGenAI({ apiKey });
    
    try {
        const embeddings: number[][] = [];
        
        // 個別にバッチ処理
        for (const text of texts) {
            const result = await ai.models.embedContent({
                model: "text-embedding-004",
                contents: [{ parts: [{ text }] }]
            });
            
            if (result.embeddings && result.embeddings[0] && result.embeddings[0].values) {
                embeddings.push(result.embeddings[0].values);
            } else {
                console.warn('埋め込み生成に失敗:', text.substring(0, 50));
                // ダミーベクトルで継続（768次元）
                embeddings.push(new Array(768).fill(0));
            }
        }
        
        return embeddings;
    } catch (error) {
        console.error("Gemini embedding failed:", error);
        throw new Error("Geminiでの埋め込み生成に失敗しました: " + (error instanceof Error ? error.message : 'Unknown error'));
    }
}

/**
 * 指定されたプロバイダーを使用して、テキストのリストの埋め込みを生成します。
 * APIへの過負荷を避けるためにバッチ処理を扱います。
 * @param texts - 埋め込む文字列の配列。
 * @param provider - APIプロバイダー（'gemini'または'openai'）。
 * @param apiKey - プロバイダーのAPIキー。
 * @param onProgress - 進捗を報告するためのコールバック（0から1）。
 * @returns ベクトル埋め込みの配列に解決されるプロミス。
 */
export async function generateEmbeddings(
  texts: string[],
  provider: ApiProvider,
  apiKey: string,
  onProgress: (progress: number) => void
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    
    let batchEmbeddings: number[][];
    if (provider === 'gemini') {
        batchEmbeddings = await getGeminiEmbeddings(apiKey, batch);
    } else {
        batchEmbeddings = await getOpenAIEmbeddings(apiKey, batch);
    }
    
    allEmbeddings.push(...batchEmbeddings);
    
    const progress = Math.min((i + BATCH_SIZE) / texts.length, 1);
    onProgress(progress);
  }
  return allEmbeddings;
}
