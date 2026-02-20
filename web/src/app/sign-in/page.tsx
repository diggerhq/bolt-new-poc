import type { Metadata } from "next";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/auth";

export const metadata: Metadata = {
  title: "Sign In",
};

export default async function SignInPage(): Promise<never> {
  const user = await getCurrentUser();

  if (user) {
    redirect("/builder");
  }

  const signInUrl = await getSignInUrl();
  redirect(signInUrl);
}
