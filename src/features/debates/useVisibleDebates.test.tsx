import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVisibleDebates } from "@/features/debates/useVisibleDebates";

const mocks = vi.hoisted(() => ({ calls: [] as Array<{ cacheKey?: string; enabled?: boolean }> }));

vi.mock("@/hooks/useSeededFirestoreCollection", () => ({
  useSeededFirestoreCollection: (_name: string, _seed: unknown, _constraints: unknown, enabled: boolean, cacheKey?: string) => {
    mocks.calls.push({ cacheKey, enabled });
    return cacheKey?.startsWith("debates:public")
      ? { data: [{ id: "public-one" }, { id: "mine-and-public", topic: "from public query" }], isLoading: false, error: null }
      : { data: [{ id: "mine-and-public", topic: "from participant query" }, { id: "private-one" }], isLoading: false, error: "denied" };
  },
}));

describe("useVisibleDebates", () => {
  beforeEach(() => {
    mocks.calls = [];
  });

  it("combines public debates and the member's own, without duplicates", () => {
    const { result } = renderHook(() => useVisibleDebates("maya"));
    expect(result.current.data.map((debate) => debate.id)).toEqual(["public-one", "mine-and-public", "private-one"]);
    expect(result.current.error).toBe("denied");
  });

  it("doesn't query for signed-out visitors, since rules would reject it", () => {
    renderHook(() => useVisibleDebates(undefined));
    expect(mocks.calls.every((call) => call.enabled === false)).toBe(true);
  });
});
