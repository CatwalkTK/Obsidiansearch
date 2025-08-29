/**
 * ナレッジ使用状況分析サービス
 * 検索パターン・人気トピック・ナレッジギャップを分析
 */

export interface KnowledgeAnalytics {
  popularTopics: TopicAnalysis[];
  underutilizedFiles: FileUsage[];
  knowledgeGaps: KnowledgeGap[];
  searchTrends: SearchTrend[];
  userInteractions: InteractionMetrics;
  recommendations: AnalyticsRecommendation[];
}

export interface TopicAnalysis {
  topic: string;
  searchCount: number;
  successRate: number; // 満足のいく回答が得られた割合
  avgConfidenceScore: number;
  relatedFiles: string[];
  trendDirection: 'up' | 'down' | 'stable';
}

export interface FileUsage {
  filePath: string;
  accessCount: number;
  lastAccessed: Date;
  averageRelevanceScore: number;
  fileSize: number;
  recommendedAction: 'update' | 'archive' | 'promote' | 'none';
}

export interface KnowledgeGap {
  searchQuery: string;
  searchCount: number;
  avgConfidenceScore: number; // 低いほどギャップが大きい
  suggestedContent: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface SearchTrend {
  period: string; // 'daily' | 'weekly' | 'monthly'
  date: string;
  totalSearches: number;
  uniqueTopics: number;
  avgSuccessRate: number;
  popularQueries: string[];
}

export interface InteractionMetrics {
  totalSearches: number;
  uniqueQueries: number;
  avgSessionLength: number;
  summaryRequests: number;
  externalDataRequests: number;
  questionSuggestionClicks: number;
}

export interface AnalyticsRecommendation {
  type: 'content_gap' | 'outdated_content' | 'popular_topic' | 'user_behavior';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionItems: string[];
  estimatedImpact: string;
}

// アナリティクスデータのストレージ
class AnalyticsStorage {
  private searchHistory: SearchEvent[] = [];
  private fileAccess: Map<string, FileAccessRecord> = new Map();
  private topicFrequency: Map<string, TopicRecord> = new Map();
  private confidenceScores: number[] = [];
  
  // ローカルストレージキー
  private readonly STORAGE_KEY = 'knowledge_analytics';
  private readonly MAX_HISTORY_SIZE = 1000;

  constructor() {
    this.loadFromStorage();
  }

  /**
   * 検索イベントを記録
   */
  recordSearchEvent(event: SearchEvent): void {
    this.searchHistory.push({
      ...event,
      timestamp: new Date()
    });
    
    // 履歴サイズ制限
    if (this.searchHistory.length > this.MAX_HISTORY_SIZE) {
      this.searchHistory = this.searchHistory.slice(-this.MAX_HISTORY_SIZE);
    }
    
    // トピック頻度を更新
    this.updateTopicFrequency(event);
    
    // ファイルアクセスを更新
    if (event.resultFiles) {
      event.resultFiles.forEach(file => this.updateFileAccess(file, event.confidenceScore));
    }
    
    // 信頼度スコアを記録
    if (event.confidenceScore !== undefined) {
      this.confidenceScores.push(event.confidenceScore);
    }
    
    this.saveToStorage();
  }

  /**
   * 分析データを生成
   */
  generateAnalytics(): KnowledgeAnalytics {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // 最近30日のデータのみを使用
    const recentSearches = this.searchHistory.filter(
      event => event.timestamp && event.timestamp >= thirtyDaysAgo
    );
    
    return {
      popularTopics: this.analyzePopularTopics(recentSearches),
      underutilizedFiles: this.analyzeFileUsage(),
      knowledgeGaps: this.identifyKnowledgeGaps(recentSearches),
      searchTrends: this.analyzeSearchTrends(recentSearches),
      userInteractions: this.calculateInteractionMetrics(recentSearches),
      recommendations: this.generateRecommendations(recentSearches)
    };
  }

  /**
   * トピック頻度を更新
   */
  private updateTopicFrequency(event: SearchEvent): void {
    const topics = this.extractTopicsFromQuery(event.query);
    
    topics.forEach(topic => {
      const existing = this.topicFrequency.get(topic) || {
        count: 0,
        confidenceScores: [],
        queries: []
      };
      
      existing.count++;
      if (event.confidenceScore !== undefined) {
        existing.confidenceScores.push(event.confidenceScore);
      }
      existing.queries.push(event.query);
      
      this.topicFrequency.set(topic, existing);
    });
  }

  /**
   * ファイルアクセスを更新
   */
  private updateFileAccess(filePath: string, confidenceScore?: number): void {
    const existing = this.fileAccess.get(filePath) || {
      accessCount: 0,
      confidenceScores: [],
      lastAccessed: new Date()
    };
    
    existing.accessCount++;
    existing.lastAccessed = new Date();
    if (confidenceScore !== undefined) {
      existing.confidenceScores.push(confidenceScore);
    }
    
    this.fileAccess.set(filePath, existing);
  }

  /**
   * 人気トピックを分析
   */
  private analyzePopularTopics(searches: SearchEvent[]): TopicAnalysis[] {
    const topics: TopicAnalysis[] = [];
    
    this.topicFrequency.forEach((record, topic) => {
      if (record.count >= 2) { // 最低2回以上検索されたトピック
        const avgConfidence = record.confidenceScores.length > 0
          ? record.confidenceScores.reduce((sum, score) => sum + score, 0) / record.confidenceScores.length
          : 0.5;
        
        const successRate = record.confidenceScores.filter(score => score >= 0.7).length / record.confidenceScores.length;
        
        topics.push({
          topic,
          searchCount: record.count,
          successRate: isNaN(successRate) ? 0.5 : successRate,
          avgConfidenceScore: avgConfidence,
          relatedFiles: this.findRelatedFiles(topic),
          trendDirection: this.calculateTrendDirection(topic, searches)
        });
      }
    });
    
    return topics.sort((a, b) => b.searchCount - a.searchCount).slice(0, 10);
  }

  /**
   * ファイル使用状況を分析
   */
  private analyzeFileUsage(): FileUsage[] {
    const fileUsages: FileUsage[] = [];
    
    this.fileAccess.forEach((record, filePath) => {
      const avgRelevance = record.confidenceScores.length > 0
        ? record.confidenceScores.reduce((sum, score) => sum + score, 0) / record.confidenceScores.length
        : 0.5;
      
      const daysSinceAccess = (Date.now() - record.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
      
      let recommendedAction: 'update' | 'archive' | 'promote' | 'none' = 'none';
      if (daysSinceAccess > 90 && record.accessCount < 3) {
        recommendedAction = 'archive';
      } else if (avgRelevance > 0.8 && record.accessCount > 10) {
        recommendedAction = 'promote';
      } else if (avgRelevance < 0.4 && record.accessCount > 5) {
        recommendedAction = 'update';
      }
      
      fileUsages.push({
        filePath,
        accessCount: record.accessCount,
        lastAccessed: record.lastAccessed,
        averageRelevanceScore: avgRelevance,
        fileSize: 0, // ファイルサイズは別途取得が必要
        recommendedAction
      });
    });
    
    return fileUsages.sort((a, b) => b.accessCount - a.accessCount);
  }

  /**
   * ナレッジギャップを特定
   */
  private identifyKnowledgeGaps(searches: SearchEvent[]): KnowledgeGap[] {
    const lowConfidenceQueries = new Map<string, KnowledgeGapRecord>();
    
    searches.forEach(event => {
      if (event.confidenceScore !== undefined && event.confidenceScore < 0.6) {
        const normalized = this.normalizeQuery(event.query);
        const existing = lowConfidenceQueries.get(normalized) || {
          queries: [],
          confidenceScores: [],
          count: 0
        };
        
        existing.queries.push(event.query);
        existing.confidenceScores.push(event.confidenceScore);
        existing.count++;
        
        lowConfidenceQueries.set(normalized, existing);
      }
    });
    
    const gaps: KnowledgeGap[] = [];
    lowConfidenceQueries.forEach((record, query) => {
      if (record.count >= 2) { // 複数回検索されている低信頼度クエリ
        const avgConfidence = record.confidenceScores.reduce((sum, score) => sum + score, 0) / record.confidenceScores.length;
        
        gaps.push({
          searchQuery: query,
          searchCount: record.count,
          avgConfidenceScore: avgConfidence,
          suggestedContent: this.generateContentSuggestions(query),
          priority: record.count >= 5 ? 'high' : record.count >= 3 ? 'medium' : 'low'
        });
      }
    });
    
    return gaps.sort((a, b) => b.searchCount - a.searchCount).slice(0, 8);
  }

  /**
   * 検索トレンドを分析
   */
  private analyzeSearchTrends(searches: SearchEvent[]): SearchTrend[] {
    const dailyStats = new Map<string, SearchTrendRecord>();
    
    searches.forEach(event => {
      const dateKey = event.timestamp ? event.timestamp.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      const existing = dailyStats.get(dateKey) || {
        searches: 0,
        topics: new Set<string>(),
        successfulSearches: 0,
        queries: []
      };
      
      existing.searches++;
      existing.queries.push(event.query);
      
      if (event.confidenceScore !== undefined && event.confidenceScore >= 0.7) {
        existing.successfulSearches++;
      }
      
      this.extractTopicsFromQuery(event.query).forEach(topic => {
        existing.topics.add(topic);
      });
      
      dailyStats.set(dateKey, existing);
    });
    
    const trends: SearchTrend[] = [];
    dailyStats.forEach((record, date) => {
      trends.push({
        period: 'daily',
        date,
        totalSearches: record.searches,
        uniqueTopics: record.topics.size,
        avgSuccessRate: record.searches > 0 ? record.successfulSearches / record.searches : 0,
        popularQueries: this.getPopularQueries(record.queries).slice(0, 3)
      });
    });
    
    return trends.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 14); // 最近14日
  }

  /**
   * インタラクション指標を計算
   */
  private calculateInteractionMetrics(searches: SearchEvent[]): InteractionMetrics {
    const uniqueQueries = new Set(searches.map(s => s.query.toLowerCase())).size;
    const summaryRequests = searches.filter(s => s.type === 'summary').length;
    const externalRequests = searches.filter(s => s.type === 'external').length;
    const suggestionClicks = searches.filter(s => s.type === 'suggestion_click').length;
    
    // セッション長の計算（連続検索の時間差）
    let totalSessionTime = 0;
    let sessionCount = 0;
    
    for (let i = 1; i < searches.length; i++) {
      const current = searches[i].timestamp;
      const previous = searches[i-1].timestamp;
      const timeDiff = current && previous
        ? current.getTime() - previous.getTime()
        : 0;
      
      if (timeDiff < 30 * 60 * 1000) { // 30分以内は同セッション
        totalSessionTime += timeDiff;
      } else {
        sessionCount++;
      }
    }
    
    return {
      totalSearches: searches.length,
      uniqueQueries,
      avgSessionLength: sessionCount > 0 ? totalSessionTime / sessionCount / 1000 / 60 : 0, // 分単位
      summaryRequests,
      externalDataRequests: externalRequests,
      questionSuggestionClicks: suggestionClicks
    };
  }

  /**
   * 推奨事項を生成
   */
  private generateRecommendations(searches: SearchEvent[]): AnalyticsRecommendation[] {
    const recommendations: AnalyticsRecommendation[] = [];
    
    // 人気トピックの推奨
    const popularTopics = this.analyzePopularTopics(searches);
    if (popularTopics.length > 0) {
      const topTopic = popularTopics[0];
      if (topTopic.successRate < 0.7) {
        recommendations.push({
          type: 'content_gap',
          title: `「${topTopic.topic}」の情報充実化`,
          description: `人気の高いトピックですが、満足のいく回答率が${Math.round(topTopic.successRate * 100)}%と低めです。`,
          priority: 'high',
          actionItems: [
            `${topTopic.topic}に関する詳細文書の作成`,
            '既存文書の内容充実化',
            'FAQ形式での情報整理'
          ],
          estimatedImpact: `検索成功率を${Math.round((0.8 - topTopic.successRate) * 100)}%向上`
        });
      }
    }
    
    // ナレッジギャップの推奨
    const gaps = this.identifyKnowledgeGaps(searches);
    const highPriorityGaps = gaps.filter(gap => gap.priority === 'high');
    if (highPriorityGaps.length > 0) {
      recommendations.push({
        type: 'content_gap',
        title: '未対応の重要な質問領域',
        description: `${highPriorityGaps.length}個の高頻度・低回答品質の質問分野が特定されました。`,
        priority: 'high',
        actionItems: highPriorityGaps.slice(0, 3).map(gap => `「${gap.searchQuery}」に関する文書作成`),
        estimatedImpact: `${highPriorityGaps.reduce((sum, gap) => sum + gap.searchCount, 0)}回の検索に対する回答品質向上`
      });
    }
    
    // 古いファイルの推奨
    const underutilized = this.analyzeFileUsage();
    const archiveCandidates = underutilized.filter(file => file.recommendedAction === 'archive');
    if (archiveCandidates.length > 3) {
      recommendations.push({
        type: 'outdated_content',
        title: '古い・未使用ファイルの整理',
        description: `${archiveCandidates.length}個のファイルがほとんど使用されていません。`,
        priority: 'medium',
        actionItems: [
          '90日以上未使用ファイルの確認',
          '古い情報の更新または削除',
          'ファイル構造の最適化'
        ],
        estimatedImpact: 'ナレッジベースの検索性能向上、管理負荷軽減'
      });
    }
    
    return recommendations.slice(0, 5); // 最大5個の推奨
  }

  // ヘルパーメソッド
  private extractTopicsFromQuery(query: string): string[] {
    const stopWords = new Set(['は', 'を', 'が', 'に', 'で', 'て', 'です', 'ます', 'について', 'とは']);
    return query.toLowerCase()
      .replace(/[？?。、，！!]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 2 && !stopWords.has(word))
      .slice(0, 3);
  }

  private findRelatedFiles(topic: string): string[] {
    const relatedFiles: string[] = [];
    this.fileAccess.forEach((record, filePath) => {
      if (filePath.toLowerCase().includes(topic.toLowerCase())) {
        relatedFiles.push(filePath);
      }
    });
    return relatedFiles.slice(0, 5);
  }

  private calculateTrendDirection(topic: string, searches: SearchEvent[]): 'up' | 'down' | 'stable' {
    const recentSearches = searches.slice(-50); // 最近50件
    const olderSearches = searches.slice(-100, -50); // その前の50件
    
    const recentCount = recentSearches.filter(s => 
      this.extractTopicsFromQuery(s.query).includes(topic)
    ).length;
    
    const olderCount = olderSearches.filter(s => 
      this.extractTopicsFromQuery(s.query).includes(topic)
    ).length;
    
    if (recentCount > olderCount * 1.2) return 'up';
    if (recentCount < olderCount * 0.8) return 'down';
    return 'stable';
  }

  private normalizeQuery(query: string): string {
    return query.toLowerCase()
      .replace(/[？?。、，！!]/g, '')
      .trim();
  }

  private generateContentSuggestions(query: string): string[] {
    const topics = this.extractTopicsFromQuery(query);
    return topics.map(topic => `${topic}に関する基本情報`);
  }

  private getPopularQueries(queries: string[]): string[] {
    const counts = new Map<string, number>();
    queries.forEach(query => {
      counts.set(query, (counts.get(query) || 0) + 1);
    });
    
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([query]) => query);
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.searchHistory = data.searchHistory?.map((event: any) => ({
          ...event,
          timestamp: event.timestamp ? new Date(event.timestamp) : new Date()
        })) || [];
        
        if (data.fileAccess) {
          this.fileAccess = new Map(Object.entries(data.fileAccess).map(([key, value]: [string, any]) => [
            key,
            {
              ...value,
              lastAccessed: new Date(value.lastAccessed)
            }
          ]));
        }
        
        if (data.topicFrequency) {
          this.topicFrequency = new Map(Object.entries(data.topicFrequency));
        }
        
        this.confidenceScores = data.confidenceScores || [];
      }
    } catch (error) {
      console.warn('アナリティクスデータの読み込みに失敗:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const data = {
        searchHistory: this.searchHistory,
        fileAccess: Object.fromEntries(this.fileAccess),
        topicFrequency: Object.fromEntries(this.topicFrequency),
        confidenceScores: this.confidenceScores
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('アナリティクスデータの保存に失敗:', error);
    }
  }
}

// イベントとレコードの型定義
interface SearchEvent {
  query: string;
  type: 'search' | 'summary' | 'external' | 'suggestion_click';
  confidenceScore?: number;
  resultFiles?: string[];
  timestamp?: Date;
}

interface FileAccessRecord {
  accessCount: number;
  confidenceScores: number[];
  lastAccessed: Date;
}

interface TopicRecord {
  count: number;
  confidenceScores: number[];
  queries: string[];
}

interface KnowledgeGapRecord {
  queries: string[];
  confidenceScores: number[];
  count: number;
}

interface SearchTrendRecord {
  searches: number;
  topics: Set<string>;
  successfulSearches: number;
  queries: string[];
}

// シングルトンインスタンス
const analyticsStorage = new AnalyticsStorage();

/**
 * 検索イベントを記録
 */
export function recordSearchEvent(
  query: string,
  type: 'search' | 'summary' | 'external' | 'suggestion_click' = 'search',
  confidenceScore?: number,
  resultFiles?: string[]
): void {
  analyticsStorage.recordSearchEvent({
    query,
    type,
    confidenceScore,
    resultFiles,
    timestamp: new Date()
  });
}

/**
 * アナリティクス分析結果を取得
 */
export function getKnowledgeAnalytics(): KnowledgeAnalytics {
  return analyticsStorage.generateAnalytics();
}

/**
 * アナリティクスデータをクリア
 */
export function clearAnalyticsData(): void {
  localStorage.removeItem('knowledge_analytics');
  console.log('🗑️ アナリティクスデータをクリアしました');
}

/**
 * アナリティクスデータをエクスポート
 */
export function exportAnalyticsData(): string {
  const analytics = getKnowledgeAnalytics();
  return JSON.stringify(analytics, null, 2);
}

/**
 * 簡単な統計サマリーを取得
 */
export function getQuickStats(): {
  totalSearches: number;
  topTopic: string | null;
  successRate: number;
  gapCount: number;
} {
  const analytics = getKnowledgeAnalytics();
  
  return {
    totalSearches: analytics.userInteractions.totalSearches,
    topTopic: analytics.popularTopics.length > 0 ? analytics.popularTopics[0].topic : null,
    successRate: analytics.popularTopics.length > 0 
      ? analytics.popularTopics.reduce((sum, topic) => sum + topic.successRate, 0) / analytics.popularTopics.length 
      : 0,
    gapCount: analytics.knowledgeGaps.filter(gap => gap.priority === 'high').length
  };
}