"use server"

import { db } from "./db"
import { revalidatePath } from "next/cache"

export async function addMonitoringItem(formData: FormData) {
  try {
    const name = formData.get("name") as string
    const url = formData.get("url") as string
    const vendor = formData.get("vendor") as string
    const modules = (formData.get("modules") as string).split(",")
    const frequency = formData.get("frequency") as string
    const email_notification = formData.get("email_notification") === "true"
    const email_recipients = email_notification
      ? (formData.get("email_recipients") as string).split(/[;,\s]+/).map((e) => e.trim())
      : []

    // Validate required fields
    if (!name || !url || !vendor || !modules.length || !frequency) {
      return {
        success: false,
        error: "所有字段都是必填的",
      }
    }

    // Check if name already exists
    const nameExists = await db.isMonitoringItemNameExists(name)
    if (nameExists) {
      return {
        success: false,
        error: "监控项名称已存在，请使用其他名称",
      }
    }

    const newItem = await db.createMonitoringItem({
      name,
      url,
      vendor,
      modules,
      frequency,
      email_notification,
      email_recipients,
    })

    revalidatePath("/")

    return {
      success: true,
      item: newItem,
    }
  } catch (error) {
    console.error("Error adding monitoring item:", error)
    return {
      success: false,
      error: "添加监控项失败",
    }
  }
}

export async function deleteMonitoringItem(id: string) {
  try {
    const success = await db.deleteMonitoringItem(id)

    revalidatePath("/")

    return { success }
  } catch (error) {
    console.error(`Error deleting monitoring item ${id}:`, error)
    return { success: false, error: "删除监控项失败" }
  }
}

export async function runMonitoring(id: string) {
  try {
    // 直接调用数据库函数而不是通过API路由
    const result = await db.runMonitoring(id);
    
    if (!result) {
      throw new Error("运行监控失败");
    }
    
    revalidatePath("/");
    
    return { success: true, result };
  } catch (error) {
    console.error(`Error running monitoring for item ${id}:`, error);
    return { success: false, error: error instanceof Error ? error.message : "运行监控失败" };
  }
}

export async function exportMonitoringResults(id: string) {
  try {
    const data = await db.exportMonitoringResults(id)

    return { success: true, data }
  } catch (error) {
    console.error(`Error exporting monitoring results for item ${id}:`, error)
    return { success: false, error: "导出监控结果失败" }
  }
}

export async function getLatestTwoMonitoringDetails(itemId: string) {
  try {
    const result = await db.getLatestTwoMonitoringDetails(itemId)
    return {
      success: true,
      ...result,
    }
  } catch (error) {
    console.error("获取最近两次监控详情失败:", error)
    return {
      success: false,
      error: "获取最近两次监控详情失败",
      latest: [],
      previous: [],
      records: [],
    }
  }
}

export async function getMonitoringRecordDetails(recordId: string) {
  try {
    const details = await db.getMonitoringDetails(recordId)
    return {
      success: true,
      details,
    }
  } catch (error) {
    console.error(`获取监控记录详情失败 (recordId: ${recordId}):`, error)
    return {
      success: false,
      error: "获取监控记录详情失败",
      details: [],
    }
  }
}

export async function startMonitoring(id: string) {
  try {
    // 开始执行监控
    const result = await runMonitoring(id);
    
    if (!result.success) {
      throw new Error(result.error || "监控执行失败");
    }
    
    revalidatePath("/");
    
    return { success: true };
  } catch (error) {
    console.error(`Error starting monitoring for item ${id}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "开始监控失败" 
    };
  }
}

export async function stopMonitoring(id: string) {
  try {
    // 停止执行监控
    const result = await db.stopMonitoring(id);
    
    if (!result) {
      throw new Error("停止监控失败");
    }
    
    revalidatePath("/");
    
    return { success: true };
  } catch (error) {
    console.error(`Error stopping monitoring for item ${id}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "停止监控失败" 
    };
  }
}

