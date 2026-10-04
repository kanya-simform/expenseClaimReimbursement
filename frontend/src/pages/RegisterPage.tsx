import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { PasswordInput } from "@/components/PasswordInput";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { homeRouteForRole } from "@/components/ProtectedRoute";
import { RequiredMark } from "@/components/RequiredMark";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/get-error-message";

const ROLE_OPTIONS: {
  value: "CLAIMANT" | "APPROVER" | "FINANCE";
  shortLabel: string;
  description: string;
}[] = [
  {
    value: "CLAIMANT",
    shortLabel: "Claimant",
    description: "Claimant — submit and track my own claims",
  },
  {
    value: "APPROVER",
    shortLabel: "Approver",
    description: "Approver — review and decide on claims",
  },
  {
    value: "FINANCE",
    shortLabel: "Finance",
    description: "Finance — export approved claims",
  },
];

const ROLE_SHORT_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((option) => [option.value, option.shortLabel]),
);

const registerSchema = z
  .object({
    firstName: z
      .string()
      .min(1, "First name is required")
      .max(50, "First name must be at most 50 characters"),
    lastName: z
      .string()
      .min(1, "Last name is required")
      .max(50, "Last name must be at most 50 characters"),
    email: z
      .string()
      .min(1, "Email is required")
      .max(255, "Email must be at most 255 characters")
      .email("Enter a valid email"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    role: z
      .string()
      .refine(
        (value): value is "CLAIMANT" | "APPROVER" | "FINANCE" =>
          value === "CLAIMANT" || value === "APPROVER" || value === "FINANCE",
        { message: "Select a role" },
      ),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormInput = z.input<typeof registerSchema>;
type RegisterFormValues = z.output<typeof registerSchema>;

export function RegisterPage() {
  const { user, isLoading, register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInput, unknown, RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: "" },
  });

  const password = watch("password") ?? "";

  if (!isLoading && user) {
    return <Navigate to={homeRouteForRole(user.role)} replace />;
  }

  async function onSubmit(values: RegisterFormValues) {
    setServerError(null);
    try {
      const registeredUser = await registerUser(values);
      void navigate(homeRouteForRole(registeredUser.role), { replace: true });
    } catch (error) {
      setServerError(getErrorMessage(error, "Could not create your account"));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Create an account</CardTitle>
          <CardDescription>Register to submit, approve, or export claims</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            {serverError && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName">
                  First name
                  <RequiredMark />
                </Label>
                <Input
                  id="firstName"
                  autoComplete="given-name"
                  placeholder="Ada"
                  required
                  aria-invalid={!!errors.firstName}
                  {...register("firstName")}
                />
                {errors.firstName && (
                  <p className="text-sm text-destructive">{errors.firstName.message}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lastName">
                  Last name
                  <RequiredMark />
                </Label>
                <Input
                  id="lastName"
                  autoComplete="family-name"
                  placeholder="Lovelace"
                  required
                  aria-invalid={!!errors.lastName}
                  {...register("lastName")}
                />
                {errors.lastName && (
                  <p className="text-sm text-destructive">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">
                Email
                <RequiredMark />
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                required
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="role">
                Register as
                <RequiredMark />
              </Label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger id="role" className="w-full" aria-invalid={!!errors.role}>
                      <SelectValue placeholder="Select a role">
                        {(value: string | null) => (value ? ROLE_SHORT_LABEL[value] : null)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.role && (
                <p className="text-sm text-destructive">{errors.role.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">
                Password
                <RequiredMark />
              </Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              <PasswordStrengthMeter password={password} />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">
                Confirm password
                <RequiredMark />
              </Label>
              <PasswordInput
                id="confirmPassword"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                required
                aria-invalid={!!errors.confirmPassword}
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating account…" : "Create account"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
