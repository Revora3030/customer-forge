/**
 * Scroll maths for the long_document reading layout. Pure, so it is testable
 * without a browser.
 */
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Where the reading line sits: a third of the way down the viewport. */
export const READING_LINE = 0.33;

/** 0 before the prose reaches the reading line, 1 once its end has passed it. */
export function readingProgress(top: number, height: number, viewportHeight: number): number {
  if (!(height > 0) || !(viewportHeight > 0)) return 0;
  return clamp((viewportHeight * READING_LINE - top) / height, 0, 1);
}

/** The chapter being read: the last one whose top has crossed the reading line, else none. */
export function activeChapter(chapterTops: readonly number[], viewportHeight: number): number | null {
  const line = viewportHeight * READING_LINE;
  let current: number | null = null;
  chapterTops.forEach((top, i) => {
    if (top <= line) current = i;
  });
  return current;
}
