// French (fr-FR, Europe/Paris) formatting helpers. Amounts are integer cents.
const TZ = "Europe/Paris";

export function formatEuroCents(cents: number): string {
  const euros = cents / 100;
  if (Number.isInteger(euros)) return `${euros} €`;
  return `${euros.toFixed(2).replace(".", ",")} €`;
}

export function formatTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const s = new Intl.DateTimeFormat("fr-FR", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    return s.replace(":", "h");
  } catch {
    return "";
  }
}

export function formatDateShort(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const s = new Intl.DateTimeFormat("fr-FR", {
      timeZone: TZ,
      weekday: "short",
      day: "numeric",
      month: "long",
    }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return "";
  }
}

export function formatDateLong(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const s = new Intl.DateTimeFormat("fr-FR", {
      timeZone: TZ,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return "";
  }
}
