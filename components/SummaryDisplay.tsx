import React, { useState } from 'react';
import { TopicSummary } from '../services/summaryService';

interface SummaryDisplayProps {
  summary: TopicSummary;
  onTopicClick?: (topic: string) => void;
  onClose?: () => void;
}

const SummaryDisplay: React.FC<SummaryDisplayProps> = ({ 
  summary, 
  onTopicClick, 
  onClose 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const confidenceColor = summary.confidence >= 0.8 ? 'text-green-400' 
                         : summary.confidence >= 0.6 ? 'text-yellow-400' 
                         : 'text-red-400';

  const confidenceLabel = summary.confidence >= 0.8 ? '高い' 
                         : summary.confidence >= 0.6 ? '中程度' 
                         : '低い';

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-4 border border-gray-600">
      {/* ヘッダー */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
          <h3 className="text-lg font-semibold text-white">📝 インテリジェント要約</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">信頼度:</span>
            <span className={`text-sm font-medium ${confidenceColor}`}>
              {confidenceLabel} ({Math.round(summary.confidence * 100)}%)
            </span>
          </div>
          {onClose && (
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="要約を閉じる"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* メイン要約 */}
      <div className="mb-4">
        <div className="text-gray-300 leading-relaxed">
          {summary.summary}
        </div>
      </div>

      {/* 重要ポイント */}
      {summary.keyPoints.length > 0 && (
        <div className="mb-4">
          <h4 className="text-md font-medium text-blue-300 mb-2">🔹 重要ポイント</h4>
          <ul className="space-y-2">
            {summary.keyPoints.map((point, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span className="text-gray-300 text-sm">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 展開可能セクション */}
      <div className="border-t border-gray-700 pt-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          <span>{isExpanded ? '▼' : '▶'}</span>
          <span>詳細情報を{isExpanded ? '隠す' : '表示'}</span>
        </button>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {/* 参照元ファイル */}
            {summary.references.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-green-300 mb-2">📁 参照元ファイル</h5>
                <div className="space-y-1">
                  {summary.references.map((ref, index) => (
                    <div key={index} className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                      {ref}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 関連トピック */}
            {summary.relatedTopics.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-purple-300 mb-2">🔗 関連トピック</h5>
                <div className="flex flex-wrap gap-2">
                  {summary.relatedTopics.map((topic, index) => (
                    <button
                      key={index}
                      onClick={() => onTopicClick?.(topic)}
                      className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded transition-colors"
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SummaryDisplay;