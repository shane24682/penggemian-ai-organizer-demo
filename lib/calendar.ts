export type CalendarEvent = { title:string; description:string; location:string; start:Date; end:Date };

export type CalendarDeviceProfile = {
  kind: "ios" | "android" | "in-app" | "desktop";
  guidance: string;
};

const icsDate = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeIcs = (value: string) => value.replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export function getCalendarDeviceProfile(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): CalendarDeviceProfile {
  if (/MicroMessenger|DingTalk/i.test(userAgent)) {
    return { kind: "in-app", guidance: "日历文件已生成；若未出现导入界面，请在右上角选择“在系统浏览器打开”后重试" };
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return { kind: "ios", guidance: "日历事件已生成，请在系统预览页点击“添加”完成导入" };
  }
  if (/Android/i.test(userAgent)) {
    return { kind: "android", guidance: "日历文件已下载，请从下载通知中打开并选择系统日历" };
  }
  return { kind: "desktop", guidance: "日历文件已下载，可使用系统日历、Outlook 或邮箱日历导入" };
}

export function downloadIcs(event: CalendarEvent): CalendarDeviceProfile {
  const uidSeed = `${event.title}|${event.start.toISOString()}|${event.location}`;
  const content = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Penggemian//Campus Activity//CN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:碰个面校园活动",
    "BEGIN:VEVENT", `UID:${stableHash(uidSeed)}@penggemian.com`, `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.start)}`, `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${escapeIcs(event.title)}`, `DESCRIPTION:${escapeIcs(event.description)}`,
    `LOCATION:${escapeIcs(event.location)}`, "URL:https://penggemian.com", "STATUS:CONFIRMED", "TRANSP:OPAQUE", "BEGIN:VALARM", "TRIGGER:-PT60M", "ACTION:DISPLAY",
    "DESCRIPTION:碰个面活动将在 1 小时后开始", "END:VALARM", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], {type:"text/calendar;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title.replace(/[\\/:*?\"<>|]/g, "-")}.ics`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 2000);
  return getCalendarDeviceProfile();
}
