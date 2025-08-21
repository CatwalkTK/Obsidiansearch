/**
 * 同義語辞書と拡張機能
 */

// 日本語同義語辞書
export const synonymDictionary: { [key: string]: string[] } = {
  // 退職・転職関連
  "辞める": ["退職", "離職", "辞職", "転職", "やめる"],
  "退職": ["辞める", "離職", "辞職", "やめる"],
  "離職": ["退職", "辞める", "辞職", "やめる"],
  "辞職": ["退職", "辞める", "離職", "やめる"],
  
  // 手続き・プロセス関連
  "手続き": ["手順", "プロセス", "流れ", "方法", "やり方", "進め方"],
  "手順": ["手続き", "プロセス", "流れ", "方法", "やり方"],
  "プロセス": ["手続き", "手順", "流れ", "方法"],
  "方法": ["手続き", "手順", "プロセス", "やり方", "進め方"],
  "やり方": ["方法", "手続き", "手順", "進め方"],
  
  // 組織・会社関連
  "会社": ["企業", "職場", "勤務先", "組織", "法人"],
  "企業": ["会社", "職場", "勤務先", "組織", "法人"],
  "職場": ["会社", "企業", "勤務先", "組織"],
  "勤務先": ["会社", "企業", "職場", "組織"],
  "組織": ["会社", "企業", "職場", "勤務先"],
  
  // ビジネス・業務関連
  "会議": ["ミーティング", "打ち合わせ", "会合", "協議", "相談"],
  "ミーティング": ["会議", "打ち合わせ", "会合", "協議"],
  "打ち合わせ": ["会議", "ミーティング", "会合", "相談"],
  "資料": ["ドキュメント", "書類", "文書", "データ", "情報"],
  "ドキュメント": ["資料", "書類", "文書", "データ"],
  "書類": ["資料", "ドキュメント", "文書"],
  "文書": ["資料", "ドキュメント", "書類"],
  
  // 報告・連絡関連
  "報告": ["レポート", "報告書", "連絡", "通知", "報告"],
  "レポート": ["報告", "報告書", "連絡"],
  "報告書": ["レポート", "報告", "連絡"],
  "連絡": ["報告", "通知", "伝達", "お知らせ"],
  "通知": ["連絡", "お知らせ", "伝達"],
  
  // 開始・終了関連
  "開始": ["始める", "スタート", "開始する", "始まる"],
  "始める": ["開始", "スタート", "開始する"],
  "スタート": ["開始", "始める", "開始する"],
  "完了": ["終了", "完成", "終わる", "仕上がる", "完成"],
  "終了": ["完了", "終わる", "完成", "仕上がる"],
  "終わる": ["終了", "完了", "完成"],
  "完成": ["完了", "終了", "仕上がる"],
  
  // 学習・教育関連
  "授業": ["講義", "クラス", "レッスン", "指導"],
  "講義": ["授業", "クラス", "レッスン"],
  "クラス": ["授業", "講義", "レッスン"],
  "レッスン": ["授業", "講義", "クラス"],
  "勉強": ["学習", "学ぶ", "習う"],
  "学習": ["勉強", "学ぶ", "習う"],
  "学ぶ": ["勉強", "学習", "習う"],
  "習う": ["勉強", "学習", "学ぶ"],
  
  // 問題・課題関連
  "問題": ["課題", "issue", "トラブル", "困難"],
  "課題": ["問題", "タスク", "issue", "宿題"],
  "トラブル": ["問題", "issue", "困難", "障害"],
  "困難": ["問題", "トラブル", "障害"],
  
  // 改善・修正関連
  "改善": ["修正", "改良", "向上", "アップデート"],
  "修正": ["改善", "改良", "修復", "直す"],
  "改良": ["改善", "修正", "向上"],
  "向上": ["改善", "改良", "アップ"],
};

/**
 * キーワードの同義語を取得します
 * @param keyword - 元のキーワード
 * @returns 同義語の配列
 */
export function getSynonyms(keyword: string): string[] {
  const normalizedKeyword = keyword.toLowerCase().trim();
  return synonymDictionary[normalizedKeyword] || [];
}

/**
 * キーワードリストを同義語で拡張します
 * @param keywords - 元のキーワードリスト
 * @returns 同義語を含む拡張されたキーワードリスト
 */
export function expandKeywordsWithSynonyms(keywords: string[]): string[] {
  const expandedKeywords = new Set<string>();
  
  // 元のキーワードを追加
  keywords.forEach(keyword => {
    expandedKeywords.add(keyword);
    
    // 同義語を追加
    const synonyms = getSynonyms(keyword);
    synonyms.forEach(synonym => {
      expandedKeywords.add(synonym);
    });
  });
  
  return Array.from(expandedKeywords);
}

/**
 * 質問文から同義語を含む検索クエリを生成します
 * @param question - 元の質問文
 * @param keywords - 抽出されたキーワード
 * @returns 同義語を含む検索クエリ
 */
export function createSynonymExpandedQuery(question: string, keywords: string[]): string {
  const expandedKeywords = expandKeywordsWithSynonyms(keywords);
  const synonymKeywords = expandedKeywords.filter(kw => !keywords.includes(kw));
  
  if (synonymKeywords.length > 0) {
    return `${question} ${synonymKeywords.join(' ')}`;
  }
  
  return question;
}

/**
 * 同義語辞書に新しいエントリを追加します（動的拡張用）
 * @param word - 基準となる単語
 * @param synonyms - 同義語のリスト
 */
export function addSynonyms(word: string, synonyms: string[]): void {
  const normalizedWord = word.toLowerCase().trim();
  if (!synonymDictionary[normalizedWord]) {
    synonymDictionary[normalizedWord] = [];
  }
  
  synonyms.forEach(synonym => {
    const normalizedSynonym = synonym.toLowerCase().trim();
    if (!synonymDictionary[normalizedWord].includes(normalizedSynonym)) {
      synonymDictionary[normalizedWord].push(normalizedSynonym);
    }
  });
}

/**
 * デバッグ用: キーワード拡張の結果を表示
 * @param originalKeywords - 元のキーワード
 * @param expandedKeywords - 拡張されたキーワード
 */
export function logKeywordExpansion(originalKeywords: string[], expandedKeywords: string[]): void {
  console.log('🔄 同義語拡張結果:');
  console.log('  元のキーワード:', originalKeywords);
  console.log('  拡張後キーワード:', expandedKeywords);
  console.log('  追加された同義語:', expandedKeywords.filter(kw => !originalKeywords.includes(kw)));
}