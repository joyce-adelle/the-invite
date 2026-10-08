import { NextResponse } from "next/server";

export async function GET() {
  const webhookUrl = process.env.NEXT_PUBLIC_GOOGLE_SHEET_URL;

  if (!webhookUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_GOOGLE_SHEET_URL is not set" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(webhookUrl, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Error fetching limits from Google Sheet:", err);
    return NextResponse.json(
      { error: "Failed to fetch limits" },
      { status: 500 }
    );
  }
}