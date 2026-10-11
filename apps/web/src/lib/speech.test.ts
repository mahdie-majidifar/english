import { describe, expect, it } from 'vitest';
import { pickEnglishVoice } from './speech';

const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;

describe('pickEnglishVoice', () => {
  it('prefers a natural-sounding US voice', () => {
    const picked = pickEnglishVoice([voice('Microsoft David', 'en-US'), voice('Google US English', 'en-US'), voice('Google UK English', 'en-GB')]);
    expect(picked?.name).toBe('Google US English');
  });

  it('takes any US voice before a better-named British one', () => {
    expect(pickEnglishVoice([voice('Daniel', 'en-GB'), voice('Alex', 'en-US')])?.name).toBe('Alex');
  });

  it('falls back to another English voice, and understands underscores', () => {
    expect(pickEnglishVoice([voice('Samantha', 'en_AU'), voice('Hélène', 'fr-FR')])?.name).toBe('Samantha');
  });

  it('returns nothing when the device has no English voice', () => {
    expect(pickEnglishVoice([voice('Hélène', 'fr-FR')])).toBeUndefined();
    expect(pickEnglishVoice([])).toBeUndefined();
  });
});
