import { BadRequestException } from "@nestjs/common";
export class PaginationQueryDto {
  page = 1;
  limit = 20;
  search?: string;
  sortBy = "createdAt";
  sortOrder: "asc" | "desc" = "desc";
  filters?: string;
}
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export function parsePage(query: Record<string, unknown>) {
  const page = Number(query.page ?? 1),
    limit = Number(query.limit ?? 20);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new BadRequestException("INVALID_PAGINATION");
  if (query.sortOrder && !["asc", "desc"].includes(String(query.sortOrder)))
    throw new BadRequestException("INVALID_SORT");
  return { page, limit };
}
