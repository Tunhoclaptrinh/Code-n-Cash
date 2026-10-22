import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { WelcomeModal } from "./WelcomeModal";

const STORAGE_KEY = "codecash.onboarding";

/**
 * First-run flow: `welcome` asks for language and theme, `tips` points at the header controls
 * where both can be changed later, `done` is stored so the flow never repeats on this browser.
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
  const [phase, setPhase] = useState<OnboardingPhase>(() =>
    readDone() ? "done" : "welcome",
  );
  const finishTips = useCallback(() => {
    setPhase("done");
    try {
      localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* storage unavailable: the flow shows again next visit */
    }
  }, []);
  const value = useMemo<OnboardingValue>(
    () => ({
      phase,
      finishWelcome: () => setPhase("tips"),
      finishTips,
      showTips: () => setPhase("tips"),
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
