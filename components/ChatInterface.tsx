
import React, { useRef, useEffect } from 'react';
import { Message } from '../types';
import ChatMessage from './ChatMessage';
import { MicrophoneIcon, SpeakerOnIcon, SpeakerOffIcon } from '../constants';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  fileCount: number;
  input: string;
  onInputChange: (value: string) => void;
  isRecording: boolean;
  onToggleRecording: () => void;
  isTtsEnabled: boolean;
  onTtsToggle: () => void;
  speakingMessageIndex: number | null;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, onSendMessage, isLoading, fileCount,
  input, onInputChange, isRecording, onToggleRecording,
  isTtsEnabled, onTtsToggle, speakingMessageIndex
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      onInputChange('');
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      <header className="flex-shrink-0 bg-gray-800/50 backdrop-blur-sm p-4 border-b border-gray-700 flex justify-between items-center">
          <div className="w-10"></div> {/* Spacer */}
          <div className="text-center">
            <h1 className="text-xl font-bold">Obsidian Vault AI</h1>
            <p className="text-sm text-gray-400">{fileCount}個のマークダウンファイルをコンテキストとして読み込みました。</p>
          </div>
          <button 
            onClick={onTtsToggle} 
            className="p-2 rounded-full hover:bg-gray-700 transition-colors text-white"
            aria-label={isTtsEnabled ? "音声読み上げをオフにする" : "音声読み上げをオンにする"}
            >
            {isTtsEnabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
          </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {messages.map((msg, index) => (
            <ChatMessage key={msg.id} message={msg} isSpeaking={speakingMessageIndex === index} />
          ))}
          {isLoading && messages.length > 0 && messages[messages.length-1].role === 'user' && (
            <div className="flex items-start gap-4 my-4">
              <div className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-indigo-600">
                <div className="h-6 w-6 animate-pulse"><div className="w-2 h-2 bg-white rounded-full mx-auto mt-2"></div></div>
              </div>
              <div className="relative px-4 py-3 rounded-xl bg-gray-700">
                <p className="text-white italic">考え中...</p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="flex-shrink-0 p-4 bg-gray-800/80 border-t border-gray-700">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? "話してください..." : "ノートについて質問を入力..."}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            disabled={isLoading}
          />
          <button
            onClick={onToggleRecording}
            disabled={isLoading}
            className="p-3 bg-gray-700 rounded-full hover:bg-gray-600 disabled:opacity-50 transition-colors"
            aria-label={isRecording ? "録音を停止" : "音声入力"}
          >
            <MicrophoneIcon isRecording={isRecording} />
          </button>
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-indigo-600 text-white font-semibold rounded-lg px-6 py-3 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            送信
          </button>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;