import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "../auth/session";
import { WelcomeModal } from "./WelcomeModal";

const STORAGE_KEY = "codecash.onboarding";

/**
 * First-run flow, shown on the main screen after the first sign-in: `welcome` asks for language
 * and theme, `tips` points at the header controls where both can be changed later. Finishing the
 * tips stores `done`, so the flow never repeats on this browser. Header help opens the user guide.
 */
export type OnboardingPhase = "welcome" | "tips" | "done";

interface OnboardingValue {
  phase: OnboardingPhase;
  finishWelcome: () => void;
  finishTips: () => void;
  /** Shows the header tips again, e.g. from the help button. */
  showTips: () => void;
}

const OnboardingContext = createContext<OnboardingValue>({
  phase: "done",
  finishWelcome: () => {},
  finishTips: () => {},
  showTips: () => {},
});

function readDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "done";
  } catch {
    return true;
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [done, setDone] = useState(readDone);
  const [welcomed, setWelcomed] = useState(false);
  const [tips, setTips] = useState(false);
  const phase: OnboardingPhase =
    !done && user && !welcomed ? "welcome" : tips ? "tips" : "done";
  const finishTips = useCallback(() => {
    setTips(false);
    if (!welcomed) return;
    setDone(true);
    try {
      localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* storage unavailable: the flow shows again next visit */
    }
  }, [welcomed]);
  const value = useMemo<OnboardingValue>(
    () => ({
      phase,
      finishWelcome: () => {
        setWelcomed(true);
        setTips(true);
      },
      finishTips,
      showTips: () => setTips(true),
    }),
    [phase, finishTips],
  );
  return (
    <OnboardingContext.Provider value={value}>
      {children}
      <WelcomeModal open={phase === "welcome"} onDone={value.finishWelcome} />
    </OnboardingContext.Provider>
  );
}

export const useOnboarding = () => useContext(OnboardingContext);
