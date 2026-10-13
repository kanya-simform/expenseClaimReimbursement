import path from "node:path";

export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
