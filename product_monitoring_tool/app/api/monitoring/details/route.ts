import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

/**
 * 获取特定记录的监控详情
 * @route GET /api/monitoring/details
 * @param request 请求对象
 * @returns 监控详情列表
 */
export async function GET(request: NextRequest) {
  try {
    // 获取记录ID
    const searchParams = request.nextUrl.searchParams
    const recordId = searchParams.get("recordId")
    
    if (!recordId) {
      return NextResponse.json(
        { error: "缺少记录ID参数" },
        { status: 400 }
      )
    }
    
    // 获取监控详情
    const details = await db.getMonitoringDetails(recordId)
    
    return NextResponse.json({
      success: true,
      details
    })
  } catch (error) {
    console.error("获取监控详情失败:", error)
    
    return NextResponse.json(
      { 
        success: false,
        error: "获取监控详情失败",
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
} 