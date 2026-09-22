import type { Database } from "../db/client.js";
import { advanceDueSessions } from "../fulfillment/service.js";
import { expirePendingInvitations } from "../invitations/service.js";
import { processNotificationOutbox } from "../notifications/service.js";

export const runMaintenanceCycle = async (db: Database, now = new Date()) => {
  const invitationResults = await expirePendingInvitations(db, now);
  const notificationResults = await processNotificationOutbox(db, undefined, now);
  const sessionResults = await advanceDueSessions(db, now);
  const invitationFailures = invitationResults.filter(({ success }) => !success).length;
  const notificationFailures = notificationResults.filter(({ status }) => status === "FAILED" || status === "DEAD").length;
  const sessionFailures = sessionResults.filter(({ success }) => !success).length;
  const summary = {
    expiredInvitations: invitationResults.length - invitationFailures,
    deliveredNotifications: notificationResults.length - notificationFailures,
    advancedSessions: sessionResults.length - sessionFailures,
    failures: invitationFailures + notificationFailures + sessionFailures,
  };
  console.log("Maintenance cycle completed", summary);
  if (summary.failures > 0) throw new Error(`Maintenance cycle completed with ${summary.failures} failed item(s)`);
  return summary;
};

export const startMaintenanceScheduler = (
  db: Database,
  intervalMs = 60_000,
  runCycle: (db: Database, now?: Date) => Promise<unknown> = runMaintenanceCycle,
) => {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeRun: Promise<void> = Promise.resolve();

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      activeRun = runCycle(db)
        .catch((error) => console.error("Maintenance scheduler cycle failed", error))
        .then(schedule);
    }, intervalMs);
  };

  activeRun = runCycle(db)
    .catch((error) => console.error("Maintenance scheduler cycle failed", error))
    .then(schedule);

  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await activeRun;
  };
};
