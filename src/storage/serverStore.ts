import type { Doc } from "../model/types";
import { apiRequest, ApiError } from "../net/api";
import type { Meta, Store } from "./store";

/**
 * A {@link Store} backed by the server's texts API, scoped to the signed-in user by the session
 * cookie. This is the transport: it rejects on network failure. Offline tolerance (queue + cache)
 * is added by {@link CachedStore} around it, so {@link Library} never sees a transient rejection.
 */
export class ServerStore implements Store {
  async listMeta(): Promise<Meta[]> {
    const { texts } = await apiRequest<{ texts: Meta[] }>("/api/texts", "GET");
    return texts;
  }

  async get(id: string): Promise<Doc | undefined> {
    try {
      const { doc } = await apiRequest<{ doc: Doc }>(`/api/texts/${id}`, "GET");
      return doc;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return undefined;
      throw err;
    }
  }

  async put(doc: Doc): Promise<void> {
    await apiRequest(`/api/texts/${doc.id}`, "PUT", doc);
  }

  async remove(id: string): Promise<void> {
    await apiRequest(`/api/texts/${id}`, "DELETE");
  }
}
