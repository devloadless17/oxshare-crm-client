import type { Locale } from '@/lib/i18n';

/**
 * The language an answer is written in, decided from the QUESTION by the same
 * rule the backend uses to choose it (`languageOf`): more Arabic letters than
 * Latin ones means Arabic. With no letters at all, the portal's language.
 *
 * One direction for the whole answer. Per-paragraph `dir="auto"` flipped every
 * Arabic line that began with a Latin term ("Stop Loss: …", "TP1: …") to
 * left-to-right, so its bullet jumped to the left and the line read backwards.
 * Taken from the question, it is also fixed before the first word streams in.
 */
export function answerDirection(question: string, fallback: Locale): 'rtl' | 'ltr' {
  const arabic = question.match(/[؀-ۿ]/g)?.length ?? 0;
  const latin = question.match(/[A-Za-z]/g)?.length ?? 0;
  if (arabic === 0 && latin === 0) return fallback === 'ar' ? 'rtl' : 'ltr';
  return arabic >= latin ? 'rtl' : 'ltr';
}
