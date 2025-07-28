/**
 * 2つのベクトル間のコサイン類似度を計算します。
 * @param vecA - 最初のベクトル。
 * @param vecB - 2番目のベクトル。
 * @returns コサイン類似度スコア（-1から1の間）。
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    // ベクトルは同じ次元でなければなりません。
    return 0;
  }

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) {
    // どちらかのベクトルがゼロベクトルです。
    return 0;
  }

  return dotProduct / (magA * magB);
}
