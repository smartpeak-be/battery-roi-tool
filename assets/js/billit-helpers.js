export function normalizeBillitEmail(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : '';
}

export function normalizeBillitPhone(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const digits = text.replace(/\D/g, '');
  if (digits.length < 8) return '';
  return text;
}
