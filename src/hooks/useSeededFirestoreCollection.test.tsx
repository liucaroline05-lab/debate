import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";

const mocks = vi.hoisted(() => ({
  listeners: [] as Array<{
    next: (snapshot: {
      docs: Array<{
        id: string;
        data: () => Record<string, unknown>;
      }>;
    }) => void;
    error: (error: Error) => void;
  }>,
  unsubscribes: [] as Array<() => void>,
  authCallback: null as ((user: { uid: string } | null) => void) | null,
}));

vi.mock("@/lib/firebase", () => ({
  firestore: {},
  auth: {},
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (
    _auth: unknown,
    callback: (user: { uid: string } | null) => void,
  ) => {
    mocks.authCallback = callback;
    return () => {};
  },
}));

vi.mock("@/features/firestore/seed", () => ({
  ensureSeededCollection: vi.fn(async () => undefined),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  onSnapshot: vi.fn((
    _query: unknown,
    next: (snapshot: {
      docs: Array<{
        id: string;
        data: () => Record<string, unknown>;
      }>;
    }) => void,
    error: (snapshotError: Error) => void,
  ) => {
    mocks.listeners.push({ next, error });
    const unsubscribe = vi.fn();
    mocks.unsubscribes.push(unsubscribe);
    return unsubscribe;
  }),
  query: vi.fn(() => ({})),
}));

interface TestRecord {
  id: string;
  title: string;
}

const signIn = (uid: string | null) =>
  act(() => {
    mocks.authCallback?.(uid === null ? null : { uid });
  });

describe("useSeededFirestoreCollection", () => {
  beforeEach(() => {
    // Auth resolves before the assertions in most tests; the hook deliberately
    // waits for it before attaching a listener.
    signIn("test-owner");
  });

  it("keeps the real document ID and restores the last snapshot after remount", () => {
    const cacheKey = "speeches:test-owner";
    const constraints: never[] = [];
    const seedRecords: TestRecord[] = [];
    const first = renderHook(() =>
      useSeededFirestoreCollection<TestRecord>(
        "speeches",
        seedRecords,
        constraints,
        true,
        cacheKey,
      ),
    );

    act(() => {
      mocks.listeners.at(-1)?.next({
        docs: [{
          id: "actual-firestore-id",
          data: () => ({
            id: "old-temporary-id",
            title: "Saved speech",
          }),
        }],
      });
    });

    expect(first.result.current.data).toEqual([{
      id: "actual-firestore-id",
      title: "Saved speech",
    }]);
    first.unmount();

    const second = renderHook(() =>
      useSeededFirestoreCollection<TestRecord>(
        "speeches",
        seedRecords,
        constraints,
        true,
        cacheKey,
      ),
    );

    expect(second.result.current.data).toEqual([{
      id: "actual-firestore-id",
      title: "Saved speech",
    }]);

    act(() => {
      mocks.listeners.at(-1)?.error(new Error("temporary listener failure"));
    });

    expect(second.result.current.data).toHaveLength(1);
    expect(second.result.current.error).toBe("temporary listener failure");
  });

  it("does not reuse one user's cached records for a different user", () => {
    const constraints: never[] = [];
    const seedRecords: TestRecord[] = [];
    const hook = renderHook(
      ({ cacheKey }) =>
        useSeededFirestoreCollection<TestRecord>(
          "speeches",
          seedRecords,
          constraints,
          true,
          cacheKey,
        ),
      { initialProps: { cacheKey: "speeches:owner:first-user" } },
    );

    act(() => {
      mocks.listeners.at(-1)?.next({
        docs: [{
          id: "private-speech",
          data: () => ({ title: "First user's speech" }),
        }],
      });
    });
    expect(hook.result.current.data).toHaveLength(1);

    hook.rerender({ cacheKey: "speeches:owner:second-user" });

    expect(hook.result.current.data).toEqual([]);
  });

  it("re-attaches the listener when someone signs in", () => {
    // Firestore never retries a rejected listener, so one attached while signed
    // out stayed dead until the page was reloaded.
    signIn(null);
    const constraints: never[] = [];
    const seedRecords: TestRecord[] = [];

    renderHook(() =>
      useSeededFirestoreCollection<TestRecord>("users", seedRecords, constraints),
    );
    const attachedWhileSignedOut = mocks.listeners.length;

    act(() => {
      mocks.listeners.at(-1)?.error(new Error("Missing or insufficient permissions."));
    });

    signIn("someone");

    expect(mocks.listeners.length).toBe(attachedWhileSignedOut + 1);
  });
});
