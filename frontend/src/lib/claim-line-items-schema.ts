import { z } from "zod";
import { EXPENSE_CATEGORIES } from "./categories";

export const lineItemSchema = z
  .object({
    id: z.string().optional(),
    date: z.string().min(1, "Date is required"),
    category: z
      .string()
      .refine(
        (value): value is (typeof EXPENSE_CATEGORIES)[number] =>
          (EXPENSE_CATEGORIES as readonly string[]).includes(value),
        { message: "Select a category" },
      ),
    customCategory: z
      .string()
      .trim()
      .max(100, "Custom category must be at most 100 characters")
      .optional(),
    amount: z.coerce
      .number({ message: "Enter an amount" })
      .positive("Amount must be greater than 0")
      .max(1_000_000, "Amount must be at most 1,000,000"),
    description: z
      .string()
      .min(1, "Description is required")
      .max(255, "Description must be at most 255 characters"),
  })
  .superRefine((data, ctx) => {
    if (data.category === "OTHER" && !data.customCategory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Specify the category",
        path: ["customCategory"],
      });
    }
  });

export const claimLineItemsSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1, "Add at least one line item"),
});

export type ClaimLineItemsFormInput = z.input<typeof claimLineItemsSchema>;
export type ClaimLineItemsFormValues = z.output<typeof claimLineItemsSchema>;

export function emptyLineItem(): ClaimLineItemsFormInput["lineItems"][number] {
  return {
    date: "",
    category: "",
    customCategory: "",
    amount: "" as unknown as number,
    description: "",
  };
}
