import React from 'react';
import { marked } from 'marked';
import { Message } from '../types';
import { BotIcon, UserIcon } from '../constants';

interface ChatMessageProps {
  message: Message;
  isSpeaking: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isSpeaking }) => {
  const isModel = message.role === 'model';

  const createSafeMarkup = () => {
    if (isModel && message.content) {
      // Configure marked with security options
      marked.setOptions({
        sanitize: false, // We'll handle sanitization separately
        gfm: true,
        breaks: true,
        // Disable HTML rendering to prevent XSS
        renderer: new marked.Renderer()
      });

      // Create a custom renderer that strips HTML tags
      const renderer = new marked.Renderer();
      
      // Override HTML rendering methods to prevent XSS
      renderer.html = () => '';
      renderer.code = (code: string, language?: string) => {
        const escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre><code class="language-${language || ''}">${escapedCode}</code></pre>`;
      };
      renderer.codespan = (code: string) => {
        const escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<code>${escapedCode}</code>`;
      };

      const rawMarkup = marked.parse(message.content, { 
        async: false,
        renderer: renderer
      }) as string;
      
      // Additional HTML sanitization - remove potentially dangerous elements
      const sanitizedMarkup = rawMarkup
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^>]*>/gi, '')
        .replace(/<object\b[^>]*>/gi, '')
        .replace(/<embed\b[^>]*>/gi, '')
        .replace(/<form\b[^>]*>/gi, '')
        .replace(/<input\b[^>]*>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers
        .replace(/javascript:/gi, ''); // Remove javascript: URLs

      return { __html: sanitizedMarkup };
    }
    return { __html: '' };
  };

  const speakingClass = isSpeaking ? 'ring-2 ring-indigo-500 shadow-lg' : '';

  return (
    <div className={`flex items-start gap-4 my-4 ${isModel ? '' : 'flex-row-reverse'}`}>
      <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${isModel ? 'bg-indigo-600' : 'bg-gray-600'}`}>
        {isModel ? <BotIcon /> : <UserIcon />}
      </div>
      <div className={`relative px-4 py-3 rounded-xl max-w-xl lg:max-w-2xl xl:max-w-3xl transition-all ${isModel ? 'bg-gray-700' : 'bg-indigo-700'} ${speakingClass}`}>
        {isModel ? (
            <div 
                className="markdown-body"
                dangerouslySetInnerHTML={createSafeMarkup()}
            />
        ) : (
            <p className="text-white whitespace-pre-wrap">{message.content}</p>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;