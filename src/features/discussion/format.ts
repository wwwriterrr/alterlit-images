const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/**
 * Дата комментария. Бэк отдаёт время без часового пояса («2026-09-16T19:28:08.266706»),
 * поэтому показываем его как есть, ничего не пересчитывая.
 */
export function formatCommentDate(dt: string, now = new Date()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(dt);
  if (!match) return dt;
  const [, y, m, d, hh, mm] = match;
  const year = Number(y);
  const month = Number(m) - 1;
  const day = Number(d);
  const time = `${hh}:${mm}`;

  const date = new Date(year, month, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return `сегодня в ${time}`;
  if (diffDays === 1) return `вчера в ${time}`;
  if (year === now.getFullYear()) return `${day} ${MONTHS[month]} в ${time}`;
  return `${day} ${MONTHS[month]} ${year}`;
}

/** Русское склонение по числу: [один, два-четыре, пять и больше]. */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
