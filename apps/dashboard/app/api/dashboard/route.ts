import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadDashboardData } from "@/lib/dashboard-data";
import { querySnowflake } from "@/lib/snowflake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  schoolId: z.string().regex(/^school_[0-9]{3}$/).optional(),
  questionCode: z.string().regex(/^[a-z0-9_]{1,80}$/).optional(),
  periodFrom: z.string().regex(/^[0-9]{4}_[a-z]+$/).optional(),
  periodTo: z.string().regex(/^[0-9]{4}_[a-z]+$/).optional()
});

export async function GET(request: NextRequest) {
  const parsed = requestSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid dashboard filters" }, { status: 400 });
  }
  try {
    const data = await loadDashboardData(querySnowflake, parsed.data);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=30" }
    });
  } catch (error) {
    console.error("Dashboard request failed", error);
    const message = error instanceof Error && /^(Unknown|Start period)/.test(error.message)
      ? error.message
      : "Dashboard data is temporarily unavailable";
    return NextResponse.json({ error: message }, { status: message.startsWith("Dashboard") ? 503 : 400 });
  }
}
