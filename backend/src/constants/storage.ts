import path from "node:path";

// process.cwd() rather than __dirname — both `tsx watch src/index.ts` (dev) and
// `node dist/src/index.js` (prod) are always invoked with cwd = backend/, whereas
// __dirname's depth relative to backend/ differs between src/ and the compiled dist/.
export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
