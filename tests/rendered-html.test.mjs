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
  assert.match(html, /开始匹配/);
  assert.match(html, /测试中心/);
  assert.match(html, /我的/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("ships algorithm-backed MBTI, friend code and verification flows", async () => {
  const [page, mbti, friendCode, qr, account] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/mbti.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/friend-code.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/vendor/qrcode/index.js", import.meta.url), "utf8"),
    readFile(new URL("../components/AccountCenter.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /MbtiTest/);
  assert.match(page, /FriendCodePanel/);
  assert.match(page, /AccountCenter/);
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
  const [page, invitationLogic, invitationView, room, postActivity, safety] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/invitations.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/InvitationMatch.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ActivityRoom.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PostActivity.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SafetyControls.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /InvitationMatch/);
  assert.match(page, /ActivityRoom/);
  assert.match(page, /PostActivity/);
  assert.match(invitationLogic, /respondToInvitation/);
  assert.match(invitationLogic, /promoteNext/);
  assert.match(invitationLogic, /maskDistance/);
  assert.match(invitationView, /等待全部确认后才能成局/);
  assert.doesNotMatch(room, /AI主理人公告|AI破冰问题|参与者状态/);
  assert.match(room, /场馆投票/);
  assert.match(room, /临时退出并通知候补/);
  assert.match(postActivity, /双方同意/);
  assert.match(postActivity, /固定每周六复组/);
  assert.match(safety, /屏蔽通讯录/);
  assert.match(safety, /始终隐藏：宿舍与实时位置/);
  assert.match(page, /type="datetime-local"/);
  assert.match(page, /席位价格/);
  assert.doesNotMatch(page, /Demo 数据说明/);
});

test("ships configurable AMap venue and location integration", async () => {
  const mapSource = await readFile(new URL("../components/AmapVenueMap.tsx", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const envSource = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const locationSource = await readFile(new URL("../lib/location.ts", import.meta.url), "utf8");
  const roomSource = await readFile(new URL("../components/ActivityRoom.tsx", import.meta.url), "utf8");

  assert.match(mapSource, /webapi\.amap\.com\/loader\.js/);
  assert.match(mapSource, /VITE_AMAP_KEY/);
  assert.match(mapSource, /AMap\.Scale/);
  assert.match(mapSource, /map\.on\("click"/);
  assert.match(pageSource, /<AmapVenueMap/);
  assert.match(envSource, /VITE_AMAP_SECURITY_CODE/);
  assert.match(envSource, /VITE_AMAP_SERVICE_HOST/);
  assert.match(locationSource, /https:\/\/uri\.amap\.com\/navigation/);
  assert.match(locationSource, /callnative:\s*"1"/);
  assert.match(locationSource, /coordinate:\s*"gaode"/);
  assert.match(roomSource, /去高德导航/);
  assert.match(roomSource, /target="_blank"/);
});

test("ships a device-aware mobile calendar import flow", async () => {
  const [calendar, room, page] = await Promise.all([
    readFile(new URL("../lib/calendar.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/ActivityRoom.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
  assert.match(page, /profile\.guidance/);
});
