import { NextResponse } from "next/server";

import {
  getSelectedMarketCollectionHealth,
} from "@/lib/selected-market-data";

export async function GET() {
  try {
    const health =
      await getSelectedMarketCollectionHealth();

    return NextResponse.json({
      ok: true,
      health,
    });
  }
  catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown MarketPulse error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}
