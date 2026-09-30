import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { RequiredMark } from "@/components/RequiredMark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClaim, listClaims } from "@/lib/claims-api";
import { CATEGORY_LABEL, EXPENSE_CATEGORIES } from "@/lib/categories";
import { getErrorMessage } from "@/lib/get-error-message";
import type { Claim, ClaimStatus } from "@/lib/types";

const lineItemSchema = z.object({
  date: z.string().min(1, "Date is required"),
  category: z
    .string()
    .refine(
      (value): value is (typeof EXPENSE_CATEGORIES)[number] =>
        (EXPENSE_CATEGORIES as readonly string[]).includes(value),
      { message: "Select a category" },
    ),
  amount: z.coerce
    .number({ message: "Enter an amount" })
    .positive("Amount must be greater than 0")
    .max(1_000_000, "Amount must be at most 1,000,000"),
  description: z
    .string()
    .min(1, "Description is required")
    .max(255, "Description must be at most 255 characters"),
});

const claimSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1, "Add at least one line item"),
});

type ClaimFormInput = z.input<typeof claimSchema>;
type ClaimFormValues = z.output<typeof claimSchema>;

const STATUS_LABEL: Record<ClaimStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

function StatusBadge({ status }: Readonly<{ status: ClaimStatus }>) {
  if (status === "APPROVED") {
    return <Badge className="bg-emerald-600 text-white">{STATUS_LABEL[status]}</Badge>;
  }
  if (status === "REJECTED") {
    return <Badge variant="destructive">{STATUS_LABEL[status]}</Badge>;
  }
  if (status === "PENDING") {
    return <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>;
  }
  return <Badge variant="outline">{STATUS_LABEL[status]}</Badge>;
}

function formatCurrency(value: string) {
  return `$${Number(value).toFixed(2)}`;
}

function NewClaimForm() {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClaimFormInput, unknown, ClaimFormValues>({
    resolver: zodResolver(claimSchema),
    defaultValues: {
      lineItems: [{ date: "", category: "", amount: "" as unknown as number, description: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });
  const lineItems = watch("lineItems");
  const runningTotal = lineItems.reduce((sum, item) => {
    const amount = Number(item.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  const mutation = useMutation({
    mutationFn: (values: ClaimFormValues) =>
      createClaim(
        values.lineItems.map((item) => ({
          ...item,
          amount: Number(item.amount),
        })),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["claims"] });
      reset({
        lineItems: [{ date: "", category: "", amount: "" as unknown as number, description: "" }],
      });
    },
    onError: (error) => {
      setServerError(getErrorMessage(error, "Could not submit your claim"));
    },
  });

  async function onSubmit(values: ClaimFormValues) {
    setServerError(null);
    await mutation.mutateAsync(values);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit a new claim</CardTitle>
        <CardDescription>Add each expense as its own line item.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {serverError && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          {errors.lineItems?.root?.message && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{errors.lineItems.root.message}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4">
            {fields.map((field, index) => {
              const itemErrors = errors.lineItems?.[index];
              return (
                <div key={field.id} className="grid grid-cols-12 items-start gap-2 rounded-lg border p-3">
                  <div className="col-span-3 grid gap-1">
                    <Label htmlFor={`lineItems.${index}.date`}>
                      Date
                      <RequiredMark />
                    </Label>
                    <Input
                      id={`lineItems.${index}.date`}
                      type="date"
                      required
                      aria-invalid={!!itemErrors?.date}
                      {...register(`lineItems.${index}.date`)}
                    />
                    {itemErrors?.date && (
                      <p className="text-xs text-destructive">{itemErrors.date.message}</p>
                    )}
                  </div>

                  <div className="col-span-3 grid gap-1">
                    <Label htmlFor={`lineItems.${index}.category`}>
                      Category
                      <RequiredMark />
                    </Label>
                    <Controller
                      name={`lineItems.${index}.category`}
                      control={control}
                      render={({ field: selectField }) => (
                        <Select value={selectField.value ?? ""} onValueChange={selectField.onChange}>
                          <SelectTrigger
                            id={`lineItems.${index}.category`}
                            className="w-full"
                            aria-invalid={!!itemErrors?.category}
                          >
                            <SelectValue placeholder="Select">
                              {(value: string | null) =>
                                value
                                  ? (CATEGORY_LABEL[value as keyof typeof CATEGORY_LABEL] ?? value)
                                  : null
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {EXPENSE_CATEGORIES.map((category) => (
                              <SelectItem key={category} value={category}>
                                {CATEGORY_LABEL[category]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {itemErrors?.category && (
                      <p className="text-xs text-destructive">{itemErrors.category.message}</p>
                    )}
                  </div>

                  <div className="col-span-2 grid gap-1">
                    <Label htmlFor={`lineItems.${index}.amount`}>
                      Amount
                      <RequiredMark />
                    </Label>
                    <Input
                      id={`lineItems.${index}.amount`}
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      required
                      aria-invalid={!!itemErrors?.amount}
                      {...register(`lineItems.${index}.amount`)}
                    />
                    {itemErrors?.amount && (
                      <p className="text-xs text-destructive">{itemErrors.amount.message}</p>
                    )}
                  </div>

                  <div className="col-span-3 grid gap-1">
                    <Label htmlFor={`lineItems.${index}.description`}>
                      Description
                      <RequiredMark />
                    </Label>
                    <Input
                      id={`lineItems.${index}.description`}
                      placeholder="Taxi to airport"
                      required
                      aria-invalid={!!itemErrors?.description}
                      {...register(`lineItems.${index}.description`)}
                    />
                    {itemErrors?.description && (
                      <p className="text-xs text-destructive">{itemErrors.description.message}</p>
                    )}
                  </div>

                  <div className="col-span-1 flex items-end justify-center pb-[3px]">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                      aria-label="Remove line item"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() =>
              append({ date: "", category: "", amount: "" as unknown as number, description: "" })
            }
          >
            <Plus className="size-4" />
            Add line item
          </Button>

          <div className="flex items-center justify-between border-t pt-4">
            <span className="text-sm text-muted-foreground">
              Total: <span className="font-medium text-foreground">${runningTotal.toFixed(2)}</span>
            </span>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting…" : "Submit claim"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ClaimsList() {
  const { data: claims, isLoading } = useQuery({ queryKey: ["claims"], queryFn: listClaims });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading claims…</p>;
  }

  if (!claims || claims.length === 0) {
    return <p className="text-sm text-muted-foreground">You haven't submitted any claims yet.</p>;
  }

  return (
    <div className="grid gap-3">
      {claims.map((claim: Claim) => (
        <Card key={claim.id}>
          <CardContent className="grid gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusBadge status={claim.status} />
                <span className="text-sm text-muted-foreground">
                  {new Date(claim.createdAt).toLocaleDateString()}
                </span>
              </div>
              <span className="font-medium">{formatCurrency(claim.totalAmount)}</span>
            </div>
            <ul className="grid gap-1 text-sm text-muted-foreground">
              {claim.lineItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between">
                  <span>
                    {new Date(item.date).toLocaleDateString()} · {CATEGORY_LABEL[item.category as keyof typeof CATEGORY_LABEL] ?? item.category} · {item.description}
                  </span>
                  <span>{formatCurrency(item.amount)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
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
        <NewClaimForm />
        <div>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Submitted claims</h2>
          <ClaimsList />
        </div>
      </div>
    </AppShell>
  );
}
