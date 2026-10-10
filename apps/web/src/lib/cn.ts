import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and lets the last one win when two set the same thing (`bg-card` then `bg-brand`). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
