import { Button } from "@/components/ui/button";
import type { Pagination } from "@/lib/types";

interface PaginationControlsProps {
  pagination: Pagination;
  onPageChange: (page: number) => void;
}

export function PaginationControls({
  pagination,
  onPageChange,
}: Readonly<PaginationControlsProps>) {
  if (pagination.totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
