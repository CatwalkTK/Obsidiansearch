/**
 * 学習型・適応型同義語システム
 * ユーザーの検索パターンから同義語関係を自動学習
 */

// 学習データの型定義
interface SearchPattern {
  query: string;
  clickedFile: string;
  timestamp: number;
  semanticScore: number;
}

interface SynonymRelation {
  word1: string;
  word2: string;
  strength: number; // 関連度 (0-1)
  frequency: number; // 出現頻度
  lastSeen: number;
}

// ローカルストレージキー
const SEARCH_PATTERNS_KEY = 'obsidian_search_patterns';
const SYNONYM_RELATIONS_KEY = 'obsidian_synonym_relations';

/**
 * 学習型同義語管理クラス
 */
export class AdaptiveSynonymManager {
  private searchPatterns: SearchPattern[] = [];
  private synonymRelations: Map<string, SynonymRelation[]> = new Map();
  
  constructor() {
    this.loadFromStorage();
  }
  
  /**
   * 検索パターンを記録
   * @param query - 検索クエリ
   * @param clickedFile - クリックされたファイル
   * @param semanticScore - セマンティックスコア
   */
  recordSearchPattern(query: string, clickedFile: string, semanticScore: number): void {
    const pattern: SearchPattern = {
      query: query.toLowerCase().trim(),
      clickedFile,
      timestamp: Date.now(),
      semanticScore
    };
    
    this.searchPatterns.push(pattern);
    
    // 古いパターンを削除（最新1000件まで保持）
    if (this.searchPatterns.length > 1000) {
      this.searchPatterns = this.searchPatterns.slice(-1000);
    }
    
    // 同義語関係を学習
    this.learnFromPatterns();
    
    // ストレージに保存
    this.saveToStorage();
    
    console.log('📚 検索パターン記録:', { query, clickedFile, semanticScore: semanticScore.toFixed(3) });
  }
  
  /**
   * 検索パターンから同義語関係を学習
   */
  private learnFromPatterns(): void {
    // 同じファイルを参照する異なるクエリを分析
    const fileQueryMap = new Map<string, Set<string>>();
    
    // ファイルごとのクエリをグループ化
    this.searchPatterns.forEach(pattern => {
      if (!fileQueryMap.has(pattern.clickedFile)) {
        fileQueryMap.set(pattern.clickedFile, new Set());
      }
      fileQueryMap.get(pattern.clickedFile)!.add(pattern.query);
    });
    
    // 同じファイルを参照するクエリ間の関連性を分析
    fileQueryMap.forEach((queries, file) => {
      const queryArray = Array.from(queries);
      if (queryArray.length < 2) return;
      
      // クエリペア間の類似性を評価
      for (let i = 0; i < queryArray.length; i++) {
        for (let j = i + 1; j < queryArray.length; j++) {
          const query1 = queryArray[i];
          const query2 = queryArray[j];
          
          // キーワード抽出して関連性を分析
          this.analyzeSynonymRelation(query1, query2, file);
        }
      }
    });
  }
  
  /**
   * 2つのクエリ間の同義語関係を分析
   */
  private analyzeSynonymRelation(query1: string, query2: string, file: string): void {
    const keywords1 = this.extractKeywords(query1);
    const keywords2 = this.extractKeywords(query2);
    
    // 異なるキーワードを持つが同じファイルを参照するクエリから同義語を推定
    keywords1.forEach(kw1 => {
      keywords2.forEach(kw2 => {
        if (kw1 !== kw2 && this.isSimilarContext(kw1, kw2)) {
          this.updateSynonymRelation(kw1, kw2, 0.1); // 小さな重みで更新
        }
      });
    });
  }
  
  /**
   * 同義語関係の強度を更新
   */
  private updateSynonymRelation(word1: string, word2: string, strength: number): void {
    const key = word1.toLowerCase();
    
    if (!this.synonymRelations.has(key)) {
      this.synonymRelations.set(key, []);
    }
    
    const relations = this.synonymRelations.get(key)!;
    const existingRelation = relations.find(r => r.word2 === word2.toLowerCase());
    
    if (existingRelation) {
      // 既存の関係を強化
      existingRelation.strength = Math.min(1, existingRelation.strength + strength);
      existingRelation.frequency += 1;
      existingRelation.lastSeen = Date.now();
    } else {
      // 新しい関係を追加
      relations.push({
        word1: word1.toLowerCase(),
        word2: word2.toLowerCase(),
        strength,
        frequency: 1,
        lastSeen: Date.now()
      });
    }
  }
  
  /**
   * キーワード抽出（簡易版）
   */
  private extractKeywords(query: string): string[] {
    const stopWords = new Set(['は', 'を', 'が', 'に', 'で', 'て', 'です', 'ます', '？', '?']);
    return query
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length >= 2 && !stopWords.has(w));
  }
  
  /**
   * 2つのキーワードが類似コンテキストかチェック
   */
  private isSimilarContext(word1: string, word2: string): boolean {
    // 長さが大幅に異なる場合は関連性なし
    const lengthRatio = Math.min(word1.length, word2.length) / Math.max(word1.length, word2.length);
    if (lengthRatio < 0.5) return false;
    
    // 共通文字数チェック
    const commonChars = this.getCommonCharacterCount(word1, word2);
    const similarity = commonChars / Math.max(word1.length, word2.length);
    
    return similarity > 0.3; // 30%以上の文字が共通
  }
  
  /**
   * 共通文字数を計算
   */
  private getCommonCharacterCount(str1: string, str2: string): number {
    const chars1 = new Set(str1.split(''));
    const chars2 = new Set(str2.split(''));
    let common = 0;
    
    chars1.forEach(char => {
      if (chars2.has(char)) common++;
    });
    
    return common;
  }
  
  /**
   * 学習済み同義語を取得
   * @param word - 検索する単語
   * @param minStrength - 最小関連度しきい値
   * @returns 関連する同義語リスト
   */
  getLearnedSynonyms(word: string, minStrength: number = 0.2): string[] {
    const key = word.toLowerCase();
    const relations = this.synonymRelations.get(key) || [];
    
    return relations
      .filter(r => r.strength >= minStrength)
      .sort((a, b) => b.strength - a.strength) // 関連度順
      .slice(0, 5) // 上位5つまで
      .map(r => r.word2);
  }
  
  /**
   * 学習状況の統計を取得
   */
  getLearningStats(): {
    searchPatterns: number;
    synonymRelations: number;
    topRelations: Array<{word: string, synonyms: number, avgStrength: number}>;
  } {
    const topRelations = Array.from(this.synonymRelations.entries())
      .map(([word, relations]) => ({
        word,
        synonyms: relations.length,
        avgStrength: relations.reduce((sum, r) => sum + r.strength, 0) / relations.length
      }))
      .sort((a, b) => b.avgStrength - a.avgStrength)
      .slice(0, 10);
    
    return {
      searchPatterns: this.searchPatterns.length,
      synonymRelations: this.synonymRelations.size,
      topRelations
    };
  }
  
  /**
   * データをローカルストレージから読み込み
   */
  private loadFromStorage(): void {
    try {
      const patternsData = localStorage.getItem(SEARCH_PATTERNS_KEY);
      if (patternsData) {
        this.searchPatterns = JSON.parse(patternsData);
      }
      
      const relationsData = localStorage.getItem(SYNONYM_RELATIONS_KEY);
      if (relationsData) {
        const parsed = JSON.parse(relationsData);
        this.synonymRelations = new Map(Object.entries(parsed));
      }
      
    } catch (error) {
      console.warn('学習データ読み込みエラー:', error);
    }
  }
  
  /**
   * データをローカルストレージに保存
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(SEARCH_PATTERNS_KEY, JSON.stringify(this.searchPatterns));
      
      const relationsObject = Object.fromEntries(this.synonymRelations);
      localStorage.setItem(SYNONYM_RELATIONS_KEY, JSON.stringify(relationsObject));
      
    } catch (error) {
      console.warn('学習データ保存エラー:', error);
    }
  }
  
  /**
   * 学習データをリセット
   */
  resetLearningData(): void {
    this.searchPatterns = [];
    this.synonymRelations.clear();
    localStorage.removeItem(SEARCH_PATTERNS_KEY);
    localStorage.removeItem(SYNONYM_RELATIONS_KEY);
    console.log('🔄 学習データをリセットしました');
  }
}

// グローバルインスタンス
export const adaptiveSynonymManager = new AdaptiveSynonymManager();