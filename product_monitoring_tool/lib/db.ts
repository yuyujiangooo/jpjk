// 使用 Supabase 作为数据库
// 如果 Supabase 连接失败，将回退到内存数据库模式

import type { MonitoringItem, MonitoringRecord, MonitoringDetail, TABLES } from "@/lib/monitoring"
import scrapeHuaweiCloud from "./monitoring/huawei"
import scrapeAlibabaCloud from "./monitoring/alibaba"
import { compareResultsWithQianwen } from "./monitoring/qianwen"
import { supabase } from "@/lib/supabase"
import { sendMonitoringResultEmail } from "./email-service"
import { monitoringScheduler } from "./monitoring/scheduler-service"
import { calculateNextMonitorTime, formatLocalDateTime } from "@/lib/utils/time"
import { broadcast } from '@/app/api/monitoring/events/route'

// 类型转换辅助函数，用于安全地将 Supabase 返回的数据转换为我们的类型
function safeItemCast(data: any): MonitoringItem | null {
  if (!data) return null;
  return data as unknown as MonitoringItem;
}

function safeItemsCast(data: any[]): MonitoringItem[] {
  if (!data) return [];
  return data as unknown as MonitoringItem[];
}

function safeRecordsCast(data: any[]): MonitoringRecord[] {
  if (!data) return [];
  return data as unknown as MonitoringRecord[];
}

function safeDetailsCast(data: any[]): MonitoringDetail[] {
  if (!data) return [];
  return data as unknown as MonitoringDetail[];
}

// 添加重试机制的包装函数
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      
      // 指数退避延迟
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
  
  throw lastError;
}

// Database operations
export const db = {
  // Monitoring Items
  getMonitoringItems: async () => {
    return withRetry(async () => {
      const { data, error } = await supabase
        .from('monitoring_items')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return safeItemsCast(data || []);
    });
  },

  getMonitoringItemById: async (id: string) => {
    return withRetry(async () => {
      const { data, error } = await supabase
        .from('monitoring_items')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) return null;
      return safeItemCast(data);
    });
  },

  createMonitoringItem: async (item: Omit<MonitoringItem, "id" | "status" | "last_monitor_time" | "is_monitoring">) => {
    try {
      const newItem = {
        ...item,
        status: "未开始",
        is_monitoring: false,
        created_at: new Date().toISOString(),
      }
      
      const { data, error } = await supabase
        .from('monitoring_items')
        .insert(newItem)
        .select()
      
      if (error) {
        console.error('创建监控项失败:', error)
        return null
      }
      
      return safeItemCast(data && data[0])
    } catch (error) {
      console.error('创建监控项时发生异常:', error)
      return null
    }
  },

  updateMonitoringItem: async (id: string, updates: Partial<MonitoringItem>) => {
    try {
      const { data: updatedData, error } = await supabase
        .from('monitoring_items')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
      
      if (error) {
        console.error(`更新监控项 ${id} 失败:`, error)
        return null
      }
      
      const updatedItem = safeItemCast(updatedData && updatedData[0])
      if (updatedItem) {
        // 广播更新监控项消息
        broadcast({ type: 'itemUpdated', item: updatedItem })
      }
      
      return updatedItem
    } catch (error) {
      console.error(`更新监控项 ${id} 时发生异常:`, error)
      return null
    }
  },

  deleteMonitoringItem: async (id: string) => {
    try {
      // 首先删除相关的监控记录和详情
      await supabase
        .from('monitoring_details')
        .delete()
        .eq('item_id', id)
      
      await supabase
        .from('monitoring_records')
        .delete()
        .eq('item_id', id)
      
      // 然后删除监控项
      const { error } = await supabase
        .from('monitoring_items')
        .delete()
        .eq('id', id)
      
      if (error) {
        console.error(`删除监控项 ${id} 失败:`, error)
        return false
      }
      
      // 广播删除监控项消息
      broadcast({ type: 'itemDeleted', itemId: id })
      
      return true
    } catch (error) {
      console.error(`删除监控项 ${id} 时发生异常:`, error)
      return false
    }
  },

  // Monitoring Records
  getMonitoringRecords: async (itemId: string) => {
    try {
      // 获取最新的5条记录，按rank降序排序
      const { data: records, error } = await supabase
        .from('monitoring_records')
        .select('*')
        .eq('item_id', itemId)
        .order('rank', { ascending: false })
        .limit(5);

      if (error) {
        console.error('获取监控记录失败:', error);
        return [];
      }

      // 删除多余的旧记录（保留rank值最大的5条）
      const { data: oldRecords, error: oldRecordsError } = await supabase
        .from('monitoring_records')
        .select('id, rank')
        .eq('item_id', itemId)
        .order('rank', { ascending: false })
        .range(5, 999999);

      if (!oldRecordsError && oldRecords && oldRecords.length > 0) {
        await supabase
          .from('monitoring_records')
          .delete()
          .in('id', oldRecords.map(r => r.id));
      }

      return records;
    } catch (error) {
      console.error('获取监控记录失败:', error);
      return [];
    }
  },

  getMonitoringRecordsCount: async (itemId: string): Promise<number> => {
    try {
      const { count, error } = await supabase
        .from('monitoring_records')
        .select('*', { count: 'exact' })
        .eq('item_id', itemId)
      
      if (error) {
        console.error(`获取监控记录数量失败 (itemId: ${itemId}):`, error)
        return 0
      }
      
      return count || 0
    } catch (error) {
      console.error(`获取监控记录数量时发生异常 (itemId: ${itemId}):`, error)
      return 0
    }
  },

  // Monitoring Details
  getMonitoringDetails: async (recordId: string) => {
    const maxRetries = 2; // 减少重试次数
    const retryDelay = 500; // 减少重试延迟

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { data, error } = await supabase
          .from('monitoring_details')
          .select('*')
          .eq('record_id', recordId)
          .order('rank', { ascending: true })
        
        if (error) {
          console.error(`获取监控详情失败 (recordId: ${recordId}, 尝试次数: ${attempt}):`, error)
          if (attempt === maxRetries) {
            return []
          }
          await delay(retryDelay)
          continue
        }
        
        return safeDetailsCast(data || [])
      } catch (error) {
        console.error(`获取监控详情时发生异常 (recordId: ${recordId}, 尝试次数: ${attempt}):`, error)
        if (attempt === maxRetries) {
          return []
        }
        await delay(retryDelay)
      }
    }
    
    return []
  },

  // 获取最近两次的监控详情，用于比较
  getLatestTwoMonitoringDetails: async (itemId: string) => {
    try {
      // 获取最近两次的监控记录
      const { data: records, error: recordsError } = await supabase
        .from('monitoring_records')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false })
        .limit(2)
      
      if (recordsError) {
        console.error(`获取最近两次监控记录失败 (itemId: ${itemId}):`, recordsError)
        return { latest: [], previous: [], records: [] }
      }
      
      if (!records || records.length === 0) {
        return { latest: [], previous: [], records: [] }
      }
      
      // 获取最新一次的监控详情
      let latestDetails: MonitoringDetail[] = []
      if (records.length > 0) {
        const { data: latestData, error: latestError } = await supabase
          .from('monitoring_details')
          .select('*')
          .eq('record_id', records[0].id)
          .order('rank', { ascending: true })
        
        if (latestError) {
          console.error(`获取最新监控详情失败 (recordId: ${records[0].id}):`, latestError)
        } else {
          latestDetails = safeDetailsCast(latestData || [])
        }
      }
      
      // 获取上一次的监控详情
      let previousDetails: MonitoringDetail[] = []
      if (records.length > 1) {
        const { data: previousData, error: previousError } = await supabase
          .from('monitoring_details')
          .select('*')
          .eq('record_id', records[1].id)
          .order('rank', { ascending: true })
        
        if (previousError) {
          console.error(`获取上一次监控详情失败 (recordId: ${records[1].id}):`, previousError)
        } else {
          previousDetails = safeDetailsCast(previousData || [])
        }
      }
      
      // 构建包含新旧内容的详情列表
      const latest = latestDetails.map(detail => {
        // 查找对应的上一次监控详情
        const previousDetail = previousDetails.find(
          p => p.page === detail.page && p.rank === detail.rank
        )
        
        // 如果找到对应的上一次详情，将其内容作为旧内容
        if (previousDetail) {
          return {
            ...detail,
            old_content: previousDetail.new_content || previousDetail.old_content || "无内容"
          }
        }
        
        // 如果没有找到对应的上一次详情，标记为新增
        return {
          ...detail,
          old_content: "新增页面",
          action: detail.action || "新增"
        }
      })
      
      // 查找在最新监控中不存在但在上一次监控中存在的页面（已删除的页面）
      const deletedDetails = previousDetails.filter(
        prevDetail => 
          // 确保该页面在最新监控中不存在
          !latestDetails.some(
            latestDetail => latestDetail.page === prevDetail.page && latestDetail.rank === prevDetail.rank
          ) &&
          // 确保上一次的内容不是"页面已删除"，避免重复报告
          prevDetail.new_content !== "页面已删除"
      ).map(prevDetail => ({
        ...prevDetail,
        new_content: "页面已删除",
        old_content: prevDetail.new_content || prevDetail.old_content || "无内容",
        action: "删除"
      }));
      
      // 合并最新详情和已删除的详情
      const combinedLatest = [...latest, ...deletedDetails]
      
      return { 
        latest: combinedLatest, 
        previous: previousDetails, 
        records: safeRecordsCast(records) 
      }
    } catch (error) {
      console.error(`获取最近两次监控详情时发生异常 (itemId: ${itemId}):`, error)
      return { latest: [], previous: [], records: [] }
    }
  },

  // Check if a monitoring item name already exists
  isMonitoringItemNameExists: async (name: string) => {
    try {
      const { data, error } = await supabase
        .from('monitoring_items')
        .select('id')
        .eq('name', name)
        .limit(1)
      
      if (error) {
        console.error('检查监控项名称是否存在失败:', error)
        return false
      }
      
      return data.length > 0
    } catch (error) {
      console.error('检查监控项名称是否存在时发生异常:', error)
      return false
    }
  },

  startMonitoring: async (id: string) => {
    try {
      const now = new Date();
      
      // 先获取监控项以获取频率
      const item = await db.getMonitoringItemById(id);
      if (!item) {
        throw new Error(`监控项 ${id} 不存在`);
      }

      const { data, error } = await supabase
        .from('monitoring_items')
        .update({
          is_monitoring: true,
          updated_at: now.toISOString(),
          next_monitor_time: calculateNextMonitorTime(item.frequency || "30 天/次")
            .toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            }).replace(/\//g, "-")
        })
        .eq('id', id)
        .select()
      
      if (error) {
        console.error(`启动监控 ${id} 失败:`, error)
        return null
      }
      
      const updatedItem = safeItemCast(data && data[0])
      
      // 已禁用自动执行功能
      // if (updatedItem) {
      //   monitoringScheduler.addOrUpdateItem(updatedItem)
      // }
      
      return updatedItem
    } catch (error) {
      console.error(`启动监控 ${id} 时发生异常:`, error)
      return null
    }
  },

  stopMonitoring: async (id: string) => {
    try {
      // 更新数据库中的监控项状态
      const { data: updatedData, error } = await supabase
        .from('monitoring_items')
        .update({
          is_monitoring: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
      
      if (error) {
        console.error(`停止监控项 ${id} 失败:`, error)
        return null
      }
      
      return safeItemCast(updatedData && updatedData[0])
    } catch (error) {
      console.error(`停止监控项 ${id} 时发生异常:`, error)
      return null
    }
  },

  // Run monitoring process
  runMonitoring: async (itemId: string) => {
    try {
      // 获取监控项
      const { data: item, error: itemError } = await supabase
        .from('monitoring_items')
        .select('*')
        .eq('id', itemId)
        .single()
      
      if (itemError || !item) {
        console.error(`获取监控项 ${itemId} 失败:`, itemError)
        return null
      }
      
      const monitoringItem = safeItemCast(item)
      if (!monitoringItem) {
        console.error(`获取监控项 ${itemId} 失败: 无效的数据格式`)
        return null
      }
      
      // 更新最后监控时间
      const now = new Date()
      
      // 格式化为 YYYY/MM/DD HH:mm:ss
      const formattedDate = now.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).replace(/\//g, "-")
      
      // 更新监控项状态
      await supabase
        .from('monitoring_items')
        .update({
          last_monitor_time: formattedDate,
          status: "正常运行",
          updated_at: now.toISOString(),
          next_monitor_time: calculateNextMonitorTime(monitoringItem.frequency || "30 天/次", formattedDate)
            .toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            }).replace(/\//g, "-")
        })
        .eq('id', itemId)
      
      // 获取最大的 rank 值
      const { data: maxRankData, error: maxRankError } = await supabase
        .from('monitoring_records')
        .select('rank')
        .eq('item_id', itemId)
        .order('rank', { ascending: false })
        .limit(1);
      
      const nextRank = maxRankData && maxRankData.length > 0 ? maxRankData[0].rank + 1 : 1;
      
      // 使用 Record<string, any> 类型来避免 item_id 类型错误
      let newRecord: Record<string, any> = {
        item_id: itemId,
        rank: nextRank,
        date: formattedDate,
        status: "监测成功",
        created_at: now.toISOString(),
        summary: "监测完成"
      }
      
      let newDetails: Array<Record<string, any>> = []
      
      try {
        // 根据不同的云服务商使用不同的抓取方法
        if (monitoringItem.vendor === "华为云") {
          console.log(`开始抓取华为云产品: ${monitoringItem.name}`)
          const result = await scrapeHuaweiCloud(monitoringItem)
          
          // 获取最近的监控记录和详情
          const { data: recentRecordsData, error: recordsError } = await supabase
            .from('monitoring_records')
            .select('*')
            .eq('item_id', itemId)
            .order('created_at', { ascending: false })
            .limit(1)
          
          if (recordsError) {
            console.error(`获取最近监控记录失败:`, recordsError)
          }
          
          // 获取最近一次监控的详情
          let oldDetails: any[] = []
          if (recentRecordsData && recentRecordsData.length > 0) {
            const latestRecordId = recentRecordsData[0].id
            const { data: oldDetailsData, error: detailsError } = await supabase
              .from('monitoring_details')
              .select('*')
              .eq('record_id', latestRecordId)
              .order('rank', { ascending: true })
            
            if (detailsError) {
              console.error(`获取旧监控详情失败:`, detailsError)
            } else {
              oldDetails = oldDetailsData || []
            }
          }
          
          // 如果不是首次监控，比较结果找出变化
          if (oldDetails && oldDetails.length > 0) {
            // 使用通义千问增强的比较功能
            const { changes, recordSummary } = await compareResultsWithQianwen(safeDetailsCast(oldDetails), result.details)
            
            // 过滤出有变化的记录
            const significantChanges = changes.filter(
              detail => detail.action === "内容变化"
            )
            
            if (significantChanges.length > 0) {
              // 更新监控记录的摘要
              newRecord.summary = recordSummary
            } else {
              newRecord.summary = "未发现变化"
            }
            
            // 获取最近的监控记录数量作为新记录的 rank
            const { data: recordCount, error: countError } = await supabase
              .from('monitoring_records')
              .select('id', { count: 'exact' })
              .eq('item_id', itemId);
            
            if (countError) {
              console.error(`获取监控记录数量失败:`, countError);
            }
            
            // 使用记录数量 + 1 作为新记录的 rank
            const newRank = (recordCount?.length || 0) + 1;
            
            // 更新 newRecord 的 rank
            newRecord = {
              ...newRecord,
              rank: newRank
            };
            
            // 保存监控记录
            const { data: recordData, error: recordError } = await supabase
              .from('monitoring_records')
              .insert([newRecord])
              .select()
            
            if (recordError) {
              console.error(`保存监控记录失败:`, recordError)
              return null
            }
            
            const savedRecord = recordData[0]
            
            // 为每个详情添加record_id，保持完整内容
            newDetails = changes.map(detail => ({
              ...detail,
              item_id: itemId,
              record_id: savedRecord.id,
              created_at: now.toISOString(),
              old_content: detail.old_content || "无内容",
              new_content: detail.new_content || "无内容"
            }))
          } else {
            // 首次监控
            newRecord.summary = `首次监测，发现 ${result.details.length} 个页面`
            
            // 获取最近的监控记录数量作为新记录的 rank
            const { data: recordCount, error: countError } = await supabase
              .from('monitoring_records')
              .select('id', { count: 'exact' })
              .eq('item_id', itemId);
            
            if (countError) {
              console.error(`获取监控记录数量失败:`, countError);
            }
            
            // 使用记录数量 + 1 作为新记录的 rank
            const newRank = (recordCount?.length || 0) + 1;
            
            // 更新 newRecord 的 rank
            newRecord = {
              ...newRecord,
              rank: newRank
            };
            
            // 保存监控记录
            const { data: recordData, error: recordError } = await supabase
              .from('monitoring_records')
              .insert([newRecord])
              .select()
            
            if (recordError) {
              console.error(`保存监控记录失败:`, recordError)
              return null
            }
            
            const savedRecord = recordData[0]
            
            // 为每个详情添加record_id，保持完整内容
            newDetails = result.details.map(detail => ({
              ...detail,
              item_id: itemId,
              record_id: savedRecord.id,
              created_at: now.toISOString(),
              old_content: detail.old_content || "首次监测",
              new_content: detail.new_content || "无内容"
            }))
          }
          
          // 保存新的监控详情
          if (newDetails.length > 0) {
            console.log(`准备保存 ${newDetails.length} 条监控详情`)
            
            // 移除可能存在的 id 字段，让数据库自动生成
            const detailsToInsert = newDetails.map(({ id, ...detail }) => detail)
            
            const { error: detailsError } = await supabase
              .from('monitoring_details')
              .insert(detailsToInsert)
            
            if (detailsError) {
              console.error(`保存监控详情失败:`, detailsError)
            } else {
              console.log(`成功保存 ${newDetails.length} 条监控详情`)
            }
          }
        } else if (monitoringItem.vendor === "阿里云") {
          console.log(`开始抓取阿里云产品: ${monitoringItem.name}`)
          const result = await scrapeAlibabaCloud(monitoringItem)
          
          // 获取最近的监控记录和详情
          const { data: recentRecordsData, error: recordsError } = await supabase
            .from('monitoring_records')
            .select('*')
            .eq('item_id', itemId)
            .order('created_at', { ascending: false })
            .limit(1)
          
          if (recordsError) {
            console.error(`获取最近监控记录失败:`, recordsError)
          }
          
          // 获取最近一次监控的详情
          let oldDetails: any[] = []
          if (recentRecordsData && recentRecordsData.length > 0) {
            const latestRecordId = recentRecordsData[0].id
            const { data: oldDetailsData, error: detailsError } = await supabase
              .from('monitoring_details')
              .select('*')
              .eq('record_id', latestRecordId)
              .order('rank', { ascending: true })
            
            if (detailsError) {
              console.error(`获取旧监控详情失败:`, detailsError)
            } else {
              oldDetails = oldDetailsData || []
            }
          }
          
          // 如果不是首次监控，比较结果找出变化
          if (oldDetails && oldDetails.length > 0) {
            // 使用通义千问增强的比较功能
            const { changes, recordSummary } = await compareResultsWithQianwen(safeDetailsCast(oldDetails), result.details)
            
            // 过滤出有变化的记录
            const significantChanges = changes.filter(
              detail => detail.action === "内容变化"
            )
            
            if (significantChanges.length > 0) {
              // 更新监控记录的摘要
              newRecord.summary = recordSummary
            } else {
              newRecord.summary = "未发现变化"
            }
            
            // 获取最近的监控记录数量作为新记录的 rank
            const { data: recordCount, error: countError } = await supabase
              .from('monitoring_records')
              .select('id', { count: 'exact' })
              .eq('item_id', itemId);
            
            if (countError) {
              console.error(`获取监控记录数量失败:`, countError);
            }
            
            // 使用记录数量 + 1 作为新记录的 rank
            const newRank = (recordCount?.length || 0) + 1;
            
            // 更新 newRecord 的 rank
            newRecord = {
              ...newRecord,
              rank: newRank
            };
            
            // 保存监控记录
            const { data: recordData, error: recordError } = await supabase
              .from('monitoring_records')
              .insert([newRecord])
              .select()
            
            if (recordError) {
              console.error(`保存监控记录失败:`, recordError)
              return null
            }
            
            const savedRecord = recordData[0]
            
            // 为每个详情添加record_id，保持完整内容
            newDetails = changes.map(detail => ({
              ...detail,
              item_id: itemId,
              record_id: savedRecord.id,
              created_at: now.toISOString(),
              old_content: detail.old_content || "无内容",
              new_content: detail.new_content || "无内容"
            }))
          } else {
            // 首次监控
            newRecord.summary = `首次监测，发现 ${result.details.length} 个页面`
            
            // 获取最近的监控记录数量作为新记录的 rank
            const { data: recordCount, error: countError } = await supabase
              .from('monitoring_records')
              .select('id', { count: 'exact' })
              .eq('item_id', itemId);
            
            if (countError) {
              console.error(`获取监控记录数量失败:`, countError);
            }
            
            // 使用记录数量 + 1 作为新记录的 rank
            const newRank = (recordCount?.length || 0) + 1;
            
            // 更新 newRecord 的 rank
            newRecord = {
              ...newRecord,
              rank: newRank
            };
            
            // 保存监控记录
            const { data: recordData, error: recordError } = await supabase
              .from('monitoring_records')
              .insert([newRecord])
              .select()
            
            if (recordError) {
              console.error(`保存监控记录失败:`, recordError)
              return null
            }
            
            const savedRecord = recordData[0]
            
            // 为每个详情添加record_id，保持完整内容
            newDetails = result.details.map(detail => ({
              ...detail,
              item_id: itemId,
              record_id: savedRecord.id,
              created_at: now.toISOString(),
              old_content: detail.old_content || "首次监测",
              new_content: detail.new_content || "无内容"
            }))
          }
          
          // 保存新的监控详情
          if (newDetails.length > 0) {
            console.log(`准备保存 ${newDetails.length} 条监控详情`)
            
            // 移除可能存在的 id 字段，让数据库自动生成
            const detailsToInsert = newDetails.map(({ id, ...detail }) => detail)
            
            const { error: detailsError } = await supabase
              .from('monitoring_details')
              .insert(detailsToInsert)
            
            if (detailsError) {
              console.error(`保存监控详情失败:`, detailsError)
            } else {
              console.log(`成功保存 ${newDetails.length} 条监控详情`)
            }
          }
        } else {
          // 其他云服务商暂时使用模拟数据
          newRecord.summary = "模拟监控数据"
          
          // 获取最近的监控记录数量作为新记录的 rank
          const { data: recordCount, error: countError } = await supabase
            .from('monitoring_records')
            .select('id', { count: 'exact' })
            .eq('item_id', itemId);
          
          if (countError) {
            console.error(`获取监控记录数量失败:`, countError);
          }
          
          // 使用记录数量 + 1 作为新记录的 rank
          const newRank = (recordCount?.length || 0) + 1;
          
          // 更新 newRecord 的 rank
          newRecord = {
            ...newRecord,
            rank: newRank
          };
          
          // 保存监控记录
          const { data: recordData, error: recordError } = await supabase
            .from('monitoring_records')
            .insert([newRecord])
            .select()
          
          if (recordError) {
            console.error(`保存监控记录失败:`, recordError)
            return null
          }
          
          const savedRecord = recordData[0]
          
          // 创建模拟详情
          if (monitoringItem.modules && Array.isArray(monitoringItem.modules)) {
            newDetails = monitoringItem.modules.map((module: string, index: number) => ({
              id: undefined, // 让数据库自动生成
              item_id: itemId,
              record_id: savedRecord.id,
              rank: index + 1,
              page: module,
              link: `${monitoringItem.url}#${module}`,
              old_content: "首次监测",
              new_content: "模拟监控内容",
              action: "提示",
              created_at: now.toISOString(),
            }))
            
            // 保存新的监控详情
            if (newDetails.length > 0) {
              console.log(`准备保存 ${newDetails.length} 条监控详情`)
              
              // 移除可能存在的 id 字段，让数据库自动生成
              const detailsToInsert = newDetails.map(({ id, ...detail }) => detail)
              
              const { error: detailsError } = await supabase
                .from('monitoring_details')
                .insert(detailsToInsert)
              
              if (detailsError) {
                console.error(`保存监控详情失败:`, detailsError)
              } else {
                console.log(`成功保存 ${newDetails.length} 条监控详情`)
              }
            }
          }
        }
      } catch (error) {
        console.error(`监控过程中出错:`, error)
        newRecord.status = "监测失败"
        newRecord.summary = `监测失败: ${error instanceof Error ? error.message : String(error)}`
        
        // 获取最近的监控记录数量作为新记录的 rank
        const { data: recordCount, error: countError } = await supabase
          .from('monitoring_records')
          .select('id', { count: 'exact' })
          .eq('item_id', itemId);
        
        if (countError) {
          console.error(`获取监控记录数量失败:`, countError);
        }
        
        // 使用记录数量 + 1 作为新记录的 rank
        const newRank = (recordCount?.length || 0) + 1;
        
        // 更新 newRecord 的 rank
        newRecord = {
          ...newRecord,
          rank: newRank
        };
        
        // 保存监控记录
        const { data: recordData, error: recordError } = await supabase
          .from('monitoring_records')
          .insert([newRecord])
          .select()
        
        if (recordError) {
          console.error(`保存监控记录失败:`, recordError)
          return null
        }
      }
      
      // 获取最新的监控记录
      const { data: latestRecord, error: latestRecordError } = await supabase
        .from('monitoring_records')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (latestRecordError) {
        console.error(`获取最新监控记录失败:`, latestRecordError)
        return null
      }
      
      // 获取最新的监控详情
      const { data: latestDetails, error: latestDetailsError } = await supabase
        .from('monitoring_details')
        .select('*')
        .eq('record_id', latestRecord.id)
        .order('rank', { ascending: true })
      
      if (latestDetailsError) {
        console.error(`获取最新监控详情失败:`, latestDetailsError)
      }
      
      // 发送邮件通知
      await sendMonitoringResultEmail(monitoringItem, latestRecord, latestDetails || [])
      
      // 广播监控结果
      broadcast({
        type: 'monitoringResult',
        itemId,
        record: latestRecord,
        details: latestDetails || []
      })
      
      return {
        item: monitoringItem,
        record: latestRecord,
        details: latestDetails || [],
      }
    } catch (error) {
      console.error(`运行监控过程时发生异常 (itemId: ${itemId}):`, error)
      return null
    }
  },

  // Export monitoring results
  exportMonitoringResults: async (itemId: string) => {
    try {
      // 获取监控项
      const { data: item, error: itemError } = await supabase
        .from('monitoring_items')
        .select('*')
        .eq('id', itemId)
        .single()
      
      if (itemError) {
        console.error(`获取监控项 ${itemId} 失败:`, itemError)
        return null
      }
      
      return safeItemCast(item)
    } catch (error) {
      console.error(`导出监控结果时发生异常 (itemId: ${itemId}):`, error)
      return null
    }
  },

  addMonitoringItem: async (data: any) => {
    try {
      const { data: item, error } = await supabase
        .from('monitoring_items')
        .insert([data])
        .select()
        .single()

      if (error) throw error

      const newItem = safeItemCast(item)
      if (newItem) {
        // 广播新增监控项消息
        broadcast({ type: 'itemAdded', item: newItem })
      }
      
      return newItem
    } catch (error) {
      console.error('添加监控项失败:', error)
      return null
    }
  },
}