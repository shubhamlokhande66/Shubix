import { useLocalSearchParams } from "expo-router";
import { SignInForm } from "../components/organisms/SignInForm";
/** Sign in, or with ?mode=signup create an account (the website's /login). */
export default function SignInScreen() { const { mode, back } = useLocalSearchParams<{ mode?: string; back?: string }>(); return <SignInForm initial={mode === "signup" ? "signup" : "signin"} back={back === "1"} />; }
