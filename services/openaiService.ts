
import OpenAI from "openai";
import { Message } from '../types';

export async function getOpenAIAnswer(apiKey: string, context: string, conversationHistory: Message[]): Promise<string> {
    if (!apiKey) {
        throw new Error("OpenAI APIキーが提供されていません。");
    }

    const openai = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true, // ブラウザ環境での実行を許可
    });
    
    const systemInstruction = `あなたは、社内ナレッジのコンテンツから情報を抽出する、ルールベースのAIアシスタントです。あなたの仕事は、提供されたコンテキスト（テキストの断片）に*厳密に*基づいて、ユーザーの質問に答えることです。自由な解釈や推測はせず、以下のルールに厳密に従ってください。

  重要なルール:
  1.  **ファイルパスを最優先で確認**: 各コンテキストブロックは \`--- FILE: [ファイルパス] ---\` で始まります。このファイルパスは最も重要な情報源です。例えば、ユーザーが「7月18日の授業」について尋ねたら、まずファイルパスに「7月18日授業」という文字列が含まれるブロックを探してください。
  2.  **事実に基づく回答**:
      - 質問に対する答えがコンテキスト内に明確に存在する場合、その情報を引用して回答してください。
      - 完璧な答えが見つからなくても、関連する情報（特にファイルパスが質問と一致する場合）が見つかった場合は、「ファイル「[ファイルパス]」には次のように書かれています：[内容の要約]」という形式で、見つかった事実のみを報告してください。
  3.  **憶測の禁止**: 「～かもしれません」「～と推測できます」といった不確かな表現は絶対に使用しないでください。コンテキストに書かれていないことは、存在しないものとして扱ってください。
  4.  **「見つからない」場合の厳格な基準**: 「回答が見つかりませんでした」と応答するのは、提供されたどのコンテキストブロックも、ファイルパスと内容の両方において、質問と全く関連がない場合に限定されます。ファイルパスが一致するだけでも、それは関連情報です。
  5.  コンテキストに含まれる情報のみを使用し、外部の知識は一切使用しないでください。
  6.  元のテキストにマークダウン形式が使われている場合は、その書式を尊重し、回答にも適切に使用してください。`;

    const lastQuestion = conversationHistory[conversationHistory.length - 1].content;

    const userMessageWithContext = `関連性の高いテキストの断片からなるコンテキスト:
---
${context}
---

質問:
${lastQuestion}`;

    // Build the message history for the API call
    const messagesForApi: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { "role": "system", "content": systemInstruction },
        // Map previous messages, converting "model" role to "assistant"
        ...conversationHistory.slice(0, -1).map(msg => ({
            role: (msg.role === 'model' ? 'assistant' : msg.role) as 'user' | 'assistant',
            content: msg.content
        })),
        // Add the final user message, augmented with the retrieved context
        { "role": "user", "content": userMessageWithContext }
    ];


    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o", 
            messages: messagesForApi,
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
            return "AIから有効な回答を得られませんでした。";
        }
        return content;
    } catch (error) {
        console.error("OpenAI APIの呼び出し中にエラーが発生しました:", error);
        if (error instanceof Error) {
            return `AIとの通信中にエラーが発生しました: ${error.message}`;
        }
        return "AIとの通信中に不明なエラーが発生しました。";
    }
}
