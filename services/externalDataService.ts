import { ApiProvider } from '../types';
import { GoogleGenAI } from "@google/genai";
import OpenAI from 'openai';

// Geminiの一般知識回答関数
async function getGeminiAnswerFromGeneralKnowledge(apiKey: string, question: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const model = 'gemini-2.5-flash';

  const prompt = `以下の質問に対して、あなたの一般的な知識を使って回答してください。社内ナレッジには該当する情報がありませんでした。

質問: ${question}

※ 丁寧で分かりやすい回答をお願いします。`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    return response.text || "回答を生成できませんでした。";
  } catch (error) {
    console.error("Gemini APIの呼び出し中にエラーが発生しました:", error);
    throw error;
  }
}

// OpenAIの一般知識回答関数
async function getOpenAIAnswerFromGeneralKnowledge(apiKey: string, question: string): Promise<string> {
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const prompt = `以下の質問に対して、あなたの一般的な知識を使って回答してください。社内ナレッジには該当する情報がありませんでした。

質問: ${question}

※ 丁寧で分かりやすい回答をお願いします。`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || "回答を生成できませんでした。";
  } catch (error) {
    console.error("OpenAI APIの呼び出し中にエラーが発生しました:", error);
    throw error;
  }
}

export const searchExternalData = async (
  question: string,
  provider: ApiProvider,
  apiKey: string
): Promise<string> => {
  try {
    let answer = '';
    if (provider === 'gemini') {
      answer = await getGeminiAnswerFromGeneralKnowledge(apiKey, question);
    } else {
      answer = await getOpenAIAnswerFromGeneralKnowledge(apiKey, question);
    }
    
    return `${answer}\n\n---\n※ この回答は社内ナレッジ以外の一般的な知識に基づいています。`;
    
  } catch (error) {
    console.error('外部知識取得エラー:', error);
    return "申し訳ありませんが、外部の知識からの情報取得中にエラーが発生しました。";
  }
};