"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { pagerBounds } from "@/lib/pager";

/** Prev/next pager that preserves the current filters in the URL. */
export function JobsPager({ total, limit, offset }: { total: number; limit: number; offset: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const { from, to, hasPrev, hasNext } = pagerBounds(total, limit, offset);

  function go(nextOffset: number) {
    const next = new URLSearchParams(params.toString());
    if (nextOffset > 0) next.set("offset", String(nextOffset));
    else next.delete("offset");
    router.push(`/jobs${next.toString() ? `?${next}` : ""}`);
  }

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-label="previous page"
          disabled={!hasPrev}
          onClick={() => go(Math.max(0, offset - limit))}
        >
          Prev
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-label="next page"
          disabled={!hasNext}
          onClick={() => go(offset + limit)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
