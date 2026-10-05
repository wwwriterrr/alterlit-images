const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Дата комментария в том же виде, что в комментариях сайта: «05 окт. 2026 г., 15:40».
 * Бэк отдаёт московское время без пояса — показываем его как есть, без пересчёта:
 * собираем дату из частей и форматируем в местном времени, части не меняются.
 */
export function formatCommentDate(dt: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(dt);
  if (!match) return dt;
  const [, y, m, d, hh, mm] = match;
  return DATE_FORMAT.format(new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)));
}

/** Русское склонение по числу: [один, два-четыре, пять и больше]. */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
