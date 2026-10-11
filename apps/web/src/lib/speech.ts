/**
 * Reading English aloud with the device's own voice (the browser's speech synthesis). It costs nothing,
 * needs no key and sends nothing anywhere. The voices differ by device; there may be none at all.
 */

export const speechSupported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** The nicest English voice the device has: a US one, preferably a "natural" or network one. */
export function pickEnglishVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const us = english.filter((v) => /^en[-_]US$/i.test(v.lang));
  const nice = (v: SpeechSynthesisVoice) => /natural|neural|online|google|samantha|aria|jenny/i.test(v.name);
  return us.find(nice) ?? us[0] ?? english.find(nice) ?? english[0];
}

export interface SpeakOptions {
  /** A slower voice, for hearing each sound. */
  slow?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
}

/** Reads the text aloud, stopping anything already being read. Returns false when the device cannot speak. */
export function speak(text: string, { slow = false, onStart, onEnd }: SpeakOptions = {}): boolean {
  if (!speechSupported() || !text.trim()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  const voice = pickEnglishVoice(synth.getVoices());
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  utterance.rate = slow ? 0.6 : 0.95;
  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  synth.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}
