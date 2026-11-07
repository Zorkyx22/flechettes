import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Doc } from "../src/model/types";
import { ApiError } from "../src/net/api";
import { CachedStore } from "../src/storage/cachedStore";
import { metaOf, type Meta, type Store } from "../src/storage/store";

function doc(id: string, title: string): Doc {
  return { id, title, createdAt: 1, updatedAt: 2, textSize: "m", deletedAt: null, tokens: [], overlay: [] };
}

/** A stand-in server store: a toggle simulates the LAN link going down, and an ApiError mode a 401. */
class FakeServer implements Store {
  map = new Map<string, Doc>();
  online = true;
  apiError: ApiError | null = null;

  async listMeta(): Promise<Meta[]> {
    this.gate();
    return [...this.map.values()].map(metaOf);
  }
  async get(id: string): Promise<Doc | undefined> {
    this.gate();
    return this.map.get(id);
  }
  async put(d: Doc): Promise<void> {
    this.gate();
    this.map.set(d.id, structuredClone(d));
  }
  async remove(id: string): Promise<void> {
    this.gate();
    this.map.delete(id);
  }
  private gate(): void {
    if (this.apiError) throw this.apiError;
    if (!this.online) throw new TypeError("network down");
  }
}

describe("CachedStore", () => {
  let server: FakeServer;
  let store: CachedStore;

  beforeEach(async () => {
    await new Promise<void>((r) => {
      const req = indexedDB.deleteDatabase("flechettes-cache");
      req.onsuccess = req.onerror = () => r();
    });
    server = new FakeServer();
    store = await CachedStore.open(server);
  });

  afterEach(() => store.close());

  it("queues writes while offline and never throws, then syncs on reconnect", async () => {
    server.online = false;
    await store.put(doc("a", "Alpha")); // resolves despite being offline
    expect(server.map.has("a")).toBe(false);
    expect(await store.hasPending()).toBe(true);
    // The pending version is visible locally.
    expect((await store.get("a"))!.title).toBe("Alpha");

    server.online = true;
    expect(await store.flushToServer()).toBe(true);
    expect(server.map.get("a")!.title).toBe("Alpha");
    expect(await store.hasPending()).toBe(false);
  });

  it("overlays the outbox on the meta list", async () => {
    await store.put(doc("a", "Alpha")); // online: syncs through
    server.online = false;
    await store.put(doc("b", "Beta")); // queued
    await store.remove("a"); // queued removal
    const ids = (await store.listMeta()).map((m) => m.id).sort();
    expect(ids).toEqual(["b"]); // a hidden by pending remove, b shown from outbox
  });

  it("serves reads from cache when offline", async () => {
    server.map.set("a", doc("a", "Alpha"));
    expect((await store.get("a"))!.title).toBe("Alpha"); // caches it
    server.online = false;
    expect((await store.get("a"))!.title).toBe("Alpha"); // from cache
    expect(await store.get("missing")).toBeUndefined();
  });

  it("does not mask a real server rejection as offline", async () => {
    server.apiError = new ApiError(401, "unauthorized");
    await expect(store.listMeta()).rejects.toBeInstanceOf(ApiError);
  });

  it("clears cache and outbox", async () => {
    server.online = false;
    await store.put(doc("a", "Alpha"));
    await store.clear();
    expect(await store.hasPending()).toBe(false);
    server.online = true;
    expect(await store.listMeta()).toEqual([]);
  });

  it("drops a server-rejected op instead of retrying forever", async () => {
    server.online = false;
    await store.put(doc("a", "Alpha"));
    server.online = true;
    server.apiError = new ApiError(400, "bad_doc");
    expect(await store.flushToServer()).toBe(true); // op dropped
    expect(await store.hasPending()).toBe(false);
  });
});
