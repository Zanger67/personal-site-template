// "Incoming": a role/membership/item whose start MONTH is later than the current
// one (it hasn't begun yet). The timeline bars tag these via mkItem; this shared
// helper lets the list, detail and homepage rows read "<name> (incoming)" too, so
// a future-dated entry looks the same in every view. String-based (YYYY-MM / YYYY)
// so it needs no Date parsing of the source data.
export function isIncomingStart(start?: string | null): boolean {
  if (!start) return false;
  const [y, m] = start.split('-').map(Number);
  if (!Number.isFinite(y)) return false;
  const now = new Date();
  return y * 12 + (Number.isFinite(m) ? m - 1 : 0) > now.getFullYear() * 12 + now.getMonth();
}

// Tag a name "(incoming)" when its start is still in the future — unless it already
// says so (any case).
export function withIncoming(name: string, start?: string | null): string {
  return isIncomingStart(start) && !/\bincoming\b/i.test(name) ? `${name} (incoming)` : name;
}
