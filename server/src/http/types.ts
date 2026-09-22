export type AuthUser = {
  userId: string;
  schoolId: string;
  role: "USER" | "OPS" | "ADMIN";
};

export type AppEnv = {
  Variables: {
    requestId: string;
    auth: AuthUser;
  };
};
