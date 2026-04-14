const MAX_ENTRIES = 500;
const entries = [];

export function logError(source, message, stack = null) {
  entries.push({ ts: new Date().toISOString(), source, message, stack });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function getErrors({ limit = 100 } = {}) {
  return entries.slice(-limit).reverse();
}

export function clearErrors() {
  entries.length = 0;
}
