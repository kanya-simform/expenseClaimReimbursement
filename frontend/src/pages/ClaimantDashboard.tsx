import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { categoryLabelFor, formatCurrency, StatusBadge } from "@/components/claim-display";
import { ClaimLineItemsForm } from "@/components/ClaimLineItemsForm";
import { LineItemAttachments } from "@/components/LineItemAttachments";
import { PaginationControls } from "@/components/PaginationControls";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createClaim,
  deleteClaim,
  importClaimCsv,
  listClaims,
  updateClaim,
} from "@/lib/claims-api";
import type { ClaimLineItemsFormValues } from "@/lib/claim-line-items-schema";
import { getCsvImportErrorMessage, getErrorMessage } from "@/lib/get-error-message";
import type { Claim, ClaimStatus } from "@/lib/types";

const CLAIM_STATUS_FILTER_LABEL: Record<ClaimStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const SAMPLE_CSV = `date,category,customCategory,amount,description,receipt
2026-01-15,TRAVEL,,120.50,Flight to client site,flight-receipt.pdf
2026-01-16,OTHER,Team offsite venue,200,Venue deposit,
2026-01-17,MEALS,,25.75,Team lunch,
`;
const SAMPLE_CSV_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;

function NewClaimCard() {
  const queryClient = useQueryClient();
  const [formKey, setFormKey] = useState(0);

  const mutation = useMutation({
    mutationFn: (lineItems: ClaimLineItemsFormValues["lineItems"]) =>
      createClaim(lineItems.map((item) => ({ ...item, amount: Number(item.amount) }))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["claims"] });
      // Force the form back to a single blank row after a successful submit.
      setFormKey((key) => key + 1);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit a new claim</CardTitle>
        <CardDescription>Add each expense as its own line item.</CardDescription>
      </CardHeader>
      <CardContent>
        <ClaimLineItemsForm
          key={formKey}
          submitLabel="Submit claim"
          submittingLabel="Submitting…"
          onSubmit={(lineItems) => mutation.mutateAsync(lineItems)}
        />
      </CardContent>
    </Card>
  );
}

function ImportCsvCard() {
  const queryClient = useQueryClient();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const receiptsInputRef = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ file, receipts }: { file: File; receipts: File[] }) =>
      importClaimCsv(file, receipts),
    onSuccess: (claim) => {
      setError(null);
      setCsvFile(null);
      setReceiptFiles([]);
      if (csvInputRef.current) csvInputRef.current.value = "";
      if (receiptsInputRef.current) receiptsInputRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["claims"] });
      toast.success(
        `Claim imported with ${claim.lineItems.length} line item${claim.lineItems.length === 1 ? "" : "s"}`,
      );
    },
    onError: (err: unknown) => setError(getCsvImportErrorMessage(err)),
  });

  function handleCsvChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setCsvFile(event.target.files?.[0] ?? null);
  }

  function handleReceiptsChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setReceiptFiles(Array.from(event.target.files ?? []));
  }

  function handleImport() {
    if (!csvFile) return;
    mutation.mutate({ file: csvFile, receipts: receiptFiles });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Or import from a CSV</CardTitle>
        <CardDescription>
          Columns: date, category, amount, description — plus customCategory when category is Other,
          and an optional receipt column naming one of the files you attach below.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-2">
          <div className="flex items-center gap-3">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleCsvChange}
            />
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => csvInputRef.current?.click()}
            >
              <Upload className="size-4" />
              Choose CSV
            </Button>
            <span className="text-sm text-muted-foreground">
              {csvFile ? csvFile.name : "No file selected"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={receiptsInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
              multiple
              className="hidden"
              onChange={handleReceiptsChange}
            />
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => receiptsInputRef.current?.click()}
            >
              <Upload className="size-4" />
              Choose receipts
            </Button>
            <span className="text-sm text-muted-foreground">
              {receiptFiles.length > 0
                ? `${receiptFiles.length} file(s) selected`
                : "No receipts selected (optional)"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" disabled={!csvFile || mutation.isPending} onClick={handleImport}>
            {mutation.isPending ? "Importing…" : "Import"}
          </Button>
          <a
            href={SAMPLE_CSV_HREF}
            download="expense-claims-sample.csv"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Download sample
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function ClaimCard({ claim }: Readonly<{ claim: Claim }>) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const canEdit = claim.status !== "APPROVED";
  const canDelete = claim.status === "PENDING";

  const mutation = useMutation({
    mutationFn: (lineItems: ClaimLineItemsFormValues["lineItems"]) =>
      updateClaim(
        claim.id,
        lineItems.map((item) => ({ ...item, amount: Number(item.amount) })),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["claims"] });
      setIsEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteClaim(claim.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["claims"] });
      toast.success("Claim deleted");
      setIsDeleteDialogOpen(false);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err, "Could not delete the claim")),
  });

  if (isEditing) {
    return (
      <Card>
        <CardContent>
          <ClaimLineItemsForm
            defaultLineItems={claim.lineItems.map((item) => ({
              id: item.id,
              date: item.date.slice(0, 10),
              category: item.category,
              customCategory: item.customCategory ?? "",
              amount: Number(item.amount) as unknown as number,
              description: item.description,
            }))}
            submitLabel="Save changes"
            submittingLabel="Saving…"
            onSubmit={(lineItems) => mutation.mutateAsync(lineItems)}
            onCancel={() => setIsEditing(false)}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="grid gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusBadge status={claim.status} />
              <span className="text-sm text-muted-foreground">
                {new Date(claim.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium">{formatCurrency(claim.totalAmount)}</span>
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </Button>
              )}
              {canDelete && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
          <ul className="grid gap-3 text-sm text-muted-foreground">
            {claim.lineItems.map((item) => (
              <li key={item.id} className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <span>
                    {new Date(item.date).toLocaleDateString()} · {categoryLabelFor(item)} ·{" "}
                    {item.description}
                  </span>
                  <span>{formatCurrency(item.amount)}</span>
                </div>
                <LineItemAttachments
                  claimId={claim.id}
                  lineItemId={item.id}
                  attachments={item.attachments}
                  canModify={canEdit}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open && deleteMutation.isPending) return;
          setIsDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this claim?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the claim, its line items, and any attached receipts.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ClaimsList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<ClaimStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  function handleStatusChange(value: ClaimStatus | "ALL") {
    setStatus(value);
    setPage(1);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["claims", { search: debouncedSearch, status, page }],
    queryFn: () =>
      listClaims({
        search: debouncedSearch || undefined,
        status: status === "ALL" ? undefined : status,
        page,
      }),
  });

  const claims = data?.claims ?? [];
  const hasFilters = debouncedSearch !== "" || status !== "ALL";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search description or category…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(value) => handleStatusChange(value as ClaimStatus | "ALL")}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {(["PENDING", "APPROVED", "REJECTED"] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {CLAIM_STATUS_FILTER_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading claims…</p>}

      {!isLoading && claims.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {hasFilters ? "No claims match your filters." : "You haven't submitted any claims yet."}
        </p>
      )}

      {claims.map((claim) => (
        <ClaimCard key={claim.id} claim={claim} />
      ))}

      {data?.pagination && (
        <PaginationControls pagination={data.pagination} onPageChange={setPage} />
      )}
    </div>
  );
}

export function ClaimantDashboard() {
  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My claims</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit itemised expense claims and track their status.
          </p>
        </div>
        <NewClaimCard />
        <ImportCsvCard />
        <div>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Submitted claims</h2>
          <ClaimsList />
        </div>
      </div>
    </AppShell>
  );
}
