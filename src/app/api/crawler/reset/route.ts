import { NextResponse } from "next/server";
import { crawlerState } from "@/worker/crawler";

export async function POST() {
  crawlerState.status = "IDLE";
  crawlerState.currentSource = null;
  crawlerState.logs.unshift({
    timestamp: new Date().toISOString(),
    level: "warn",
    message: "Crawler state manually reset to IDLE.",
  });

  return NextResponse.json({
    success: true,
    message: "Web crawler state has been reset to IDLE.",
  });
}
