import React from 'react';

interface ExternalDataPromptProps {
  question: string;
  onApprove: () => void;
  onDecline: () => void;
}

const ExternalDataPrompt: React.FC<ExternalDataPromptProps> = ({
  question,
  onApprove,
  onDecline
}) => {
  return (
    <div className="bg-amber-900/20 border border-amber-600/40 rounded-xl p-4 my-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
            <span className="text-white text-sm font-bold">!</span>
          </div>
        </div>
        <div className="flex-1">
          <h3 className="text-amber-200 font-semibold mb-2">
            社内ナレッジで回答が見つかりません
          </h3>
          <p className="text-gray-300 mb-4">
            「{question}」について、社内ナレッジの情報からは回答を見つけることができませんでした。
          </p>
          <p className="text-amber-200 mb-4">
            Vault外の一般的な知識を使って回答しますか？
          </p>
          <div className="flex gap-3">
            <button
              onClick={onApprove}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              はい、一般知識を使用
            </button>
            <button
              onClick={onDecline}
              className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              いいえ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExternalDataPrompt;