import { useEffect, useRef, useState } from "react";

/**
 * Превью — квадрат 60×60 весом около полкилобайта: показываем его размытым сразу,
 * а полноразмерный `full` грузится поверх и проявляется, когда готов.
 * `lazy` — не грузить оригинал, пока картинка далеко от экрана (для ленты).
 */
export function ProgressiveImage({
  preview,
  full,
  alt = "",
  lazy = false,
  className,
  onSize,
}: {
  preview: string;
  full: string;
  alt?: string;
  lazy?: boolean;
  className?: string;
  /** Настоящие размеры оригинала, когда он загрузился. */
  onSize?: (width: number, height: number) => void;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const fullRef = useRef<HTMLImageElement>(null);

  // Из кэша картинка может оказаться готовой раньше, чем React повесит onLoad.
  useEffect(() => {
    const img = fullRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setState("loaded");
      onSize?.(img.naturalWidth, img.naturalHeight);
    }
    // Нужен только первый рендер: дальше сработает onLoad.
  }, []);

  return (
    <span className={className ? `il-picture ${className}` : "il-picture"} data-state={state}>
      <img className="il-picture__preview" src={preview} alt="" aria-hidden="true" decoding="async" />
      <img
        ref={fullRef}
        className="il-picture__full"
        src={full}
        alt={alt}
        loading={lazy ? "lazy" : "eager"}
        decoding="async"
        onLoad={(event) => {
          setState("loaded");
          onSize?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
        }}
        onError={() => setState("failed")}
      />
    </span>
  );
}

export function Avatar({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const cls = className ? `il-avatar ${className}` : "il-avatar";
  if (!src || broken) {
    return (
      <span className={`${cls} il-avatar--initial`} aria-hidden="true">
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return <img className={cls} src={src} alt="" loading="lazy" onError={() => setBroken(true)} />;
}

export const HEART_PATH =
  "M38.2599 9.36668C39.9858 14.7288 38.5414 20.185 35.4976 24.2961C33.4884 27.0839 31.0873 29.4866 28.6324 31.5871C26.3738 33.7011 21.3195 37.8838 19.9797 38C18.7956 37.7724 17.4669 36.426 16.5268 35.733C11.2443 31.6953 5.55778 26.7851 2.67447 21.4164C0.257036 16.2622 0.252602 9.88715 4.01501 5.93558C8.89358 1.51324 16.2485 2.37737 19.9797 6.99761C20.9818 5.69053 22.214 4.66254 23.6764 3.9137C29.6048 1.53428 35.7722 3.95885 38.2599 9.36668V9.36668Z";

/**
 * Сердечко со счётчиком. Нажатие переключает лайк; `onToggle` возвращает true,
 * если лайк действительно переключается (гостю вместо этого покажут окно), —
 * только тогда играем короткую анимацию.
 */
export function LikeButton({
  count,
  mine,
  onToggle,
}: {
  count: number;
  mine: boolean;
  onToggle: () => boolean;
}) {
  const [pulse, setPulse] = useState<"in" | "out" | null>(null);

  return (
    <button
      type="button"
      className="il-stat il-stat--likes il-like"
      data-mine={mine || undefined}
      data-pulse={pulse ?? undefined}
      aria-pressed={mine}
      aria-label={`Нравится: ${count} ${plural(count, ["лайк", "лайка", "лайков"])}`}
      onClick={() => {
        if (onToggle()) setPulse(mine ? "out" : "in");
      }}
      onAnimationEnd={() => setPulse(null)}
    >
      <svg className="il-stat__icon" viewBox="0 0 40 40" aria-hidden="true">
        <path d={HEART_PATH} />
      </svg>
      <span className="il-stat__value">{count}</span>
    </button>
  );
}

export function CommentsCount({ count }: { count: number }) {
  return (
    <span
      className="il-stat il-stat--comments"
      data-has={count > 0 || undefined}
      aria-label={`${count} ${plural(count, ["комментарий", "комментария", "комментариев"])}`}
    >
      {/* clipPath из исходной иконки выброшен: он ничего не обрезал, а одинаковые id
          в десятках копий SVG на странице дали бы невалидный документ. */}
      <svg className="il-stat__icon" viewBox="0 0 41 41" aria-hidden="true">
        <path d="M20.5811 2.79028C9.53418 2.79028 0.581055 10.0637 0.581055 19.0403C0.581055 22.9153 2.25293 26.4622 5.03418 29.2512C4.05762 33.1887 0.791992 36.6965 0.75293 36.7356C0.581055 36.9153 0.53418 37.1809 0.635742 37.4153C0.737305 37.6497 0.956055 37.7903 1.20605 37.7903C6.38574 37.7903 10.2686 35.3059 12.1904 33.7747C14.7451 34.7356 17.5811 35.2903 20.5811 35.2903C31.6279 35.2903 40.5811 28.0168 40.5811 19.0403C40.5811 10.0637 31.6279 2.79028 20.5811 2.79028Z" />
      </svg>
      <span className="il-stat__value">{count}</span>
    </span>
  );
}

/**
 * Отображаемое имя пользователя: ник (в API это поле `name`), а если он пустой — логин.
 * Везде берём имя отсюда, чтобы правило было одно.
 */
export function authorName(author: { name: string; username: string }): string {
  return author.name || author.username;
}

/** Страница профиля на alterlit.ru. В dev путь проксируется на сайт, см. vite.config.ts. */
export function profileUrl(username: string): string {
  return `/profile/${encodeURIComponent(username)}/`;
}

/** Русское склонение по числу: [один, два-четыре, пять и больше]. */
function plural(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
