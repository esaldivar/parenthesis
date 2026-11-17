/** An extension at the end, such as "ext. 12", "x12" or "#12". */
const EXTENSION = /(?:ext\.?|extension|x|#)\s*\d{1,6}\s*$/i;
/** Only digits, spaces and phone punctuation. */
const PHONE_CHARACTERS = /^[\d\s().+-]+$/;

/**
 * Shows a U.S. teacher phone number as (XXX) XXX-XXXX (#655), keeping any extension. Anything else, such as an
 * international number, is shown exactly as the parent typed it. Only the display changes; the saved text doesn't.
 */
export function teacherPhoneDisplay(value: string): string {
  const extension = EXTENSION.exec(value);
  const number = (extension ? value.slice(0, extension.index) : value).trim();
  if (!PHONE_CHARACTERS.test(number)) return value;
  let digits = number.replace(/\D/g, '');
  // +1 or a leading 1 is the U.S. country code; any other + is another country's number.
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  else if (number.startsWith('+')) return value;
  if (digits.length !== 10) return value;
  const formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return extension ? `${formatted} ${extension[0].trim()}` : formatted;
}
