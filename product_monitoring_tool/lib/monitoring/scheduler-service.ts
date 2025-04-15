import { MonitoringItem } from "@/lib/monitoring";
import { calculateNextMonitorTime } from "@/lib/utils/time";

/**
 * 检查是否需要执行监控
 * @param item 监控项
 * @returns 是否需要执行
 */
function shouldExecuteMonitoring(item: MonitoringItem): boolean {
  if (!item.is_monitoring) {
    return false;
  }

  const now = new Date();

  // 如果有 next_monitor_time，直接用它来判断
  if (item.next_monitor_time) {
    return now >= new Date(item.next_monitor_time);
  }

  // 如果没有 next_monitor_time，但有 last_monitor_time，计算下一次执行时间
  if (item.last_monitor_time) {
    const nextMonitorTime = calculateNextMonitorTime(item.frequency || "30 天/次", item.last_monitor_time);
    return now >= nextMonitorTime;
  }

  // 如果既没有 next_monitor_time 也没有 last_monitor_time，
  // 说明是首次执行，返回 false，让 startMonitoring 来设置首次执行时间
  return false;
}

/**
 * 更新监控项的时间信息
 * @param item 监控项
 * @returns 更新后的监控项
 */
function updateMonitoringTimes(item: MonitoringItem): MonitoringItem {
  const now = new Date();
  const frequency = item.frequency || "30 天/次";
  
  // 格式化为 YYYY-MM-DD HH:mm:ss 格式的本地时间字符串
  const formattedNow = now.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).replace(/\//g, "-");
  
  // 计算下次执行时间并格式化
  const nextTime = calculateNextMonitorTime(frequency, formattedNow);
  const formattedNextTime = nextTime.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).replace(/\//g, "-");

  return {
    ...item,
    last_monitor_time: formattedNow,
    next_monitor_time: formattedNextTime
  };
}

class MonitoringScheduler {
  private static instance: MonitoringScheduler;
  private monitoringItems: Map<string, MonitoringItem> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  private constructor() {
    console.log('监控调度器已初始化');
  }

  public static getInstance(): MonitoringScheduler {
    if (!MonitoringScheduler.instance) {
      MonitoringScheduler.instance = new MonitoringScheduler();
    }
    return MonitoringScheduler.instance;
  }

  /**
   * 添加或更新监控项
   * @param item 监控项
   * @param silent 是否静默更新（不输出日志）
   */
  public addOrUpdateItem(item: MonitoringItem, silent: boolean = false): void {
    const currentItem = this.monitoringItems.get(item.id);
    
    // 如果是新增项或者状态有变化，才输出日志
    if (!silent && (!currentItem || 
        currentItem.is_monitoring !== item.is_monitoring ||
        currentItem.status !== item.status)) {
      console.log(`[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] 监控项已更新: ${item.name}`);
    }
    
    this.monitoringItems.set(item.id, item);
  }

  /**
   * 移除监控项
   */
  public removeItem(itemId: string): void {
    const item = this.monitoringItems.get(itemId);
    this.monitoringItems.delete(itemId);
    if (item) {
      console.log(`[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] 监控项已移除: ${item.name}`);
    }
  }

  /**
   * 获取监控项状态
   */
  public getItemStatus(itemId: string): MonitoringItem | undefined {
    return this.monitoringItems.get(itemId);
  }

  /**
   * 获取所有监控项
   */
  public getAllItems(): MonitoringItem[] {
    return Array.from(this.monitoringItems.values());
  }

  /**
   * 取消执行
   */
  public cancelExecution(itemId: string): void {
    const controller = this.abortControllers.get(itemId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(itemId);
    }
  }
}

export const monitoringScheduler = MonitoringScheduler.getInstance(); 