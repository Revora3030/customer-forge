/** Corrects a common customer typo without changing the words shown in chat. */
export function normalizeBuilderInstruction(instruction: string): string {
  if (!/\bfronts?\b/i.test(instruction)) return instruction;
  if (!/\b(?:background|colou?r|style|typeface|typography)\b/i.test(instruction)) return instruction;
  return `${instruction}\n\nINTERPRETATION NOTE: In this styling request, “front/fronts” means “font/fonts”, not foreground colour.`;
}
