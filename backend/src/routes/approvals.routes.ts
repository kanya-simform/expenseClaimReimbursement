import { Router } from "express";
import {
  decideHandler,
  downloadQueuedAttachmentHandler,
  getQueuedClaimHandler,
  listQueueHandler,
} from "../controllers/approvals.controller";
import { requireAuth, requireRole } from "../middleware/auth";

export const approvalsRouter = Router();

approvalsRouter.use(requireAuth, requireRole("APPROVER"));

approvalsRouter.get("/", listQueueHandler);
approvalsRouter.get("/:id", getQueuedClaimHandler);
approvalsRouter.post("/:id/decision", decideHandler);
approvalsRouter.get(
  "/:claimId/line-items/:lineItemId/attachments/:attachmentId",
  downloadQueuedAttachmentHandler,
);
