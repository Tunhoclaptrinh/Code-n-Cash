import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResourceClient } from "@codecash/api-client";
import type { Entity, PageQuery } from "@codecash/contracts";
export function useResource<T extends Entity>(
  name: string,
  service: ResourceClient<T>,
  initial: PageQuery = {},
) {
  const [params, setParams] = useState<PageQuery>({
    page: 1,
    limit: 20,
    ...initial,
  });
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["resource", name, params],
    queryFn: ({ signal }) => service.list(params, signal),
  });
  const refresh = () =>
    cache.invalidateQueries({ queryKey: ["resource", name] });
  const create = useMutation({
    mutationFn: (data: Partial<T>) => service.create(data),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<T> }) =>
      service.update(id, data),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => service.remove(id),
    onSuccess: async () => {
      if (query.data?.items.length === 1 && (params.page ?? 1) > 1)
        setParams((p) => ({ ...p, page: (p.page ?? 1) - 1 }));
      await refresh();
    },
  });
  const change = useMemo(
    () => ({
      search: (search: string) => setParams((p) => ({ ...p, search, page: 1 })),
      filter: (filters: PageQuery["filters"]) =>
        setParams((p) => ({ ...p, filters, page: 1 })),
      page: (page: number, limit: number) =>
        setParams((p) => ({ ...p, page: limit !== p.limit ? 1 : page, limit })),
      sort: (sortBy: string, sortOrder: "asc" | "desc") =>
        setParams((p) => ({ ...p, sortBy, sortOrder, page: 1 })),
    }),
    [],
  );
  return { query, params, setParams, change, create, update, remove, refresh };
}
