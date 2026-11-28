import { useLocalSearchParams } from "expo-router";
import { SignInForm } from "../components/organisms/SignInForm";
/** Sign in, or with ?mode=signup create an account (the website's /login). */
export default function SignInScreen() { const { mode, back, next } = useLocalSearchParams<{ mode?: string; back?: string; next?: string }>(); return <SignInForm initial={mode === "signup" ? "signup" : "signin"} back={back === "1"} next={typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : undefined} />; }
