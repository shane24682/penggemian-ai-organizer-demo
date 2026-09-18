import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { and, eq, inArray, or } from "drizzle-orm";

import { createDatabase } from "../server/src/db/client.ts";
import { advanceDueSessions } from "../server/src/fulfillment/service.ts";
import { expirePendingInvitations } from "../server/src/invitations/service.ts";
import * as schema from "../server/src/db/schema/index.ts";

if (process.env.APP_ENV !== "test" || process.env.B5_TEST_DB_ALLOW_WRITES !== "1" || !process.env.DATABASE_URL) {
  throw new Error("Browser smoke requires an isolated TEST database and B5_TEST_DB_ALLOW_WRITES=1");
}
const { chromium } = await import(process.env.P0_PLAYWRIGHT_PATH ? pathToFileURL(process.env.P0_PLAYWRIGHT_PATH).href : "playwright");
const connection = createDatabase(process.env.DATABASE_URL, 4);
const db = connection.db;
const api = process.env.B5_API_URL || "http://localhost:8787";
const h5 = process.env.B5_H5_URL || "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.B5_BROWSER_CHANNEL || "msedge", headless: true });
const users = [1, 2, 3, 4].map((index) => `20000000-0000-4000-8000-00000000000${index}`);
const originalProfiles = await db.select({ userId: schema.userProfiles.userId, trustScore: schema.userProfiles.trustScore }).from(schema.userProfiles).where(inArray(schema.userProfiles.userId, users));
const originalIdempotencyIds = new Set((await db.select({ id: schema.idempotencyRecords.id }).from(schema.idempotencyRecords).where(inArray(schema.idempotencyRecords.userId, users))).map(({ id }) => id));
const requestIds = [];
const errors = [];
const pages = [];
const output = process.env.B5_SCREENSHOT_DIR;
const opsId = randomUUID();
const call = async (path, token, body, key) => {
  const response = await fetch(`${api}${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { "Idempotency-Key": key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  assert.ok(response.ok, `${path}: ${JSON.stringify(payload)}`);
  return payload.data;
};
const tokenA = (await call("/api/v1/auth/login", undefined, { phoneE164: "+8613800000001", password: "PenggemianTest!2026" })).accessToken;
const createRequest = async (title, hours) => {
  const start = new Date(Date.now() + hours * 60 * 60_000);
  const request = await call("/api/v1/requests", tokenA, { competitionName: "全国大学生数学建模竞赛", title,
    startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 2 * 60 * 60_000).toISOString(),
    weeklyHoursRequired: 8, participantLimit: 3, applicationDeadline: new Date(start.getTime() - 24 * 60 * 60_000).toISOString(),
    roleSlots: [{ roleCode: "CODING", slotCount: 1, minLevel: 3, evidenceRequired: true }, { roleCode: "WRITING", slotCount: 1, minLevel: 3, evidenceRequired: true }],
  }, `b5:create:${randomUUID()}`);
  requestIds.push(request.id);
  const matched = await call(`/api/v1/requests/${request.id}/match`, tokenA, {}, `b5:match:${request.id}`);
  return { ...request, sessionId: matched.sessionId };
};
const waitText = async (page, text) => { await page.getByText(text, { exact: false }).first().waitFor({ timeout: 20_000 }); };
const loginPage = async (index) => {
  const context = await browser.newContext({ viewport: { width: index === 3 ? 1280 : 390, height: 844 }, isMobile: index !== 3 });
  const page = await context.newPage();
  pages.push(page);
  let readCount = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/v1/me/invitations")) readCount += 1; });
  page.readCount = () => readCount;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${h5}/?p0=1`);
  await page.getByLabel("手机号", { exact: true }).fill(`+861380000000${index}`);
  await page.getByLabel("密码", { exact: true }).fill("PenggemianTest!2026");
  await page.getByRole("button", { name: "登录并进入工作台" }).click();
  await waitText(page, `当前用户：测试${index === 4 ? "候补D" : index === 2 ? "主选B" : "主选C"}`);
  return page;
};
const card = (page, title) => page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const tab = async (page, name) => { await page.bringToFront(); await page.getByRole("navigation", { name: "数模业务导航" }).getByRole("button", { name, exact: true }).click(); };
try {
  const titlePrefix = `B5 浏览器 ${Date.now()}`;
  const first = await createRequest(`${titlePrefix} 候补递补`, 72);
  const [pageB, pageC, pageD] = await Promise.all([loginPage(2), loginPage(3), loginPage(4)]);
  await tab(pageD, "候补进度");
  await card(pageD, first.title).getByText("候补排队", { exact: true }).waitFor();
  await card(pageB, first.title).getByRole("button", { name: "拒绝邀请" }).click();
  await pageD.bringToFront();
  await card(pageD, first.title).getByText("待回应", { exact: true }).waitFor({ timeout: 20_000 });
  await waitText(pageD, "已由候补递补为正式邀请");
  await card(pageD, first.title).getByRole("button", { name: "接受邀请" }).click();
  await pageC.bringToFront();
  await card(pageC, first.title).getByRole("button", { name: "接受邀请" }).click();
  console.log("PASS mobile B decline → D automatic promotion → C/D accept");

  const second = await createRequest(`${titlePrefix} B履约`, 96);
  await pageB.bringToFront();
  await card(pageB, second.title).getByRole("button", { name: "接受邀请" }).waitFor({ timeout: 20_000 });
  await card(pageB, second.title).getByRole("button", { name: "接受邀请" }).click();
  await pageC.bringToFront();
  await card(pageC, second.title).getByRole("button", { name: "接受邀请" }).waitFor({ timeout: 20_000 });
  await card(pageC, second.title).getByRole("button", { name: "接受邀请" }).click();
  await pageD.bringToFront();
  await card(pageD, second.title).getByText("已取消", { exact: true }).waitFor({ timeout: 20_000 });
  const third = await createRequest(`${titlePrefix} 超时递补`, 120);
  const [elapsed] = await db.select().from(schema.invitations).where(and(eq(schema.invitations.requestId, third.id), eq(schema.invitations.inviteeUserId, users[1])));
  const expiryAt = new Date();
  await db.update(schema.invitations).set({ sentAt: new Date(expiryAt.getTime() - 24 * 3600_000), expiresAt: new Date(expiryAt.getTime() - 1000) }).where(eq(schema.invitations.id, elapsed.id));
  assert.ok((await expirePendingInvitations(db, expiryAt)).some((row) => row.invitationId === elapsed.id && row.success));
  assert.equal((await expirePendingInvitations(db, expiryAt)).length, 0);
  await card(pageB, third.title).getByText("已超时", { exact: true }).waitFor({ timeout: 20_000 });
  await pageD.bringToFront(); await card(pageD, third.title).getByText("待回应", { exact: true }).waitFor({ timeout: 20_000 });
  await Promise.all([card(pageD, third.title).getByRole("button", { name: "接受邀请" }).click(), card(pageC, third.title).getByRole("button", { name: "接受邀请" }).click()]);
  console.log("PASS B7 server timeout → D promotion → C/D simultaneous UI acceptance; repeated expiry scan is safe");
  await tab(pageB, "我的成局");
  await card(pageB, second.title).getByRole("button", { name: "查看成员、签到与复组" }).click();
  await waitText(pageB, "已成局");
  await pageB.reload(); await waitText(pageB, "sessionId:");
  assert.ok((await pageB.locator("main").innerText()).includes(second.sessionId));
  console.log("PASS B/C confirmation, D ended queue and detail reload from server");

  const startsAt = new Date(Date.now() - 10 * 60_000);
  const endsAt = new Date(Date.now() + 40 * 60_000);
  await db.update(schema.sessions).set({ startsAt, endsAt }).where(eq(schema.sessions.id, second.sessionId));
  await advanceDueSessions(db);
  await pageB.getByRole("button", { name: "确认本人到场" }).waitFor();
  await pageB.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "确认本人到场" && !button.disabled));
  await pageB.getByRole("button", { name: "确认本人到场" }).click();
  await waitText(pageB, "签到已确认并保存");
  await tab(pageC, "我的成局");
  await card(pageC, second.title).getByRole("button", { name: "查看成员、签到与复组" }).click();
  await pageC.getByRole("button", { name: "确认本人到场" }).click();
  await waitText(pageC, "签到已确认并保存");
  await call(`/api/v1/sessions/${second.sessionId}/checkins`, tokenA, {}, `b5:${second.sessionId}:host`);
  await db.update(schema.sessions).set({ endsAt: new Date(Date.now() - 1) }).where(eq(schema.sessions.id, second.sessionId));
  await advanceDueSessions(db);
  await pageB.bringToFront();
  await pageB.getByLabel("评价对象", { exact: true }).waitFor({ timeout: 20_000 });
  await pageB.getByLabel("评价对象", { exact: true }).selectOption(users[2]);
  await pageB.getByLabel("评价（可选）", { exact: true }).fill("B5 真实浏览器评价");
  await pageB.getByRole("button", { name: "提交一次评价" }).click();
  await waitText(pageB, "评价已保存");
  await pageB.getByRole("group", { name: "愿意再次同局的已到场成员" }).getByLabel("测试主选C", { exact: true }).check();
  await pageB.getByRole("button", { name: "保存意愿（可清空）" }).click();
  await pageC.bringToFront();
  await pageC.getByRole("group", { name: "愿意再次同局的已到场成员" }).getByLabel("测试主选B", { exact: true }).waitFor({ timeout: 20_000 });
  await pageC.getByRole("group", { name: "愿意再次同局的已到场成员" }).getByLabel("测试主选B", { exact: true }).check();
  await pageC.getByRole("button", { name: "保存意愿（可清空）" }).click();
  await pageB.bringToFront();
  await waitText(pageB, "双方有意愿");
  await pageB.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "创建复组需求" && !button.disabled));
  await pageB.getByRole("button", { name: "创建复组需求" }).click();
  await waitText(pageB, "复组需求已保存");
  const regroupRequests = await db.select().from(schema.requests).where(and(eq(schema.requests.sourceSessionId, second.sessionId), eq(schema.requests.creatorUserId, users[1])));
  assert.equal(regroupRequests.length, 1); requestIds.push(regroupRequests[0].id);
  await pageB.reload(); await waitText(pageB, "B5 真实浏览器评价");
  await tab(pageB, "活动历史"); await card(pageB, second.title).waitFor();
  if (output) { await mkdir(output, { recursive: true }); await pageB.screenshot({ path: join(output, "b5-mobile-history.png"), fullPage: true }); }
  console.log("PASS B mobile checkin → review → mutual regroup → DB source_session_id → history/reload");

  await pageB.route("**/api/v1/me/invitations", (route) => route.abort());
  await waitText(pageB, "读取失败：");
  await pageB.unroute("**/api/v1/me/invitations");
  await pageB.getByRole("button", { name: "重新读取", exact: true }).click();
  await pageB.getByText("读取失败：", { exact: false }).waitFor({ state: "hidden" });
  assert.equal(await pageB.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.deepEqual(errors, []);
  console.log("PASS network error/retry, mobile width and no browser runtime exceptions");
  await pageB.getByRole("button", { name: "退出当前账号", exact: true }).click();
  await pageB.getByLabel("手机号", { exact: true }).fill("+8613800000003");
  await pageB.getByLabel("密码", { exact: true }).fill("PenggemianTest!2026");
  await pageB.getByRole("button", { name: "登录并进入工作台" }).click();
  await waitText(pageB, "当前用户：测试主选C");
  await tab(pageB, "活动历史");
  await card(pageB, second.title).getByRole("button", { name: "查看成员、签到与复组" }).click();
  await waitText(pageB, "暂无本人提交的评价");
  assert.equal(await pageB.getByText("B5 真实浏览器评价", { exact: false }).count(), 0);
  console.log("PASS account switch re-reads server identity and does not expose B private reviews to C");
  const [seedUser] = await db.select().from(schema.users).where(eq(schema.users.id, users[0]));
  const [seedProfile] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, users[0]));
  const opsPhone = `+86139${String(Date.now()).slice(-8)}`;
  await db.insert(schema.users).values({ ...seedUser, id: opsId, phoneE164: opsPhone, role: "OPS" });
  await db.insert(schema.userProfiles).values({ ...seedProfile, userId: opsId, displayName: "B6测试运营" });
  const opsContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const opsPage = await opsContext.newPage(); pages.push(opsPage); opsPage.readCount = () => 0;
  opsPage.on("pageerror", (error) => errors.push(error.message));
  await opsPage.goto(`${h5}/?view=ops`);
  await opsPage.getByLabel("手机号", { exact: true }).fill(opsPhone);
  await opsPage.getByLabel("密码", { exact: true }).fill("PenggemianTest!2026");
  await opsPage.getByRole("button", { name: "登录并进入工作台" }).click();
  await opsPage.getByRole("heading", { name: "运营工作台", exact: true }).waitFor();
  assert.equal(await opsPage.getByLabel("手机号", { exact: true }).count(), 0);
  await opsPage.getByLabel("列表数据范围", { exact: true }).selectOption("TEST");
  await opsPage.getByRole("button", { name: "查询 / 刷新", exact: true }).click();
  await card(opsPage, second.title).filter({ has: opsPage.getByText(second.id, { exact: true }) }).getByRole("button", { name: "追溯需求与完整链路" }).click();
  await opsPage.getByRole("heading", { name: `完整轨迹：${second.title}`, exact: true }).waitFor();
  await opsPage.getByLabel("处理原因 / 备注", { exact: true }).fill("B6 浏览器人工跟进");
  await opsPage.getByLabel("人工分钟", { exact: true }).fill("7");
  await opsPage.getByRole("button", { name: "记录人工时间", exact: true }).click();
  await waitText(opsPage, "运营记录已入库");
  await opsPage.getByLabel("实际成本（整数分，CNY）", { exact: true }).fill("125");
  await opsPage.getByRole("button", { name: "记录实际成本", exact: true }).click();
  await opsPage.getByRole("heading", { name: "实际成本记录（1）", exact: true }).waitFor();
  assert.equal((await db.select().from(schema.opsWorkLogs).where(eq(schema.opsWorkLogs.requestId, second.id)))[0].minutesSpent, 7);
  assert.equal((await db.select().from(schema.costItems).where(eq(schema.costItems.requestId, second.id)))[0].amountCents, 125);
  assert.equal(await opsPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await opsPage.reload(); await opsPage.getByRole("heading", { name: "运营工作台", exact: true }).waitFor();
  await opsPage.getByLabel("列表数据范围", { exact: true }).selectOption("TEST");
  await opsPage.getByRole("button", { name: "查询 / 刷新", exact: true }).click();
  await card(opsPage, second.title).filter({ has: opsPage.getByText(second.id, { exact: true }) }).getByRole("button", { name: "追溯需求与完整链路" }).click();
  await opsPage.getByRole("heading", { name: "人工时间记录（1）", exact: true }).waitFor();
  if (output) await opsPage.screenshot({ path: join(output, "b6-mobile-ops.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log("PASS B6 global ops login → filtered flows/REAL metrics → work/cost writes → DB/reload recovery");
} catch (error) {
  console.error("Browser exceptions:", errors);
  for (const [index, page] of pages.entries()) {
    console.error(`Browser ${index}: reads=${page.readCount()} visibility=${await page.evaluate(() => document.visibilityState)} ${await page.locator("main").innerText()}`);
    if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: join(output, `b5-failure-${index}.png`), fullPage: true }); }
  }
  throw error;
} finally {
  await browser.close();
  const sessionRows = requestIds.length ? await db.select({ id: schema.sessions.id }).from(schema.sessions).where(inArray(schema.sessions.requestId, requestIds)) : [];
  const sessionIds = sessionRows.map(({ id }) => id);
  const invitations = requestIds.length ? await db.select({ id: schema.invitations.id }).from(schema.invitations).where(inArray(schema.invitations.requestId, requestIds)) : [];
  const invitationIds = invitations.map(({ id }) => id);
  const outbox = invitationIds.length ? await db.select({ id: schema.notificationOutbox.id }).from(schema.notificationOutbox).where(inArray(schema.notificationOutbox.aggregateId, invitationIds)) : [];
  const aggregates = [...requestIds, ...sessionIds, ...invitationIds];
  for (const table of [schema.sessionMembers, schema.checkins, schema.reviews, schema.regroupIntents]) {
    if (sessionIds.length) aggregates.push(...(await db.select({ id: table.id }).from(table).where(inArray(table.sessionId, sessionIds))).map(({ id }) => id));
  }
  await db.transaction(async (tx) => {
    if (outbox.length) await tx.delete(schema.deliveryAttempts).where(inArray(schema.deliveryAttempts.outboxId, outbox.map(({ id }) => id)));
    if (invitationIds.length) await tx.delete(schema.notificationOutbox).where(inArray(schema.notificationOutbox.aggregateId, invitationIds));
    if (requestIds.length) {
      await tx.delete(schema.opsWorkLogs).where(inArray(schema.opsWorkLogs.requestId, requestIds));
      await tx.delete(schema.costItems).where(inArray(schema.costItems.requestId, requestIds));
      await tx.delete(schema.domainEvents).where(or(inArray(schema.domainEvents.requestId, requestIds), sessionIds.length ? inArray(schema.domainEvents.sessionId, sessionIds) : undefined));
      await tx.delete(schema.invitations).where(inArray(schema.invitations.requestId, requestIds));
    }
    if (aggregates.length) await tx.delete(schema.statusEvents).where(inArray(schema.statusEvents.aggregateId, aggregates));
    if (sessionIds.length) {
      for (const table of [schema.checkins, schema.reviews, schema.regroupIntents, schema.sessionMembers]) await tx.delete(table).where(inArray(table.sessionId, sessionIds));
      await tx.delete(schema.sessions).where(inArray(schema.sessions.id, sessionIds));
    }
    if (requestIds.length) { await tx.delete(schema.matchRuns).where(inArray(schema.matchRuns.requestId, requestIds)); await tx.delete(schema.requests).where(inArray(schema.requests.id, requestIds)); }
    const newKeys = (await tx.select({ id: schema.idempotencyRecords.id }).from(schema.idempotencyRecords)
      .where(inArray(schema.idempotencyRecords.userId, users))).filter(({ id }) => !originalIdempotencyIds.has(id));
    if (newKeys.length) await tx.delete(schema.idempotencyRecords).where(inArray(schema.idempotencyRecords.id, newKeys.map(({ id }) => id)));
    for (const profile of originalProfiles) await tx.update(schema.userProfiles).set({ trustScore: profile.trustScore }).where(eq(schema.userProfiles.userId, profile.userId));
    await tx.delete(schema.idempotencyRecords).where(eq(schema.idempotencyRecords.userId, opsId));
    await tx.delete(schema.users).where(eq(schema.users.id, opsId));
  });
  await connection.close();
}
