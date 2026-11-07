import { newId } from "../model/ids";
import type { Class, Student, Teacher } from "./types";

/**
 * Pure construction and queries over roster entities. No browser APIs, no persistence; the
 * storage layer keeps these and the future teacher screen reads them through the selectors
 * below. Reuses the shared id generator so roster ids look like every other id.
 */

export function createTeacher(name: string, now: number): Teacher {
  return { id: newId(), name, createdAt: now, updatedAt: now };
}

export function createClass(teacherId: string, name: string, now: number): Class {
  return { id: newId(), teacherId, name, createdAt: now, updatedAt: now };
}

export function createStudent(classId: string, name: string, now: number): Student {
  return { id: newId(), classId, name, createdAt: now, updatedAt: now };
}

/** Classes owned by a teacher. */
export function classesOf(classes: readonly Class[], teacherId: string): Class[] {
  return classes.filter((c) => c.teacherId === teacherId);
}

/** Students in a class. */
export function studentsOf(students: readonly Student[], classId: string): Student[] {
  return students.filter((s) => s.classId === classId);
}

/** The class a student belongs to, if present. */
export function classOfStudent(classes: readonly Class[], student: Student): Class | undefined {
  return classes.find((c) => c.id === student.classId);
}

/**
 * Group owned items by the class of their owning student. Items whose `studentId` is absent or
 * points at an unknown student land under the `null` key (unassigned). Keyed by class id; the
 * `null` bucket is omitted when empty. This is what the future "read student texts grouped by
 * class" screen builds on, without this module knowing what a text is.
 */
export function groupByClass<T extends { studentId?: string }>(
  items: readonly T[],
  students: readonly Student[],
): Map<string | null, T[]> {
  const classOf = new Map(students.map((s) => [s.id, s.classId] as const));
  const out = new Map<string | null, T[]>();
  for (const item of items) {
    const key = (item.studentId && classOf.get(item.studentId)) ?? null;
    const bucket = out.get(key);
    if (bucket) bucket.push(item);
    else out.set(key, [item]);
  }
  return out;
}
