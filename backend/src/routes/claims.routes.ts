import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE,
  UPLOAD_ROOT,
} from "../constants/storage";
import {
  createClaimHandler,
  deleteAttachmentHandler,
  deleteClaimHandler,
  downloadAttachmentHandler,
  getClaimHandler,
  importClaimHandler,
  listClaimsHandler,
  updateClaimHandler,
  uploadAttachmentHandler,
} from "../controllers/claims.controller";
import { ValidationError } from "../errors";
import { requireAuth, requireRole } from "../middleware/auth";

export const claimsRouter = Router();

claimsRouter.use(requireAuth, requireRole("CLAIMANT"));

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "file") {
      const isCsv =
        file.mimetype === "text/csv" ||
        file.mimetype === "application/vnd.ms-excel" ||
        file.originalname.toLowerCase().endsWith(".csv");
      if (!isCsv) {
        cb(new ValidationError("Only .csv files are supported for the claims file"));
        return;
      }
    } else if (file.fieldname === "receipts" && !ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      cb(
        new ValidationError(
          `Receipt "${file.originalname}" must be a PDF, PNG, JPEG, or WebP file`,
        ),
      );
      return;
    }
    cb(null, true);
  },
});

claimsRouter.post("/", createClaimHandler);
claimsRouter.post(
  "/import",
  csvUpload.fields([
    { name: "file", maxCount: 1 },
    { name: "receipts", maxCount: 20 },
  ]),
  importClaimHandler,
);
claimsRouter.get("/", listClaimsHandler);
claimsRouter.get("/:id", getClaimHandler);
claimsRouter.put("/:id", updateClaimHandler);
claimsRouter.delete("/:id", deleteClaimHandler);

const attachmentStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(UPLOAD_ROOT, String(req.params.claimId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${path.extname(file.originalname)}`);
  },
});

const uploadAttachment = multer({
  storage: attachmentStorage,
  limits: { fileSize: MAX_ATTACHMENT_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      cb(new ValidationError("Only PDF, PNG, JPEG, or WebP files are allowed"));
      return;
    }
    cb(null, true);
  },
});

claimsRouter.post(
  "/:claimId/line-items/:lineItemId/attachments",
  uploadAttachment.single("file"),
  uploadAttachmentHandler,
);
claimsRouter.get(
  "/:claimId/line-items/:lineItemId/attachments/:attachmentId",
  downloadAttachmentHandler,
);
claimsRouter.delete(
  "/:claimId/line-items/:lineItemId/attachments/:attachmentId",
  deleteAttachmentHandler,
);
