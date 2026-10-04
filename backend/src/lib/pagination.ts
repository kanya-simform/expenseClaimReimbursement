const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

export interface PaginationInput {
  page?: number;
  pageSize?: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function resolvePagination(input: PaginationInput) {
  const page = input.page && input.page > 0 ? Math.floor(input.page) : 1;
  const pageSize =
    input.pageSize && input.pageSize > 0
      ? Math.min(Math.floor(input.pageSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function buildPaginationMeta(total: number, page: number, pageSize: number): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
