const REVIEW_LIMIT = 5

export function parseNaverVisitorReviewTexts(rawTexts: string[]): string[] {
  return Array.from(
    new Set(
      rawTexts
        .map((text) => text.replace(/\s+/g, ' ').trim())
        .filter((text) => text.length > 1 && text !== '더보기'),
    ),
  ).slice(0, REVIEW_LIMIT)
}
