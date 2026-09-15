import { Hono } from "hono";
import { z } from "zod";

import type { Database } from "../db/client.js";
import { ApiError } from "../http/errors.js";
import { success } from "../http/responses.js";
import type { AppEnv } from "../http/types.js";
import { parseJson } from "../http/validation.js";
import {
  getInvitationForUser,
  getSessionDetail,
  listMyInvitations,
  listMySessions,
  respondToInvitation,
} from "../invitations/service.js";

const invitationStatusSchema = z.enum(["QUEUED", "PENDING", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"]);
const responseSchema = z.object({ action: z.enum(["ACCEPT", "DECLINE"]) });

const uuidParam = (value: string, code: string, message: string) => {
  if (!z.string().uuid().safeParse(value).success) throw new ApiError(400, code, message);
  return value;
};

export const createInvitationRoutes = (db: Database) => {
  const routes = new Hono<AppEnv>();

  routes.get("/me/invitations", async (context) => {
    const parsedStatus = invitationStatusSchema.safeParse(context.req.query("status"));
    if (context.req.query("status") && !parsedStatus.success) {
      throw new ApiError(400, "INVALID_INVITATION_STATUS", "邀请状态格式错误");
    }
    return success(
      context,
      await listMyInvitations(db, context.get("auth").userId, parsedStatus.success ? parsedStatus.data : undefined),
    );
  });

  routes.get("/invitations/:invitationId", async (context) => {
    const invitationId = uuidParam(context.req.param("invitationId"), "INVALID_INVITATION_ID", "邀请编号格式错误");
    return success(context, await getInvitationForUser(db, invitationId, context.get("auth").userId));
  });

  routes.post("/invitations/:invitationId/respond", async (context) => {
    const invitationId = uuidParam(context.req.param("invitationId"), "INVALID_INVITATION_ID", "邀请编号格式错误");
    const input = await parseJson(context, responseSchema);
    return success(context, await respondToInvitation(db, invitationId, context.get("auth").userId, input.action));
  });

  routes.get("/me/sessions", async (context) => success(context, await listMySessions(db, context.get("auth").userId)));

  routes.get("/sessions/:sessionId", async (context) => {
    const sessionId = uuidParam(context.req.param("sessionId"), "INVALID_SESSION_ID", "成局编号格式错误");
    return success(context, await getSessionDetail(db, sessionId, context.get("auth")));
  });

  return routes;
};
