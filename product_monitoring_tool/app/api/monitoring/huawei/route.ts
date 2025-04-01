import { NextResponse } from "next/server"
import type { MonitoringItem } from "@/lib/monitoring"

export async function POST(request: Request) {
  try {
    // Parse the request body
    const body = await request.json()
    const { item } = body as { item: MonitoringItem }

    if (!item || !item.url) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid monitoring item",
        },
        { status: 400 },
      )
    }

    // In a real application, you would fetch the actual content from the URL
    // For this demo, we'll simulate the monitoring process with sample data
    // to avoid CORS and other issues

    // Update last monitoring time
    const now = new Date()
    const formattedDate = now
      .toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
      .replace(/\//g, "-")

    // Create simulated changes based on the modules
    const details = simulateHuaweiCloudChanges(item.modules || [])

    // Create a monitoring record
    const record = {
      id: Date.now().toString(),
      rank: 1,
      date: now.toISOString().split("T")[0],
      status: "监测成功",
      old_content: details.length > 0 ? "检测到内容变化" : "未检测到内容变化",
      new_content: details.length > 0 ? `发现 ${details.length} 处变化` : "内容未变化",
    }

    // Simulate email notification if enabled
    if (details.length > 0 && item.emailNotification && item.emailRecipients && item.emailRecipients.length > 0) {
      console.log(`[Simulated] Sending email notification to: ${item.emailRecipients.join(", ")}`)
    }

    return NextResponse.json({
      success: true,
      result: {
        item: {
          ...item,
          lastMonitorTime: formattedDate,
        },
        record,
        details,
      },
    })
  } catch (error) {
    console.error("Error running Huawei Cloud monitoring:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to run monitoring",
        message: (error as Error).message,
      },
      { status: 500 },
    )
  }
}

// Function to simulate changes in Huawei Cloud documentation
function simulateHuaweiCloudChanges(modules: string[]) {
  const changes = []

  // Generate 0-3 random changes
  const changeCount = Math.floor(Math.random() * 4)

  for (let i = 0; i < changeCount; i++) {
    // Select a random module if available
    const module = modules.length > 0 ? modules[Math.floor(Math.random() * modules.length)] : "未知模块"

    // Create a simulated change
    changes.push({
      id: (i + 1).toString(),
      rank: i + 1,
      page: `${module} - 页面${i + 1}`,
      link: `https://support.huaweicloud.com/eip/${module.toLowerCase()}.html`,
      old_content: `旧内容示例 ${i + 1}`,
      new_content: `新内容示例 ${i + 1} (${new Date().toISOString().split("T")[0]})`,
      action: "提示",
    })
  }

  return changes
}

