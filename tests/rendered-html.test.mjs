import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the 碰个面 product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>碰个面｜AI校园活动主理人<\/title>/i);
  assert.match(html, /今天，遇见同频的人/);
  assert.match(html, /开始匹配/);
  assert.match(html, /我的/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("ships algorithm-backed MBTI, friend code and verification flows", async () => {
  const [workspace, mbti, friendCode, qr, account] = await Promise.all([
    readFile(new URL("../features/workspace/PenggemianWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/mbti.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/friend-code.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/vendor/qrcode/index.js", import.meta.url), "utf8"),
    readFile(new URL("../components/AccountCenter.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /MbtiTest/);
  assert.match(workspace, /FriendCodePanel/);
  assert.match(workspace, /AccountCenter/);
  assert.match(mbti, /calculateMbti/);
  assert.match(mbti, /scores\[question\.axis\]/);
  assert.match(friendCode, /fnv1a/);
  assert.match(friendCode, /parseFriendPayload/);
  assert.match(qr, /getModuleCount/);
  assert.match(qr, /getBestMaskPattern/);
  assert.match(account, /学信网授权/);
  assert.match(account, /录取通知书/);
  assert.match(account, /本人身份证/);
  assert.match(account, /不上传、不缓存证件图片/);
});

test("ships double-consent invitations, activity rooms and post-event relationships", async () => {
  const [workspace, invitationLogic, invitationView, room, postActivity, safety] = await Promise.all([
    readFile(new URL("../features/workspace/PenggemianWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/invitations.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/InvitationMatch.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ActivityRoom.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PostActivity.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SafetyControls.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /InvitationMatch/);
  assert.match(workspace, /ActivityRoom/);
  assert.match(workspace, /PostActivity/);
  assert.match(invitationLogic, /respondToInvitation/);
  assert.match(invitationLogic, /promoteNext/);
  assert.match(invitationLogic, /maskDistance/);
  assert.match(invitationView, /等待全部确认后才能成局/);
  assert.doesNotMatch(room, /AI主理人公告|AI破冰问题|参与者状态/);
  assert.match(room, /场馆投票/);
  assert.match(room, /临时退出并通知候补/);
  assert.match(postActivity, /双方同意/);
  assert.match(postActivity, /私密反馈/);
  assert.match(postActivity, /不会影响匹配度/);
  assert.match(postActivity, /固定每周六复组/);
  assert.match(safety, /男生局/);
  assert.match(safety, /女生局/);
  assert.match(safety, /好友局/);
  assert.match(safety, /始终隐藏：宿舍与实时位置/);
  assert.match(workspace, /type="datetime-local"/);
  assert.match(workspace, /人均场地费/);
  assert.match(workspace, /AI 服务费/);
  assert.doesNotMatch(workspace, /席位价格/);
  assert.doesNotMatch(workspace, /Demo 数据说明/);
});

test("ships scene-aware, explainable matching preferences", async () => {
  const [workspace, matching, invitation] = await Promise.all([
    readFile(new URL("../features/workspace/PenggemianWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/matching.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/InvitationMatch.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /活动选择/);
  assert.match(workspace, /偏好选择/);
  assert.match(workspace, /开始碰面/);
  assert.match(workspace, /更多组队偏好/);
  assert.match(matching, /MatchBreakdown/);
  assert.match(matching, /averageMatch/);
  assert.match(invitation, /匹配度/);
  assert.match(invitation, /查看匹配分析/);
  assert.match(invitation, /创建临时房间/);
});

test("ships configurable AMap venue and location integration", async () => {
  const mapSource = await readFile(new URL("../components/AmapVenueMap.tsx", import.meta.url), "utf8");
  const workspaceSource = await readFile(new URL("../features/workspace/PenggemianWorkspace.tsx", import.meta.url), "utf8");
  const envSource = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const locationSource = await readFile(new URL("../lib/location.ts", import.meta.url), "utf8");
  const roomSource = await readFile(new URL("../components/ActivityRoom.tsx", import.meta.url), "utf8");

  assert.match(mapSource, /webapi\.amap\.com\/loader\.js/);
  assert.match(mapSource, /VITE_AMAP_KEY/);
  assert.match(mapSource, /AMap\.Scale/);
  assert.match(mapSource, /map\.on\("click"/);
  assert.match(workspaceSource, /<AmapVenueMap/);
  assert.match(envSource, /VITE_AMAP_SECURITY_CODE/);
  assert.match(envSource, /VITE_AMAP_SERVICE_HOST/);
  assert.match(locationSource, /https:\/\/uri\.amap\.com\/navigation/);
  assert.match(locationSource, /callnative:\s*"1"/);
  assert.match(locationSource, /coordinate:\s*"gaode"/);
  assert.match(roomSource, /去高德导航/);
  assert.match(roomSource, /target="_blank"/);
});

test("ships a device-aware mobile calendar import flow", async () => {
  const [calendar, room, workspace] = await Promise.all([
    readFile(new URL("../lib/calendar.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/ActivityRoom.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/workspace/PenggemianWorkspace.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(calendar, /getCalendarDeviceProfile/);
  assert.match(calendar, /METHOD:PUBLISH/);
  assert.match(calendar, /stableHash/);
  assert.match(calendar, /BEGIN:VALARM/);
  assert.match(room, /添加到手机日历/);
  assert.match(room, /不会读取你的日历/);
  assert.match(room, /确认并打开日历/);
  assert.doesNotMatch(room, />系统日历</);
  assert.doesNotMatch(room, />钉钉日历</);
  assert.match(workspace, /profile\.guidance/);
});

test("keeps the Next.js page entry focused on route composition", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /PenggemianWorkspace/);
  assert.doesNotMatch(page, /useState|localStorage|InvitationMatch|ActivityRoom/);
});
