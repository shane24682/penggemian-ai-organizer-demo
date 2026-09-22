"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AUTH_INVALID_EVENT, AUTH_TOKEN_KEY } from "@/lib/auth-session";
import {
  ApiRequestError,
  getMe,
  login as loginRequest,
  register as registerRequest,
  type AuthUser,
  type RegisterInput,
} from "@/lib/p0-api";

type AuthStatus = "restoring" | "authenticated" | "anonymous" | "error";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string;
  error: string;
  signIn: (phoneE164: string, password: string) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  restore: () => Promise<void>;
  logout: (message?: string) => void;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const messageFor = (error: unknown) =>
  error instanceof Error ? error.message : "暂时无法连接登录服务，请稍后重试";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [error, setError] = useState("");
  const restoreSequence = useRef(0);

  const becomeAnonymous = useCallback((message = "") => {
    restoreSequence.current += 1;
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAccessToken("");
    setUser(null);
    setError(message);
    setStatus("anonymous");
  }, []);

  const restoreWithToken = useCallback(async (token: string) => {
    const sequence = ++restoreSequence.current;
    if (!token) {
      setAccessToken("");
      setUser(null);
      setError("");
      setStatus("anonymous");
      return;
    }

    setStatus("restoring");
    setError("");
    setAccessToken(token);
    try {
      const currentUser = await getMe(token);
      if (sequence !== restoreSequence.current) return;
      setUser(currentUser);
      setStatus("authenticated");
    } catch (caught) {
      if (sequence !== restoreSequence.current) return;
      if (caught instanceof ApiRequestError && caught.status === 401) {
        becomeAnonymous("登录已失效，请重新登录");
        return;
      }
      setUser(null);
      setError(messageFor(caught));
      setStatus("error");
    }
  }, [becomeAnonymous]);

  const restore = useCallback(async () => {
    await restoreWithToken(localStorage.getItem(AUTH_TOKEN_KEY) || "");
  }, [restoreWithToken]);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => void restore(), 0);
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_TOKEN_KEY || event.key === null) {
        void restoreWithToken(event.newValue || "");
      }
    };
    const onInvalid = () => becomeAnonymous("登录已失效，请重新登录");
    window.addEventListener("storage", onStorage);
    window.addEventListener(AUTH_INVALID_EVENT, onInvalid);
    return () => {
      restoreSequence.current += 1;
      window.clearTimeout(restoreTimer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AUTH_INVALID_EVENT, onInvalid);
    };
  }, [becomeAnonymous, restore, restoreWithToken]);

  const acceptSession = useCallback((session: { accessToken: string; user: AuthUser }) => {
    restoreSequence.current += 1;
    localStorage.setItem(AUTH_TOKEN_KEY, session.accessToken);
    setAccessToken(session.accessToken);
    setUser(session.user);
    setError("");
    setStatus("authenticated");
  }, []);

  const signIn = useCallback(async (phoneE164: string, password: string) => {
    acceptSession(await loginRequest(phoneE164, password));
  }, [acceptSession]);

  const signUp = useCallback(async (input: RegisterInput) => {
    acceptSession(await registerRequest(input));
  }, [acceptSession]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    accessToken,
    error,
    signIn,
    signUp,
    restore,
    logout: becomeAnonymous,
    clearError: () => setError(""),
  }), [accessToken, becomeAnonymous, error, restore, signIn, signUp, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
