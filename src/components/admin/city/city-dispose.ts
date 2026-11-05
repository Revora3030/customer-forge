import { useEffect, useMemo } from "react";

type Disposable = { dispose: () => void };

/**
 * JC-17: builds a GPU resource (a canvas texture) once per `deps` change and
 * disposes it when the deps change or the component unmounts, so mounting and
 * unmounting the city in a loop does not leak textures.
 */
export function useDisposable<T extends Disposable | null>(create: () => T, deps: readonly unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resource = useMemo(create, deps);
  useEffect(() => () => { resource?.dispose(); }, [resource]);
  return resource;
}
