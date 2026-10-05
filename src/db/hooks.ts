/**
 * Observing WatermelonDB queries/records from components.
 *
 * Watermelon updates model instances in place, while the React Compiler memoizes on object
 * identity. So: read model fields in the component that owns the query result (each emission
 * is a new array) and pass primitives down, and use useRecord's `select` snapshot for single records.
 */
import type { Model, Query } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';

/**
 * Live results of a query. `columns`: also emit when these columns change on the
 * returned records (by default only additions/removals are observed).
 */
export function useQuery<T extends Model>(make: () => Query<T>, deps: readonly unknown[], columns?: string[]) {
  const [records, setRecords] = useState<T[] | undefined>(undefined);
  useEffect(() => {
    const query = make();
    const source = columns ? query.observeWithColumns(columns) : query.observe();
    const sub = source.subscribe((list) => setRecords(list.slice()));
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return records;
}

/**
 * Live snapshot of one record: undefined while loading, null when missing or deleted.
 * `select` copies the fields the component needs; `record` is the model for writes.
 */
export function useRecord<T extends Model, S extends object>(
  make: () => Promise<T> | null,
  select: (record: T) => S,
  deps: readonly unknown[],
) {
  const [state, setState] = useState<{ value: (S & { record: T }) | null } | undefined>(undefined);
  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | undefined;
    const gone = () => live && setState({ value: null });
    (make() ?? Promise.resolve(null)).then((r) => {
      if (!r) return gone();
      if (!live) return;
      const sub = r.observe().subscribe({
        next: (record) => live && setState({ value: { ...select(record), record } }),
        complete: gone,
        error: gone,
      });
      unsubscribe = () => sub.unsubscribe();
    }, gone);
    return () => {
      live = false;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state?.value;
}
