export type CalendarEvent = { title:string; description:string; location:string; start:Date; end:Date };

const icsDate = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeIcs = (value: string) => value.replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");

export function downloadIcs(event: CalendarEvent) {
  const content = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Penggemian//Campus Activity//CN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${Date.now()}@penggemian.com`, `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.start)}`, `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${escapeIcs(event.title)}`, `DESCRIPTION:${escapeIcs(event.description)}`,
    `LOCATION:${escapeIcs(event.location)}`, "BEGIN:VALARM", "TRIGGER:-PT60M", "ACTION:DISPLAY",
    "DESCRIPTION:碰个面活动将在 1 小时后开始", "END:VALARM", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], {type:"text/calendar;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function copyForDingTalk(event: CalendarEvent) {
  const content = `${event.title}\n时间：${event.start.toLocaleString("zh-CN")} - ${event.end.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}\n地点：${event.location}\n${event.description}`;
  await navigator.clipboard.writeText(content);
  return content;
}

