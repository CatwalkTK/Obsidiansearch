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
    // このタスクには 'text-embedding-004' のような埋め込みモデルを使用します
    const model = "text-embedding-004";
    
    try {
        const response = await ai.models.embedContent({
            model: model,
            contents: texts.map(text => ({ parts: [{ text }] })),
        });
        return response.embeddings?.map(embedding => embedding.values).filter((values): values is number[] => values !== undefined) || [];
    } catch (error) {
        console.error("Gemini embedding failed:", error);
        throw new Error("Geminiでの埋め込み生成に失敗しました。");
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
