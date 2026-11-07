/** Server-side shared types. No browser APIs here. */

export type Role = "admin" | "teacher" | "student";

export type User = {
  id: string;
  username: string;
  role: Role;
  /** Teacher who created a student; null for admins and admin-created teachers. */
  createdBy: string | null;
  disabled: boolean;
  createdAt: number;
  updatedAt: number;
};

/** A user as sent to the browser: never includes the password hash. */
export type PublicUser = Pick<User, "id" | "username" | "role" | "disabled" | "createdAt" | "updatedAt"> & {
  createdBy?: string | null;
};

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    disabled: u.disabled,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    createdBy: u.createdBy,
  };
}
