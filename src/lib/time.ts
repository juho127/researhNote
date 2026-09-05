export function nowIso(): string {
  return new Date().toISOString();
}

/** 지정 타임존 기준 오늘 날짜 YYYY-MM-DD */
export function todayIn(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

export function daysAgoDate(days: number, tz: string): string {
  const d = new Date(Date.now() - days * 86400_000);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
