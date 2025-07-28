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

  const createMarkup = () => {
    if (isModel && message.content) {
      const rawMarkup = marked.parse(message.content, { async: false }) as string;
      return { __html: rawMarkup };
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
                dangerouslySetInnerHTML={createMarkup()}
            />
        ) : (
            <p className="text-white whitespace-pre-wrap">{message.content}</p>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;