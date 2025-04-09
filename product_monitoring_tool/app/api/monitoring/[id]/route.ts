import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { MonitoringDetail } from "@/lib/monitoring"

type RouteParams = {
  params: Promise<{
    id: string
  }>
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const resolvedParams = await params
  if (!resolvedParams?.id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 })
  }

  try {
    // 获取监控项
    const item = await db.getMonitoringItemById(resolvedParams.id)
    if (!item) {
      return NextResponse.json({ error: "Monitoring item not found" }, { status: 404 })
    }

    // 获取监控记录
    const records = await db.getMonitoringRecords(resolvedParams.id)
    
    // 如果有指定的记录ID，获取其详情
    const recordId = request.nextUrl.searchParams.get("recordId")
    let details: MonitoringDetail[] = []
    if (recordId) {
      details = await db.getMonitoringDetails(recordId)
    }

    return NextResponse.json({
      item,
      records,
      details,
      pagination: {
        total: records.length,
        page: 1,
        limit: 5,
        hasMore: false
      }
    })
  } catch (error) {
    console.error('获取监控记录失败:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  const resolvedParams = await params
  if (!resolvedParams?.id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 })
  }

  try {
    const data = await request.json()
    const updatedItem = await db.updateMonitoringItem(resolvedParams.id, data)

    if (!updatedItem) {
      return NextResponse.json({ error: "Monitoring item not found" }, { status: 404 })
    }

    return NextResponse.json({ item: updatedItem })
  } catch (error) {
    console.error(`Error updating monitoring item:`, error)
    return NextResponse.json({ error: "Failed to update monitoring item" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  const resolvedParams = await params
  if (!resolvedParams?.id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 })
  }

  try {
    const success = await db.deleteMonitoringItem(resolvedParams.id)

    if (!success) {
      return NextResponse.json({ error: "Monitoring item not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`Error deleting monitoring item:`, error)
    return NextResponse.json({ error: "Failed to delete monitoring item" }, { status: 500 })
  }
}


