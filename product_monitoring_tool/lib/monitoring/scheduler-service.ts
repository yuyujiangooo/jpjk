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
  private executingItems: Map<string, number> = new Map();
  private maxConcurrentTasks: number = 1;
  private abortControllers: Map<string, AbortController> = new Map();
  private taskQueue: { id: string, item: MonitoringItem }[] = [];
  private isProcessingQueue: boolean = false;

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
   * 手动触发监控执行
   */
  public async manualCheck(itemId: string): Promise<void> {
    const item = this.monitoringItems.get(itemId);
    if (!item) {
      console.log(`[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] 监控项不存在: ${itemId}`);
      return;
    }

    if (this.isTaskInQueueOrExecuting(itemId)) {
      console.log(`[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] 监控任务已在队列中或正在执行: ${item.name}`);
      return;
    }

    this.taskQueue.push({ id: itemId, item });
    console.log(`[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] 监控任务已加入队列: ${item.name}`);

    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  private isTaskInQueueOrExecuting(itemId: string): boolean {
    return (
      this.taskQueue.some(task => task.id === itemId) ||
      this.executingItems.has(itemId)
    );
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;

    this.isProcessingQueue = true;
    
    while (this.taskQueue.length > 0) {
      const currentExecutingCount = this.executingItems.size;
      
      if (currentExecutingCount >= this.maxConcurrentTasks) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      const nextTask = this.taskQueue.shift();
      if (!nextTask) continue;

      try {
        await this.executeMonitoring(nextTask.id, nextTask.item);
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error(`[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] 执行监控任务失败: ${nextTask.item.name}`, error.message);
        } else {
          console.error(`[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] 执行监控任务失败: ${nextTask.item.name}`, String(error));
        }
      }
    }

    this.isProcessingQueue = false;
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
        currentItem.is_executing !== item.is_executing ||
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
   * 检查并清理过期的执行锁
   */
  private cleanupStaleLocks(): void {
    const now = Date.now();
    const EXECUTION_TIMEOUT = 5 * 60 * 1000; // 5分钟超时

    for (const [id, startTime] of this.executingItems.entries()) {
      if (now - startTime > EXECUTION_TIMEOUT) {
        const item = this.monitoringItems.get(id);
        console.log(`[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] 清理超时的执行锁: ${item?.name || id}`);
        this.executingItems.delete(id);
        
        // 重置监控项状态
        if (item && item.is_executing) {
          this.monitoringItems.set(id, {
            ...item,
            is_executing: false
          });
        }
      }
    }
  }

  /**
   * 重置监控项的执行状态
   */
  public resetExecutingState(itemId: string): void {
    this.executingItems.delete(itemId);
    const item = this.monitoringItems.get(itemId);
    if (item) {
      this.monitoringItems.set(itemId, {
        ...item,
        is_executing: false
      });
    }
  }

  /**
   * 执行单个监控任务
   */
  private async executeMonitoring(id: string, item: MonitoringItem): Promise<void> {
    const controller = new AbortController();
    this.abortControllers.set(id, controller);

    try {
      const startTime = new Date().toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false
      });
      console.log(`[${startTime}] 开始执行监控任务: ${item.name}`);
      
      // 更新执行状态，但保持其他状态不变
      const updatedItem = { 
        ...item, 
        is_executing: true,
        // 保持原有的监控状态
        is_monitoring: item.is_monitoring 
      };
      this.monitoringItems.set(id, updatedItem);
      this.executingItems.set(id, Date.now());

      try {
        const response = await fetch('/api/monitoring/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatedItem),
          signal: controller.signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`监控执行失败: ${response.statusText}, 详细信息: ${errorText}`);
        }

        const result = await response.json();

        // 获取最新的监控项状态，以防在执行过程中状态被其他操作修改
        const currentItem = this.monitoringItems.get(id);
        if (!currentItem) {
          throw new Error('监控项不存在');
        }

        // 更新监控时间和执行状态，但保持监控状态不变
        const completedItem = {
          ...updateMonitoringTimes(currentItem),
          is_executing: false,
          // 保持原有的监控状态
          is_monitoring: currentItem.is_monitoring,
          // 保存执行结果
          last_execution_result: result
        };
        this.monitoringItems.set(id, completedItem);

        const endTime = new Date().toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          hour12: false
        });
        console.log(`[${endTime}] 监控任务执行完成: ${item.name}`);
      } catch (error: unknown) {
        // 获取最新的监控项状态
        const currentItem = this.monitoringItems.get(id);
        if (!currentItem) {
          throw new Error('监控项不存在');
        }

        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            console.log(`[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] 监控任务已取消: ${item.name}`);
            // 更新状态但保持监控状态不变
            this.monitoringItems.set(id, {
              ...currentItem,
              is_executing: false
            });
            return;
          }
          
          const errorTime = new Date().toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
            hour12: false
          });
          console.error(`[${errorTime}] 监控任务执行失败: ${item.name}`, error.message);
          console.error('错误详情:', error.message);
          console.error('错误堆栈:', error.stack);
        }
        
        // 更新失败状态但保持监控状态不变
        const failedItem = { 
          ...currentItem,
          is_executing: false,
          status: "执行失败",
          last_execution_error: error instanceof Error ? error.message : String(error)
        };
        this.monitoringItems.set(id, failedItem);
      }
    } catch (error: unknown) {
      // 获取最新的监控项状态
      const currentItem = this.monitoringItems.get(id);
      if (!currentItem) {
        throw new Error('监控项不存在');
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.log(`[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] 监控任务已取消: ${item.name}`);
          // 更新状态但保持监控状态不变
          this.monitoringItems.set(id, {
            ...currentItem,
            is_executing: false
          });
          return;
        }

        const errorTime = new Date().toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          hour12: false
        });
        console.error(`[${errorTime}] 监控任务执行失败: ${item.name}`, error.message);
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);

        // 更新失败状态但保持监控状态不变
        this.monitoringItems.set(id, {
          ...currentItem,
          is_executing: false,
          status: "执行失败",
          last_execution_error: error.message
        });
      }
    } finally {
      this.abortControllers.delete(id);
      this.executingItems.delete(id);
    }
  }

  /**
   * 获取监控项的当前状态
   */
  public getItemStatus(itemId: string): MonitoringItem | undefined {
    return this.monitoringItems.get(itemId);
  }

  /**
   * 获取所有监控项的状态
   */
  public getAllItems(): MonitoringItem[] {
    return Array.from(this.monitoringItems.values());
  }

  /**
   * 取消监控执行
   */
  public cancelExecution(itemId: string): void {
    this.taskQueue = this.taskQueue.filter(task => task.id !== itemId);
    
    const controller = this.abortControllers.get(itemId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(itemId);
      console.log(`[${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}] 已取消监控任务: ${this.monitoringItems.get(itemId)?.name}`);
    }
    this.executingItems.delete(itemId);
    
    // 获取最新的监控项状态
    const item = this.monitoringItems.get(itemId);
    if (item) {
      // 只更新执行状态，保持监控状态不变
      this.monitoringItems.set(itemId, {
        ...item,
        is_executing: false
      });
    }
  }
}

// 导出单例实例
export const monitoringScheduler = MonitoringScheduler.getInstance(); 