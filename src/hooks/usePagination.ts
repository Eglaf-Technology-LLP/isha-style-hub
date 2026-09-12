import { useEffect, useMemo, useState } from "react";

// Every list in admin/vendor (products, inventory, orders, returns) already
// fetches its full filtered array client-side with no LIMIT/OFFSET - this
// just slices that array for display rather than re-architecting each page
// onto server-side .range() paging, which none of them use today. One
// shared hook so "page 1 of N" behaves identically everywhere it's used.
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // A new search/filter can shrink the result set out from under the
  // current page (e.g. sitting on page 4, then a search narrows things to
  // 1 page) - snap back to page 1 instead of silently rendering nothing.
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const paginatedItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return { page, setPage, totalPages, paginatedItems, totalItems: items.length, pageSize };
}
