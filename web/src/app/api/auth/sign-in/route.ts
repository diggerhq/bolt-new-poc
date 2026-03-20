import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";

async function redirectToWorkOSLogin(request: Request) {
  const user = await getCurrentUser();

  if (user) {
    return NextResponse.redirect(new URL("/builder", request.url), { status: 303 });
  }

  const authorizationUrl = await getSignInUrl();
  return NextResponse.redirect(authorizationUrl, { status: 303 });
}

export async function GET(request: Request) {
  return redirectToWorkOSLogin(request);
}

export async function POST(request: Request) {
  return redirectToWorkOSLogin(request);
}
