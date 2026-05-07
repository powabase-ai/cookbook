import { useEffect, useState } from "react";
import { fetchSourcePageImage } from "../lib/powabase-api";

interface Props {
  sourceId: string;
  pageCount: number; // we know this from page-texts response
}

export default function PageImageViewer({ sourceId, pageCount }: Props) {
  const [page, setPage] = useState(1);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    // Reset visible state on sourceId/page change so the previous image's
    // error or stale URL doesn't briefly show through while the new fetch
    // is in flight. Disable rule: the resets don't cascade — `setImgUrl(null)`
    // is followed by an async fetch + a single `setImgUrl(<blob URL>)` after
    // it resolves; no render loop.
    /* eslint-disable react-hooks/set-state-in-effect */
    setErrorMsg(null);
    setImgUrl(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetchSourcePageImage(sourceId, page)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setImgUrl(createdUrl);
      })
      .catch((e: Error) => {
        if (!cancelled) setErrorMsg(e.message);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [sourceId, page]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b text-sm">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-2 py-1 border rounded disabled:opacity-50"
        >
          ‹ Prev
        </button>
        <span>
          Page {page} of {pageCount}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          disabled={page >= pageCount}
          className="px-2 py-1 border rounded disabled:opacity-50"
        >
          Next ›
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        {errorMsg ? (
          <div className="text-sm text-gray-500 p-8 text-center">
            Page image not available ({errorMsg}). The source may not have
            rendered images yet — try refreshing in a moment, or check{" "}
            <code>
              {`/api/sources/${sourceId}/derivatives/image/download?index=${page - 1}`}
            </code>
            .
          </div>
        ) : imgUrl ? (
          <img
            src={imgUrl}
            alt={`Page ${page}`}
            className="max-w-full mx-auto shadow"
          />
        ) : (
          <div className="text-sm text-gray-400 p-8 text-center">Loading…</div>
        )}
      </div>
    </div>
  );
}
