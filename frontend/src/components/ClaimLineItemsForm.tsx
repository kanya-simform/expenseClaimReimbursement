import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Paperclip, Plus, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { RequiredMark } from "@/components/RequiredMark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  claimLineItemsSchema,
  emptyLineItem,
  type ClaimLineItemsFormInput,
  type ClaimLineItemsFormValues,
} from "@/lib/claim-line-items-schema";
import { uploadAttachment } from "@/lib/claims-api";
import { CATEGORY_LABEL, EXPENSE_CATEGORIES } from "@/lib/categories";
import { getErrorMessage } from "@/lib/get-error-message";
import type { Claim } from "@/lib/types";

const ACCEPTED_ATTACHMENT_TYPES = ".pdf,.png,.jpg,.jpeg,.webp";

interface ClaimLineItemsFormProps {
  defaultLineItems?: ClaimLineItemsFormInput["lineItems"];
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (lineItems: ClaimLineItemsFormValues["lineItems"]) => Promise<Claim>;
  onCancel?: () => void;
}

export function ClaimLineItemsForm({
  defaultLineItems,
  submitLabel,
  submittingLabel,
  onSubmit,
  onCancel,
}: Readonly<ClaimLineItemsFormProps>) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [stagedFiles, setStagedFiles] = useState<Record<string, File>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ClaimLineItemsFormInput, unknown, ClaimLineItemsFormValues>({
    resolver: zodResolver(claimLineItemsSchema),
    defaultValues: {
      lineItems: defaultLineItems ?? [emptyLineItem()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });
  const lineItems = watch("lineItems");
  const runningTotal = lineItems.reduce((sum, item) => {
    const amount = Number(item.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  function stageFile(fieldId: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      setStagedFiles((prev) => ({ ...prev, [fieldId]: file }));
    }
  }

  function unstageFile(fieldId: string) {
    setStagedFiles((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }

  async function handleFormSubmit(values: ClaimLineItemsFormValues) {
    setServerError(null);

    let claim: Claim;
    try {
      claim = await onSubmit(values.lineItems);
    } catch (error) {
      setServerError(getErrorMessage(error, "Could not save this claim"));
      return;
    }

    // Only rows that didn't already have a server id are eligible for a staged receipt —
    // existing rows manage attachments through their own always-available upload control.
    const preExistingIds = new Set(
      (defaultLineItems ?? []).flatMap((item) => (item.id ? [item.id] : [])),
    );
    const stagedForNewRows = fields
      .map((field, index) => ({
        isNewRow: !values.lineItems[index]?.id,
        file: stagedFiles[field.id],
      }))
      .filter((entry) => entry.isNewRow)
      .map((entry) => entry.file);

    if (stagedForNewRows.some((file) => file)) {
      // The backend returns line items ordered by id (creation order), so pairing the
      // newly created ones with the staged files in submission order is reliable.
      const newServerLineItems = claim.lineItems.filter((item) => !preExistingIds.has(item.id));

      try {
        await Promise.all(
          stagedForNewRows.map((file, index) => {
            const lineItem = newServerLineItems[index];
            return file && lineItem ? uploadAttachment(claim.id, lineItem.id, file) : undefined;
          }),
        );
        void queryClient.invalidateQueries({ queryKey: ["claims"] });
      } catch (error) {
        setServerError(
          getErrorMessage(error, "Claim saved, but one or more receipts could not be uploaded"),
        );
        return;
      }
    }

    setStagedFiles({});
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(handleFormSubmit)} noValidate>
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
          const isNewRow = !lineItems[index]?.id;
          const stagedFile = stagedFiles[field.id];
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
                        <SelectValue placeholder="Select a category">
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
                  onClick={() => {
                    unstageFile(field.id);
                    remove(index);
                  }}
                  aria-label="Remove line item"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {lineItems[index]?.category === "OTHER" && (
                <div className="col-span-12 grid gap-1">
                  <Label htmlFor={`lineItems.${index}.customCategory`}>
                    Specify category
                    <RequiredMark />
                  </Label>
                  <Input
                    id={`lineItems.${index}.customCategory`}
                    placeholder="e.g. Parking, Team dinner"
                    required
                    aria-invalid={!!itemErrors?.customCategory}
                    {...register(`lineItems.${index}.customCategory`)}
                  />
                  {itemErrors?.customCategory && (
                    <p className="text-xs text-destructive">{itemErrors.customCategory.message}</p>
                  )}
                </div>
              )}

              {isNewRow && (
                <div className="col-span-12 flex items-center gap-2">
                  {stagedFile ? (
                    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-1 pr-1 pl-2 text-xs">
                      <Paperclip className="size-3" />
                      {stagedFile.name}
                      <button
                        type="button"
                        aria-label={`Remove ${stagedFile.name}`}
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                        onClick={() => unstageFile(field.id)}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ) : (
                    <>
                      <input
                        ref={(el) => {
                          fileInputRefs.current[field.id] = el;
                        }}
                        type="file"
                        accept={ACCEPTED_ATTACHMENT_TYPES}
                        className="hidden"
                        onChange={(event) => stageFile(field.id, event)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => fileInputRefs.current[field.id]?.click()}
                      >
                        <Upload className="size-3" />
                        Attach receipt (optional)
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" className="w-fit" onClick={() => append(emptyLineItem())}>
        <Plus className="size-4" />
        Add line item
      </Button>

      <div className="flex items-center justify-between border-t pt-4">
        <span className="text-sm text-muted-foreground">
          Total: <span className="font-medium text-foreground">${runningTotal.toFixed(2)}</span>
        </span>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? submittingLabel : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
