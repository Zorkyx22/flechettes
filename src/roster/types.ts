/**
 * Roster entities: the people a text can belong to. People, not text — so they live outside
 * the document model. This is the browser-side seed of the server's `Auth + roles` block:
 * every entity has a stable id and the ownership chain text -> student -> class -> teacher
 * that a future per-class-scoped server can adopt as-is. `updatedAt` is carried now so a
 * later sync layer has a reconciliation timestamp. Nothing here uses browser APIs.
 */

export type Teacher = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type Class = {
  id: string;
  /** The teacher who owns this class. */
  teacherId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type Student = {
  id: string;
  /** The class this student belongs to. */
  classId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};
