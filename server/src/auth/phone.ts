const MAINLAND_MOBILE = /^1[3-9]\d{9}$/;

export const normalizePhoneE164 = (value: string) => {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (MAINLAND_MOBILE.test(compact)) return `+86${compact}`;
  if (/^86(?:1[3-9]\d{9})$/.test(compact)) return `+${compact}`;
  return compact;
};

