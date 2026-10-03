import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteAttachment, uploadAttachment, viewAttachment } from "@/lib/claims-api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { Attachment } from "@/lib/types";

const ACCEPTED_TYPES = ".pdf,.png,.jpg,.jpeg,.webp";

interface LineItemAttachmentsProps {
  claimId: string;
  lineItemId: string;
  attachments: Attachment[];
  canModify: boolean;
  onView?: (claimId: string, lineItemId: string, attachmentId: string) => Promise<Blob>;
}

export function LineItemAttachments({
  claimId,
  lineItemId,
  attachments,
  canModify,
  onView = viewAttachment,
}: Readonly<LineItemAttachmentsProps>) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAttachment(claimId, lineItemId, file),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["claims"] });
    },
    onError: (err: unknown) => setError(getErrorMessage(err, "Could not upload the file")),
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => deleteAttachment(claimId, lineItemId, attachmentId),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["claims"] });
    },
    onError: (err: unknown) => setError(getErrorMessage(err, "Could not remove the file")),
  });

  async function handleView(attachment: Attachment) {
    try {
      const blob = await onView(claimId, lineItemId, attachment.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(getErrorMessage(err, "Could not open the file"));
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      uploadMutation.mutate(file);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {attachments.map((attachment) => (
        <span
          key={attachment.id}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-1 pr-1 pl-2 text-xs"
        >
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:underline"
            onClick={() => handleView(attachment)}
          >
            <Paperclip className="size-3" />
            {attachment.filename}
          </button>
          {canModify && (
            <button
              type="button"
              aria-label={`Remove ${attachment.filename}`}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
              onClick={() => deleteMutation.mutate(attachment.id)}
              disabled={deleteMutation.isPending}
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}

      {canModify && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={uploadMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3" />
            {uploadMutation.isPending ? "Uploading…" : "Add receipt"}
          </Button>
        </>
      )}

      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
