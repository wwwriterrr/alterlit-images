import { useEffect, useRef } from "react";
import { useGetImagesInfiniteQuery } from "../../api/imagesApi";
import { useGetSessionUserQuery } from "../../api/authApi";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { ImageDialog } from "../viewer/ImageDialog";
import { imageClosed, imageOpened } from "../viewer/viewerSlice";
import { prefetchCommentForm } from "../viewer/lazyCommentForm";
import { useLikeAction } from "../likes/useLikeAction";
import { ImageCard, SkeletonCard } from "./ImageCard";

/** Сколько скелетонов показывать: первая загрузка — почти экран, догрузка — пара рядов. */
const INITIAL_SKELETONS = 9;
const NEXT_SKELETONS = 6;

/** Начинаем догружать заранее, чтобы пользователь не упирался в скелетоны. */
const PREFETCH_MARGIN = "800px";

export function Feed({ slug }: { slug: string }) {
  const dispatch = useAppDispatch();
  const openImageId = useAppSelector((state) => state.viewer.openImageId);
  const { data: viewer } = useGetSessionUserQuery();
  const onLike = useLikeAction(slug);

  // Вошедшему понадобится редактор комментариев — греем его бандл заранее.
  const isSignedIn = Boolean(viewer);
  useEffect(() => {
    if (isSignedIn) prefetchCommentForm();
  }, [isSignedIn]);
  const {
    data,
    error,
    isLoading,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useGetImagesInfiniteQuery(slug);

  const images = data?.pages.flatMap((page) => page.images) ?? [];
  const openImage = openImageId === null ? null : (images.find((image) => image.id === openImageId) ?? null);
  const canLoadMore = hasNextPage && !isFetchingNextPage && !isFetchNextPageError;

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !canLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
      },
      { rootMargin: `0px 0px ${PREFETCH_MARGIN} 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, fetchNextPage]);

  if (isLoading) {
    return <Grid>{skeletons(INITIAL_SKELETONS)}</Grid>;
  }

  // 404 на первой странице — по этому slug картинок нет.
  if (!images.length && error && "status" in error && error.status === 404) {
    return <p className="il-status">Иллюстраций здесь пока нет.</p>;
  }

  if (!images.length && error) {
    return (
      <div className="il-status" role="alert">
        <p>Не удалось загрузить иллюстрации. Проверьте соединение и попробуйте ещё раз.</p>
        <button className="il-button" type="button" onClick={() => void refetch()}>
          Загрузить снова
        </button>
      </div>
    );
  }

  return (
    <>
      <Grid>
        {images.map((image) => (
          <ImageCard
            key={image.id}
            image={image}
            viewerId={viewer?.id ?? null}
            onOpen={(id) => dispatch(imageOpened(id))}
            onLike={onLike}
          />
        ))}
        {isFetchingNextPage && skeletons(NEXT_SKELETONS)}
      </Grid>
      {isFetchNextPageError && (
        <div className="il-status" role="alert">
          <p>Следующие иллюстрации не загрузились.</p>
          <button className="il-button" type="button" onClick={() => void fetchNextPage()}>
            Загрузить снова
          </button>
        </div>
      )}
      {!hasNextPage && !isFetchNextPageError && <p className="il-status il-status--end">Это все иллюстрации.</p>}
      <div ref={sentinelRef} className="il-sentinel" />
      <ImageDialog
        image={openImage}
        viewer={viewer ?? null}
        onClose={() => dispatch(imageClosed())}
        onLike={onLike}
      />
    </>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="il-grid">{children}</div>;
}

function skeletons(count: number) {
  return Array.from({ length: count }, (_, i) => <SkeletonCard key={`skeleton-${i}`} />);
}
