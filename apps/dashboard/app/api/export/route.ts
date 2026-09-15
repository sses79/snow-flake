import { type NextRequest } from "next/server";
import { z } from "zod";
import { trendRowsToCsv } from "@/lib/csv";
import { loadDashboardData } from "@/lib/dashboard-data";
import { querySnowflake } from "@/lib/snowflake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  schoolId: z.string().regex(/^school_[0-9]{3}$/).optional(),
  categoryCode: z.string().regex(/^[a-z0-9_]{1,80}$/).optional(),
  questionCode: z.string().regex(/^[a-z0-9_]{1,80}$/).optional(),
  periodFrom: z.string().regex(/^[0-9]{4}_[a-z]+$/).optional(),
  periodTo: z.string().regex(/^[0-9]{4}_[a-z]+$/).optional()
});

export async function GET(request: NextRequest) {
  const parsed = requestSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return new Response("Invalid export filters\n", { status: 400 });
  try {
    const data = await loadDashboardData(querySnowflake, parsed.data);
    return new Response(trendRowsToCsv(data.trend), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="wellbeing-${data.selection.questionCode}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Dashboard export failed", error);
    return new Response("Export is temporarily unavailable\n", { status: 503 });
  }
}
