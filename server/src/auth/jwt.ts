import { jwtVerify, SignJWT } from "jose";

import type { AuthUser } from "../http/types.js";

const keyOf = (secret: string) => new TextEncoder().encode(secret);

export const createAccessToken = async (user: AuthUser, secret: string): Promise<string> =>
  new SignJWT({ schoolId: user.schoolId, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(keyOf(secret));

export const verifyAccessToken = async (token: string, secret: string): Promise<AuthUser> => {
  const { payload } = await jwtVerify(token, keyOf(secret), { algorithms: ["HS256"] });
  if (
    !payload.sub ||
    typeof payload.schoolId !== "string" ||
    !["USER", "OPS", "ADMIN"].includes(String(payload.role))
  ) {
    throw new Error("Invalid token claims");
  }

  return {
    userId: payload.sub,
    schoolId: payload.schoolId,
    role: payload.role as AuthUser["role"],
  };
};
