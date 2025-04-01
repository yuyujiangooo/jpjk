import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    const result = await db.exportMonitoringResults(id)

    if (!result || !result.item) {
      return NextResponse.json({ error: "Monitoring item not found" }, { status: 404 })
    }

    // In a real application, you might want to generate a CSV or Excel file here
    // For this example, we'll just return the JSON data

    return NextResponse.json(result)
  } catch (error) {
    console.error(`Error exporting monitoring results for item ${params.id}:`, error)
    return NextResponse.json({ error: "Failed to export monitoring results" }, { status: 500 })
  }
}

