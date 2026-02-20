import { signOut } from "@workos-inc/authkit-nextjs";

export async function POST(request: Request) {
  const returnTo = new URL("/api/auth/sign-in", request.url).toString();
  await signOut({ returnTo });
}
