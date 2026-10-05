import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  getMarketDefinition,
  isMarketCode,
} from "@/lib/market-selection";

export async function POST(
  request: Request,
) {
  const body =
    await request
      .json()
      .catch(
        () => null,
      );

  const marketCode =
    body?.marketCode;

  if (
    !isMarketCode(
      marketCode,
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Unsupported MarketPulse market.",
      },
      {
        status: 400,
      },
    );
  }

  const market =
    getMarketDefinition(
      marketCode,
    );

  const cookieStore =
    await cookies();

  cookieStore.set(
    "marketpulse_market",
    market.code,
    {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV ===
        "production",
      path: "/",
      maxAge:
        60 * 60 * 24 * 365,
    },
  );

  return NextResponse.json({
    ok: true,
    market,
  });
}
