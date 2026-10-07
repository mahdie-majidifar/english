import { Injectable } from '@nestjs/common';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

/** A problem with the file itself, with a message the learner can act on. */
export class ExtractionError extends Error {}

export interface Extracted {
  /** Text read from the file. */
  text?: string;
  /** For pictures: sent to the AI as an image instead of text. */
  image?: { mimeType: string; base64: string };
}

const MAX_TEXT_CHARS = 60_000;
/** Below this a PDF has no real text layer (it is a scan). */
const MIN_PDF_CHARS = 80;

@Injectable()
export class ExtractionService {
  async extract(mimeType: string, buffer: Buffer): Promise<Extracted> {
    if (mimeType.startsWith('image/')) {
      return { image: { mimeType, base64: buffer.toString('base64') } };
    }

    let text: string;
    switch (mimeType) {
      case 'text/plain':
        text = buffer.toString('utf8');
        break;
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        text = (await mammoth.extractRawText({ buffer })).value;
        break;
      case 'application/pdf': {
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        text = (await extractText(pdf, { mergePages: true })).text;
        if (text.trim().length < MIN_PDF_CHARS) {
          throw new ExtractionError(
            'This PDF has no readable text (it looks like a scan). Upload it as a picture instead.',
          );
        }
        break;
      }
      default:
        throw new ExtractionError('This file type is not supported.');
    }

    text = text.replace(/\r\n/g, '\n').trim();
    if (!text) throw new ExtractionError('The file is empty.');
    if (text.length > MAX_TEXT_CHARS) {
      throw new ExtractionError('This document is very long. Split it into smaller parts and upload them one by one.');
    }
    return { text };
  }
}
