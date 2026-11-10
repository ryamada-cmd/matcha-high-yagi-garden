// Draft persistence is optional: private mode or quota limits must never stop a form.
export function saveLocalDraft(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false }
}
export function removeLocalDraft(key: string): void {
  try { localStorage.removeItem(key) } catch { /* Keep the current form usable. */ }
}
