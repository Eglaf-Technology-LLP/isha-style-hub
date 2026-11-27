// Where a role or boutique check (has_role, can_operate_warehouse, the
// boutique lookup) stands for the signed-in person. A screen decides "not an
// admin" or "no boutique yet" only once the check has really answered: while
// it's asked (or asked again after failing) it's `loading`, and a check that
// still failed after React Query's retries is `failed` - shown as "couldn't
// load, try again", never as "Access Denied" or the Sell with us form.
// (Before 28 Nov 2026 the dashboards briefly showed "Access Denied" or the
// storefront right after signing in, while the answer was still on its way.)
// The checks' queries set this. A failed check isn't asked again just because
// a screen mounted: StaffOnlyGate shows a spinner while a check is asked,
// which unmounts the page, whose mount would ask again - round and round.
// "Try again" and the tab coming back into view still ask again.
export const ACCESS_CHECK_QUERY = { retryOnMount: false } as const;

export interface CheckQuery {
  data: unknown;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
}

export function accessCheckState(signedIn: boolean, authLoading: boolean, ...queries: CheckQuery[]) {
  const unanswered = queries.filter((q) => signedIn && q.data === undefined);
  const asking = unanswered.some((q) => q.isPending || q.isFetching);
  return {
    loading: authLoading || asking,
    failed: !authLoading && !asking && unanswered.some((q) => q.isError),
  };
}
