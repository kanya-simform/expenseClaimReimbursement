import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_ROOT } from "../constants/storage";

// Used when a file's claimId isn't known until after the claim it belongs to is created
// (e.g. CSV import) — the regular attachment upload route instead writes straight to disk
// via multer's diskStorage, since that route always has an existing claimId in the URL.
export async function saveAttachmentFile(claimId: string, file: Express.Multer.File) {
  const dir = path.join(UPLOAD_ROOT, claimId);
  await fs.mkdir(dir, { recursive: true });

  const diskFilename = `${randomUUID()}${path.extname(file.originalname)}`;
  await fs.writeFile(path.join(dir, diskFilename), file.buffer);

  return {
    filename: file.originalname,
    filePath: `${claimId}/${diskFilename}`,
    mimeType: file.mimetype,
    size: file.size,
  };
}
