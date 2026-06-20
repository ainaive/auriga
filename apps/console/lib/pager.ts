// Pure pagination math for the jobs pager (unit-tested; keeps the component free of logic).

export interface PagerBounds {
  from: number;
  to: number;
  hasPrev: boolean;
  hasNext: boolean;
  page: number;
  pages: number;
}

export function pagerBounds(total: number, limit: number, offset: number): PagerBounds {
  return {
    from: total === 0 ? 0 : offset + 1,
    to: Math.min(offset + limit, total),
    hasPrev: offset > 0,
    hasNext: offset + limit < total,
    page: Math.floor(offset / limit) + 1,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}
