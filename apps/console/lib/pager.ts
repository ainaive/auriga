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
  const lim = Number.isInteger(limit) && limit > 0 ? limit : 1; // guard against Infinity/NaN pages
  return {
    from: total === 0 ? 0 : offset + 1,
    to: Math.min(offset + lim, total),
    hasPrev: offset > 0,
    hasNext: offset + lim < total,
    page: Math.floor(offset / lim) + 1,
    pages: Math.max(1, Math.ceil(total / lim)),
  };
}
