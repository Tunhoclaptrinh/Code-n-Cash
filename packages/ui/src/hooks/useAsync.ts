import { useState, useCallback } from "react";
interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}
export function useAsync<T>() {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });
  const execute = useCallback(
    async (asyncFunction: () => Promise<T>): Promise<T | null> => {
      setState({ data: null, loading: true, error: null });
      try {
        const result = await asyncFunction();
        setState({ data: result, loading: false, error: null });
        return result;
      } catch (err: any) {
        setState({ data: null, loading: false, error: err });
        return null;
      }
    },
    [],
  );
  return { ...state, execute };
}
