import { useEffect, useRef } from "react";
import { ProgressiveImage } from "../feed/parts";

interface Props {
  preview: string;
  full: string;
  alt: string;
  onClose: () => void;
}

/**
 * Просмотр картинки во весь экран поверх диалога. Это ещё один модальный <dialog>,
 * а настоящий полноэкранный режим браузера включаем его внутренней рамке: сам
 * <dialog> браузер полноэкранным сделать не даёт («Dialog elements are invalid»).
 * Где Fullscreen API для обычных элементов нет (iPhone), остаётся просто слой
 * на всё окно — выглядит так же.
 */
export function FullscreenViewer({ preview, full, alt, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    const frame = frameRef.current;
    if (!dialog || !frame) return;
    if (!dialog.open) dialog.showModal();
    closeRef.current?.focus();
    // Нажатие на кнопку ещё считается жестом пользователя, так что браузер
    // разрешит полноэкранный режим. Отказ не страшен — останется слой на всё окно.
    if (frame.requestFullscreen && document.fullscreenElement !== frame) {
      frame.requestFullscreen().catch(() => {});
    }
    // Esc в полноэкранном режиме браузер забирает себе и только выходит из него.
    // Ловим этот выход и закрываем просмотр, чтобы хватало одного нажатия.
    const handleChange = () => {
      if (document.fullscreenElement !== frame && dialog.open) dialog.close();
    };
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const close = () => {
    const dialog = ref.current;
    if (!dialog) return;
    // Выход из полноэкранного режима сам закроет диалог через fullscreenchange.
    if (document.fullscreenElement === frameRef.current) document.exitFullscreen().catch(() => dialog.close());
    else dialog.close();
  };

  return (
    <dialog ref={ref} className="il-fullscreen" aria-label="Иллюстрация во весь экран" onClose={onClose}>
      <div ref={frameRef} className="il-fullscreen__frame">
        <ProgressiveImage className="il-picture--contain" preview={preview} full={full} alt={alt} />
        <button ref={closeRef} className="il-close il-fullscreen__close" type="button" onClick={close} aria-label="Закрыть просмотр во весь экран">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </dialog>
  );
}
