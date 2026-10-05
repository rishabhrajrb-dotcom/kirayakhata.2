// Cleans the optional free-text note and detects requests we must refuse.
// Raw notes are never stored or logged; only presence/length/flags are.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

export function cleanNote(raw, max = 280) {
  if (typeof raw !== 'string') return '';
  return raw.replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Deterministic guardrail: evasion, dishonest backdating, hiding or splitting rent to dodge
// obligations. Ordinary lawful questions ("is my rent taxable?") pass.
const REFUSE_PATTERNS = [
  /\b(evade|evasion|dodge|avoid paying|escape)\b.{0,40}\b(gst|tds|tax|taxes)\b/i,
  /\b(hide|conceal|not (show|declare|report)|keep off)\b.{0,40}\b(rent|income|receipt|payment)s?\b/i,
  /\b(backdate|back-date|ante-?date|fake date|change the date)\b/i,
  /\bsplit\b.{0,40}\b(rent|invoice|payment|agreement)s?\b.{0,60}\b(below|under|avoid|threshold|limit)\b/i,
  /\b(cash|in cash)\b.{0,30}\b(so|to)\b.{0,20}\b(no|avoid|without)\b.{0,15}\b(tax|gst|tds|record)/i,
  /\b(fake|bogus|false)\b.{0,20}\b(invoice|bill|receipt|agreement)s?\b/i,
  /(टैक्स|कर|जीएसटी|GST|TDS).{0,20}(बचाने|छिपा|चोरी)/,
  /(किराया|आय).{0,20}(छिपा|न दिखा)/,
];

export function guardrail(note) {
  if (!note) return { refused: false, flags: [] };
  const flags = REFUSE_PATTERNS.filter((re) => re.test(note)).map((re) => re.source.slice(0, 24));
  return { refused: flags.length > 0, flags };
}
