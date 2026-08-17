const fnv1a = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase();
};

export const makeFriendCode = (userId: string) => {
  const clean = userId.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const check = fnv1a(`penggemian:v1:${clean}`).slice(-4);
  return `PM-${clean.slice(-8)}-${check}`;
};

export const buildFriendPayload = (userId: string, baseUrl = "https://penggemian.com/") => {
  const code = makeFriendCode(userId);
  const url = new URL(baseUrl);
  url.searchParams.set("friend", userId);
  url.searchParams.set("fc", code);
  url.searchParams.set("source", "qr");
  return url.toString();
};

export const parseFriendPayload = (payload: string) => {
  try {
    const url = new URL(payload);
    const userId = (url.searchParams.get("friend") || "").toUpperCase();
    const code = (url.searchParams.get("fc") || "").toUpperCase();
    if (!userId || code !== makeFriendCode(userId)) return null;
    return { userId, code };
  } catch {
    const normalized = payload.trim().toUpperCase();
    return /^PM-[A-Z0-9]{4,}-[A-Z0-9]{4}$/.test(normalized) ? { userId: "", code: normalized } : null;
  }
};
