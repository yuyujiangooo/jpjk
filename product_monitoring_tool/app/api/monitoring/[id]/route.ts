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
    // 获取分页参数
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "5")
    const recordId = searchParams.get("recordId")
    const offset = (page - 1) * limit

    // 获取监控项
    const item = await db.getMonitoringItemById(resolvedParams.id)
    if (!item) {
      return NextResponse.json({ error: "Monitoring item not found" }, { status: 404 })
    }

    // 获取总记录数
    const totalCount = await db.getMonitoringRecordsCount(resolvedParams.id)
    
    // 获取分页数据
    const records = await db.getMonitoringRecords(resolvedParams.id, limit, offset)
    
    // 只在请求特定记录详情时获取详情
    let details: MonitoringDetail[] = []
    if (recordId) {
      details = await db.getMonitoringDetails(recordId)
    }

    return NextResponse.json({
      item,
      records,
      details,
      pagination: {
        total: totalCount,
        page,
        limit,
        hasMore: offset + records.length < totalCount
      }
    })
  } catch (error) {
    console.error(`Error in monitoring API:`, error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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


