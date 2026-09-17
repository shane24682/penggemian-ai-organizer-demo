import PenggemianWorkspace from "@/features/workspace/PenggemianWorkspace";
import AuthBoundary from "@/features/auth/AuthBoundary";
import { AuthProvider } from "@/features/auth/AuthProvider";

export default function HomePage() {
  return <AuthProvider><AuthBoundary><PenggemianWorkspace/></AuthBoundary></AuthProvider>;
}
