import { handleAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

function isInvalidGrantError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("invalid_grant") ||
    message.includes("expired or is invalid")
  );
}

export const GET = handleAuth({
  returnPathname: "/builder",
  onError: async ({ error, request }) => {
    if (isInvalidGrantError(error)) {
      const retryUrl = new URL("/api/auth/sign-in", request.url);
      retryUrl.searchParams.set("reason", "invalid_grant");
      return NextResponse.redirect(retryUrl, { status: 303 });
    }

    return NextResponse.json(
      {
        error: {
          message: "Something went wrong",
          description:
            "Couldn't sign in. If you are not sure what happened, please contact your organization admin.",
        },
      },
      { status: 500 },
    );
  },
});
