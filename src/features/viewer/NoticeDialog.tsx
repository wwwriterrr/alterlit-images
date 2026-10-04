import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { HEART_PATH } from "../feed/parts";
import { noticeClosed } from "./viewerSlice";

/**
 * Короткое окно-предупреждение поверх всего, в том числе поверх диалога
 * просмотра: showModal() кладёт его в верхний слой последним.
 */
export function NoticeDialog() {
  const dispatch = useAppDispatch();
  const notice = useAppSelector((state) => state.viewer.notice);
  const ref = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (notice && !dialog.open) {
      dialog.showModal();
      buttonRef.current?.focus();
    }
    if (!notice && dialog.open) dialog.close();
  }, [notice]);

  return (
    <dialog
      ref={ref}
      className="il-notice"
      aria-describedby="il-notice-text"
      onClose={() => dispatch(noticeClosed())}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <svg className="il-notice__icon" viewBox="0 0 40 40" aria-hidden="true">
        <path d={HEART_PATH} />
      </svg>
      <p className="il-notice__text" id="il-notice-text">
        {notice}
      </p>
      <button ref={buttonRef} className="il-button" type="button" onClick={() => ref.current?.close()}>
        Понятно
      </button>
    </dialog>
  );
}
