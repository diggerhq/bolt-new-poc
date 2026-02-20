import { withAuth } from "@workos-inc/authkit-nextjs";
import type { User } from "@workos-inc/node";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

function toAuthUser(user: User): AuthUser {
  const email = user.email ?? "";
  const fullName = [user.firstName, user.lastName]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join(" ")
    .trim();

  return {
    id: user.id,
    email,
    name: fullName.length > 0 ? fullName : email,
  };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const { user } = await withAuth();

  if (!user) {
    return null;
  }

  return toAuthUser(user);
}

export async function requireCurrentUser(): Promise<AuthUser> {
  const { user } = await withAuth({ ensureSignedIn: true });
  return toAuthUser(user);
}
