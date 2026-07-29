import { NextResponse } from "next/server";
import { getTshwaneCollectionHealth } from "@/lib/market-data";

export async function GET() {
  try {
    const health = await getTshwaneCollectionHealth();

    return NextResponse.json({
      ok: true,
      health,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown MarketPulse error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
