import React from 'react';
import { marked } from 'marked';
import { Message } from '../types';
import { BotIcon, UserIcon } from '../constants';
import ExternalDataPrompt from './ExternalDataPrompt';
import SummaryDisplay from './SummaryDisplay';

interface ChatMessageProps {
  message: Message;
  isSpeaking: boolean;
  onExternalDataApprove?: (messageId: string) => void;
  onExternalDataDecline?: (messageId: string) => void;
  onTopicClick?: (topic: string) => void;
  onFileClick?: (filePath: string) => void;
  docChunks?: import('../types').DocChunk[];
}

const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  isSpeaking, 
  onExternalDataApprove, 
  onExternalDataDecline,
  onTopicClick,
  onFileClick,
  docChunks
}) => {
  const isModel = message.role === 'model';
  const isSystem = message.role === 'system';

  const createSafeMarkup = () => {
    if (isModel && message.content) {
      // Configure marked with security options
      marked.setOptions({
        gfm: true,
        breaks: true,
        // Disable HTML rendering to prevent XSS
        renderer: new marked.Renderer()
      });

      // Create a custom renderer that strips HTML tags
      const renderer = new marked.Renderer();
      
      // Override HTML rendering methods to prevent XSS
      renderer.html = () => '';
      renderer.code = (options: { text: string, lang?: string }) => {
        const escapedCode = options.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre><code class="language-${options.lang || ''}">${escapedCode}</code></pre>`;
      };
      renderer.codespan = (options: { text: string }) => {
        const escapedCode = options.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<code>${escapedCode}</code>`;
      };

      const rawMarkup = marked.parse(message.content, { 
        async: false,
        renderer: renderer
      }) as string;
      
      // Additional HTML sanitization - remove potentially dangerous elements
      let sanitizedMarkup = rawMarkup
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^>]*>/gi, '')
        .replace(/<object\b[^>]*>/gi, '')
        .replace(/<embed\b[^>]*>/gi, '')
        .replace(/<form\b[^>]*>/gi, '')
        .replace(/<input\b[^>]*>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers
        .replace(/javascript:/gi, ''); // Remove javascript: URLs
      
      // ファイルパス部分をクリック可能にする
      if (onFileClick) {
        sanitizedMarkup = sanitizedMarkup.replace(
          /ファイル「([^」]+)」/g, 
          '<span class="file-reference cursor-pointer text-blue-400 hover:text-blue-300 underline" data-file-path="$1">ファイル「$1」</span>'
        );
      }

      return { __html: sanitizedMarkup };
    }
    return { __html: '' };
  };

  const speakingClass = isSpeaking ? 'ring-2 ring-indigo-500 shadow-lg' : '';

  // ファイル参照クリック処理
  const handleFileClick = (event: React.MouseEvent) => {
    if (!onFileClick || !docChunks) return;
    
    const target = event.target as HTMLElement;
    if (target.classList.contains('file-reference')) {
      const relativePath = target.getAttribute('data-file-path');
      if (relativePath) {
        // docChunksから相対パスに対応する絶対パスを検索
        const matchingChunk = docChunks.find(chunk => chunk.path === relativePath);
        const absolutePath = matchingChunk?.absolutePath || relativePath;
        onFileClick(absolutePath);
      }
    }
  };

  // システムメッセージ（承認プロンプト）の場合
  if (isSystem && message.requiresExternalDataConfirmation && message.originalQuestion) {
    console.log('承認プロンプト表示中:', message.originalQuestion);
    return (
      <ExternalDataPrompt
        question={message.originalQuestion}
        onApprove={() => onExternalDataApprove?.(message.id)}
        onDecline={() => onExternalDataDecline?.(message.id)}
      />
    );
  }

  return (
    <div className="my-4">
      <div className={`flex items-start gap-4 ${isModel ? '' : 'flex-row-reverse'}`}>
        <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${isModel ? 'bg-indigo-600' : 'bg-gray-600'}`}>
          {isModel ? <BotIcon /> : <UserIcon />}
        </div>
        <div className={`relative px-4 py-3 rounded-xl max-w-xl lg:max-w-2xl xl:max-w-3xl transition-all ${isModel ? 'bg-gray-700' : 'bg-indigo-700'} ${speakingClass}`}>
          {isModel ? (
              <div 
                  className="markdown-body"
                  dangerouslySetInnerHTML={createSafeMarkup()}
                  onClick={handleFileClick}
              />
          ) : (
              <p className="text-white whitespace-pre-wrap">{message.content}</p>
          )}
        </div>
      </div>
      
      {/* 要約表示 */}
      {message.summary && (
        <div className="mt-4 ml-12">
          <SummaryDisplay 
            summary={message.summary}
            onTopicClick={onTopicClick}
          />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;