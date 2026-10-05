import { describe, expect, it } from 'vitest';
import { answerDirection } from './direction';

describe('an answer has one direction, from its question', () => {
  it('follows the question’s letters, as the server does', () => {
    expect(answerDirection('اعطيني توصيه مباشره على XAUUSD', 'en')).toBe('rtl');
    expect(answerDirection('Give me a gold analysis', 'ar')).toBe('ltr');
    expect(answerDirection('4150?', 'ar')).toBe('rtl');
    expect(answerDirection('4150?', 'en')).toBe('ltr');
  });
});
