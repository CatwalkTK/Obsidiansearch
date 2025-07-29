import React, { useState, useRef } from 'react';
import { UploadIcon } from '../constants';
import { ApiProvider } from '../types';

interface VaultUploadProps {
  onFilesSelected: (files: { path: string, content: string }[], provider: ApiProvider, key: string) => void;
  onError: (errorMessage: string) => void;
  isProcessing: boolean;
  processingMessage: string;
}

interface FileWithRelativePath extends File {
  readonly webkitRelativePath: string;
}

const VaultUpload: React.FC<VaultUploadProps> = ({ onFilesSelected, onError, isProcessing, processingMessage }) => {
  const [provider, setProvider] = useState<ApiProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateApiKey = (key: string): boolean => {
    // Basic API key validation
    const trimmedKey = key.trim();
    
    // Check for empty key
    if (!trimmedKey) {
      return false;
    }
    
    // Check for obviously invalid patterns
    if (trimmedKey.length < 10) {
      return false;
    }
    
    // Check for potential injection attempts
    if (/<script|javascript:|data:|vbscript:/i.test(trimmedKey)) {
      return false;
    }
    
    // Check for null bytes or control characters
    if (/[\x00-\x1f\x7f-\x9f]/.test(trimmedKey)) {
      return false;
    }
    
    return true;
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    if (!validateApiKey(apiKey)) {
        onError("有効なAPIキーを入力してください。");
        return;
    }
    
    const markdownFiles = Array.from(files).filter((file: File) => file.name.endsWith('.md'));

    if (markdownFiles.length === 0) {
        onError("選択したディレクトリにマークダウン（.md）ファイルが見つかりませんでした。");
        if(fileInputRef.current) fileInputRef.current.value = "";
        return;
    }
    
    try {
      const fileData = await Promise.all(
        markdownFiles.map(file => {
          return new Promise<{path: string, content: string}>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                  path: (file as FileWithRelativePath).webkitRelativePath,
                  content: reader.result as string
              });
            };
            reader.onerror = () => reject(new Error(`ファイルの読み込みに失敗しました: ${file.name}`));
            reader.readAsText(file);
          });
        })
      );
      
      onFilesSelected(fileData, provider, apiKey);

    } catch (error) {
        if(error instanceof Error) onError(error.message);
        else onError("ファイルの読み込み中に不明なエラーが発生しました。");
    }
  };

  const handleClick = () => {
    if (!validateApiKey(apiKey)) {
        onError("有効なAPIキーを入力してください。");
        return;
    }
    fileInputRef.current?.click();
  };

  const isUploadDisabled = !validateApiKey(apiKey) || isProcessing;

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <h1 className="text-4xl font-bold text-white mb-2">Obsidian Vault AI検索</h1>
      <p className="text-lg text-gray-400 mb-8 max-w-2xl">
        あなたのノートに眠る知識を解き放ちましょう。AIプロバイダーを選択し、APIキーを入力してから、Vaultディレクトリを選択してください。
      </p>

      <div className="w-full max-w-lg mb-8 p-6 bg-gray-800/50 rounded-xl border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">AIプロバイダー設定</h2>
          <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">LLMプロバイダーを選択</label>
              <div className="flex justify-center gap-4">
                  <button onClick={() => setProvider('gemini')} className={`px-4 py-2 rounded-lg font-semibold w-full transition-colors ${provider === 'gemini' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`} disabled={isProcessing}>Gemini</button>
                  <button onClick={() => setProvider('openai')} className={`px-4 py-2 rounded-lg font-semibold w-full transition-colors ${provider === 'openai' ? 'bg-teal-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`} disabled={isProcessing}>OpenAI</button>
              </div>
          </div>
          <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-2">APIキー</label>
              <input 
                type="password"
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`${provider === 'gemini' ? 'Gemini' : 'OpenAI'} APIキーを入力してください`}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                disabled={isProcessing}
              />
          </div>
      </div>
      
      <div 
        onClick={!isUploadDisabled ? handleClick : undefined}
        className={`relative w-full max-w-lg border-2 border-dashed border-gray-600 rounded-xl p-12 flex flex-col items-center justify-center transition-all duration-300 ${isUploadDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-indigo-500 hover:bg-gray-800/50'}`}
      >
        <input
          type="file"
          // @ts-ignore
          webkitdirectory="true"
          directory="true"
          multiple
          onChange={handleFileChange}
          className="hidden"
          ref={fileInputRef}
          disabled={isUploadDisabled}
        />
        {isProcessing ? (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
            <p className="mt-4 text-gray-300">{processingMessage}</p>
          </>
        ) : (
          <>
            <UploadIcon />
            <span className="mt-4 text-xl font-medium text-gray-300">Vaultフォルダを選択</span>
            <p className="mt-1 text-sm text-gray-500">{!validateApiKey(apiKey) ? "続行するには有効なAPIキーを入力してください" : "ディレクトリ内のすべての`.md`ファイルが処理されます。"}</p>
          </>
        )}
      </div>

      <div className="mt-8 text-sm text-gray-500 max-w-2xl">
        <p className="font-semibold text-gray-400">プライバシーを最優先</p>
        <p>あなたのノートとAPIキーはブラウザ内にのみ保存されます。サーバーへアップロードされることはありません。</p>
      </div>
    </div>
  );
};

export default VaultUpload;
