import React, { useState, useEffect } from 'react';
import { KnowledgeAnalytics, getKnowledgeAnalytics, getQuickStats } from '../services/analyticsService';

interface AnalyticsDashboardProps {
  onClose?: () => void;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ onClose }) => {
  const [analytics, setAnalytics] = useState<KnowledgeAnalytics | null>(null);
  const [quickStats, setQuickStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'topics' | 'gaps' | 'files' | 'trends'>('overview');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = () => {
    setIsLoading(true);
    try {
      const analyticsData = getKnowledgeAnalytics();
      const statsData = getQuickStats();
      setAnalytics(analyticsData);
      setQuickStats(statsData);
    } catch (error) {
      console.error('アナリティクスデータの読み込みエラー:', error);
    }
    setIsLoading(false);
  };

  const formatPercentage = (value: number): string => {
    return `${Math.round(value * 100)}%`;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric'
    });
  };

  const getPriorityColor = (priority: 'high' | 'medium' | 'low'): string => {
    switch (priority) {
      case 'high': return 'text-red-400 bg-red-900/30';
      case 'medium': return 'text-yellow-400 bg-yellow-900/30';
      case 'low': return 'text-green-400 bg-green-900/30';
    }
  };

  const getPriorityLabel = (priority: 'high' | 'medium' | 'low'): string => {
    switch (priority) {
      case 'high': return '高';
      case 'medium': return '中';
      case 'low': return '低';
    }
  };

  const getTrendIcon = (direction: 'up' | 'down' | 'stable'): string => {
    switch (direction) {
      case 'up': return '📈';
      case 'down': return '📉';
      case 'stable': return '➡️';
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-4"></div>
            <p className="text-white">アナリティクスデータを分析中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <p className="text-white mb-4">アナリティクスデータが見つかりません</p>
            <button 
              onClick={onClose}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* ヘッダー */}
        <div className="bg-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            📊 ナレッジ分析ダッシュボード
          </h2>
          {onClose && (
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors text-xl"
            >
              ✕
            </button>
          )}
        </div>

        {/* タブナビゲーション */}
        <div className="border-b border-gray-700">
          <div className="flex px-6">
            {[
              { id: 'overview', label: '概要', icon: '📊' },
              { id: 'topics', label: '人気トピック', icon: '🔥' },
              { id: 'gaps', label: 'ナレッジギャップ', icon: '🔍' },
              { id: 'files', label: 'ファイル利用状況', icon: '📁' },
              { id: 'trends', label: '検索トレンド', icon: '📈' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-400 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* コンテンツエリア */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          
          {/* 概要タブ */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* クイック統計 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-400">{quickStats?.totalSearches || 0}</div>
                  <div className="text-sm text-gray-400">総検索数</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-400">{formatPercentage(quickStats?.successRate || 0)}</div>
                  <div className="text-sm text-gray-400">成功率</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="text-2xl font-bold text-yellow-400">{quickStats?.gapCount || 0}</div>
                  <div className="text-sm text-gray-400">重要ギャップ</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-4">
                  <div className="text-lg font-bold text-purple-400">{quickStats?.topTopic || 'なし'}</div>
                  <div className="text-sm text-gray-400">人気トピック</div>
                </div>
              </div>

              {/* インタラクション指標 */}
              <div className="bg-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">📱 利用状況</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">ユニーク質問数:</span>
                    <span className="ml-2 text-white font-medium">{analytics.userInteractions.uniqueQueries}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">要約リクエスト:</span>
                    <span className="ml-2 text-white font-medium">{analytics.userInteractions.summaryRequests}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">外部データ利用:</span>
                    <span className="ml-2 text-white font-medium">{analytics.userInteractions.externalDataRequests}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">質問候補クリック:</span>
                    <span className="ml-2 text-white font-medium">{analytics.userInteractions.questionSuggestionClicks}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">平均セッション長:</span>
                    <span className="ml-2 text-white font-medium">{Math.round(analytics.userInteractions.avgSessionLength)}分</span>
                  </div>
                </div>
              </div>

              {/* 推奨事項 */}
              {analytics.recommendations.length > 0 && (
                <div className="bg-gray-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">💡 改善提案</h3>
                  <div className="space-y-3">
                    {analytics.recommendations.slice(0, 3).map((rec, index) => (
                      <div key={index} className="bg-gray-800 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(rec.priority)}`}>
                            {getPriorityLabel(rec.priority)}
                          </span>
                          <div className="flex-1">
                            <h4 className="text-white font-medium mb-1">{rec.title}</h4>
                            <p className="text-gray-300 text-sm mb-2">{rec.description}</p>
                            <div className="text-xs text-green-400">📈 {rec.estimatedImpact}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 人気トピックタブ */}
          {activeTab === 'topics' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">🔥 人気トピック分析</h3>
              {analytics.popularTopics.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  まだ人気トピックのデータがありません
                </div>
              ) : (
                <div className="space-y-3">
                  {analytics.popularTopics.map((topic, index) => (
                    <div key={index} className="bg-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-white font-medium">{topic.topic}</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-400">{getTrendIcon(topic.trendDirection)}</span>
                          <span className="text-sm text-blue-400 font-medium">{topic.searchCount}回</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">成功率: </span>
                          <span className={`font-medium ${topic.successRate >= 0.7 ? 'text-green-400' : topic.successRate >= 0.4 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {formatPercentage(topic.successRate)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">平均信頼度: </span>
                          <span className="text-white font-medium">{Math.round(topic.avgConfidenceScore * 100)}%</span>
                        </div>
                      </div>
                      {topic.relatedFiles.length > 0 && (
                        <div className="mt-2 text-xs text-gray-400">
                          関連ファイル: {topic.relatedFiles.slice(0, 2).map(f => f.split('/').pop()?.replace('.md', '')).join(', ')}
                          {topic.relatedFiles.length > 2 && ` 他${topic.relatedFiles.length - 2}件`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ナレッジギャップタブ */}
          {activeTab === 'gaps' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">🔍 ナレッジギャップ分析</h3>
              {analytics.knowledgeGaps.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  特定できるナレッジギャップがありません
                </div>
              ) : (
                <div className="space-y-3">
                  {analytics.knowledgeGaps.map((gap, index) => (
                    <div key={index} className="bg-gray-700 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(gap.priority)}`}>
                          {getPriorityLabel(gap.priority)}
                        </span>
                        <div className="flex-1">
                          <h4 className="text-white font-medium mb-1">「{gap.searchQuery}」</h4>
                          <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                            <div>
                              <span className="text-gray-400">検索回数: </span>
                              <span className="text-white font-medium">{gap.searchCount}回</span>
                            </div>
                            <div>
                              <span className="text-gray-400">平均信頼度: </span>
                              <span className="text-red-400 font-medium">{Math.round(gap.avgConfidenceScore * 100)}%</span>
                            </div>
                          </div>
                          {gap.suggestedContent.length > 0 && (
                            <div className="text-xs text-gray-400">
                              推奨コンテンツ: {gap.suggestedContent.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ファイル利用状況タブ */}
          {activeTab === 'files' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">📁 ファイル利用状況</h3>
              {analytics.underutilizedFiles.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  ファイル利用データがありません
                </div>
              ) : (
                <div className="space-y-3">
                  {analytics.underutilizedFiles.slice(0, 10).map((file, index) => (
                    <div key={index} className="bg-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-white font-medium text-sm">{file.filePath.split('/').pop()?.replace('.md', '')}</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-blue-400">{file.accessCount}回アクセス</span>
                          {file.recommendedAction !== 'none' && (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              file.recommendedAction === 'promote' ? 'bg-green-600 text-white' :
                              file.recommendedAction === 'update' ? 'bg-yellow-600 text-white' :
                              'bg-red-600 text-white'
                            }`}>
                              {file.recommendedAction === 'promote' ? '推奨' : 
                               file.recommendedAction === 'update' ? '更新' : 'アーカイブ'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">平均関連度: </span>
                          <span className="text-white font-medium">{Math.round(file.averageRelevanceScore * 100)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-400">最終アクセス: </span>
                          <span className="text-white font-medium">{formatDate(file.lastAccessed)}</span>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{file.filePath}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 検索トレンドタブ */}
          {activeTab === 'trends' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">📈 検索トレンド</h3>
              {analytics.searchTrends.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  トレンドデータがありません
                </div>
              ) : (
                <div className="space-y-3">
                  {analytics.searchTrends.slice(0, 14).map((trend, index) => (
                    <div key={index} className="bg-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-white font-medium">{trend.date}</h4>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-blue-400">{trend.totalSearches}回検索</span>
                          <span className="text-green-400">{trend.uniqueTopics}トピック</span>
                          <span className="text-yellow-400">成功率{formatPercentage(trend.avgSuccessRate)}</span>
                        </div>
                      </div>
                      {trend.popularQueries.length > 0 && (
                        <div className="text-xs text-gray-400">
                          人気の質問: {trend.popularQueries.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="bg-gray-700 px-6 py-3 flex items-center justify-between text-sm text-gray-400">
          <span>📊 過去30日間のデータに基づく分析結果</span>
          <button 
            onClick={loadAnalytics}
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            🔄 更新
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;