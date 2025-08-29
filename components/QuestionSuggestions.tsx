import React, { useState } from 'react';
import { QuestionCategory, SmartQuestion } from '../services/questionSuggestionService';

interface QuestionSuggestionsProps {
  categories: QuestionCategory[];
  onQuestionClick: (question: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

const QuestionSuggestions: React.FC<QuestionSuggestionsProps> = ({ 
  categories, 
  onQuestionClick, 
  onRefresh,
  isLoading = false 
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(categories.slice(0, 1).map(cat => cat.category)) // 最初のカテゴリのみ展開
  );

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getQualityBadge = (quality: 'high' | 'medium' | 'low'): { text: string; color: string } => {
    switch (quality) {
      case 'high': return { text: '高品質', color: 'bg-green-600' };
      case 'medium': return { text: '中品質', color: 'bg-yellow-600' };
      case 'low': return { text: '要改善', color: 'bg-red-600' };
    }
  };

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 mb-4 border border-gray-600">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
          <h3 className="text-lg font-semibold text-white">💡 質問候補を生成中...</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-gray-700 rounded-lg h-12 animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!categories || categories.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 mb-4 border border-gray-600">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            <h3 className="text-lg font-semibold text-white">💡 質問候補</h3>
          </div>
          {onRefresh && (
            <button 
              onClick={onRefresh}
              className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
            >
              🔄 再生成
            </button>
          )}
        </div>
        <div className="text-gray-400 text-center py-8">
          まだ質問候補がありません。<br />
          ナレッジを検索すると、関連する質問候補が表示されます。
        </div>
      </div>
    );
  }

  const totalQuestions = categories.reduce((sum, cat) => sum + cat.questions.length, 0);

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-4 border border-gray-600">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
          <h3 className="text-lg font-semibold text-white">💡 スマート質問候補</h3>
          <span className="text-sm text-gray-400">({totalQuestions}件)</span>
        </div>
        {onRefresh && (
          <button 
            onClick={onRefresh}
            className="text-blue-400 hover:text-blue-300 transition-colors text-sm flex items-center gap-1"
          >
            🔄 再生成
          </button>
        )}
      </div>

      {/* カテゴリリスト */}
      <div className="space-y-4">
        {categories.map((category, categoryIndex) => (
          <div key={category.category} className="border border-gray-700 rounded-lg">
            {/* カテゴリヘッダー */}
            <button
              onClick={() => toggleCategory(category.category)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-700 transition-colors rounded-t-lg"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{category.icon}</span>
                <span className="text-white font-medium">{category.category}</span>
                <span className="text-sm text-gray-400">({category.questions.length}件)</span>
              </div>
              <span className="text-gray-400 text-lg">
                {expandedCategories.has(category.category) ? '▼' : '▶'}
              </span>
            </button>

            {/* 質問リスト */}
            {expandedCategories.has(category.category) && (
              <div className="border-t border-gray-700">
                <div className="p-4 space-y-3">
                  {category.questions.map((question, questionIndex) => (
                    <div
                      key={questionIndex}
                      className="bg-gray-700 rounded-lg p-3 hover:bg-gray-600 transition-colors cursor-pointer group"
                      onClick={() => onQuestionClick(question.question)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-white text-sm leading-relaxed group-hover:text-blue-200 transition-colors">
                            {question.question}
                          </p>
                          
                          {/* メタ情報 */}
                          <div className="flex items-center gap-3 mt-2">
                            {/* 信頼度 */}
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-400">信頼度:</span>
                              <span className={`text-xs font-medium ${getConfidenceColor(question.confidence)}`}>
                                {Math.round(question.confidence * 100)}%
                              </span>
                            </div>
                            
                            {/* 品質バッジ */}
                            <div className={`px-2 py-1 rounded text-xs text-white ${getQualityBadge(question.estimatedAnswerQuality).color}`}>
                              {getQualityBadge(question.estimatedAnswerQuality).text}
                            </div>
                            
                            {/* 関連ファイル数 */}
                            {question.relatedFiles.length > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-400">📁</span>
                                <span className="text-xs text-gray-400">
                                  {question.relatedFiles.length}件の関連文書
                                </span>
                              </div>
                            )}
                          </div>
                          
                          {/* 関連ファイル（詳細） */}
                          {question.relatedFiles.length > 0 && (
                            <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="text-xs text-gray-500">
                                関連: {question.relatedFiles.slice(0, 2).map(file => 
                                  file.split('/').pop()?.replace('.md', '') || file
                                ).join(', ')}
                                {question.relatedFiles.length > 2 && ` 他${question.relatedFiles.length - 2}件`}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* クリックアイコン */}
                        <div className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-blue-400 text-lg">→</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* フッター */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>💡 質問をクリックすると自動的に検索が実行されます</span>
          <span>🤖 AI生成による候補</span>
        </div>
      </div>
    </div>
  );
};

export default QuestionSuggestions;