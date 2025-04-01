import { MonitoringItem } from "@/lib/monitoring";
import { shouldExecuteMonitoring, updateMonitoringTimes } from "./scheduler";

class MonitoringScheduler {
  private static instance: MonitoringScheduler;
  private timeoutId: number | null = null;
  private monitoringItems: Map<string, MonitoringItem> = new Map();
  private isRunning: boolean = false;
  private executingItems: Map<string, number> = new Map(); // 改用 Map 存储执行开始时间

  private constructor() {
    // 私有构造函数，确保单例模式
  }

  public static getInstance(): MonitoringScheduler {
    if (!MonitoringScheduler.instance) {
      MonitoringScheduler.instance = new MonitoringScheduler();
    }
    return MonitoringScheduler.instance;
  }

  /**
   * 启动监控调度器
   */
  public start(): void {
    if (this.isRunning) {
      return; // 已经在运行
    }

    this.isRunning = true;
    console.log('监控调度器已启动');

    // 每分钟检查一次是否需要执行监控任务
    this.timeoutId = window.setInterval(() => {
      this.checkAndExecuteMonitoring();
    }, 60 * 1000);
  }

  /**
   * 停止监控调度器
   */
  public stop(): void {
    if (this.timeoutId !== null) {
      window.clearInterval(this.timeoutId);
      this.timeoutId = null;
      this.isRunning = false;
      this.monitoringItems.clear();
      this.executingItems.clear();
      console.log('监控调度器已停止');
    }
  }

  /**
   * 添加或更新监控项
   */
  public addOrUpdateItem(item: MonitoringItem): void {
    // 直接更新监控项，不设置执行时间
    this.monitoringItems.set(item.id, item);
    console.log(`监控项已更新: ${item.name}, 下次执行时间: ${item.next_monitor_time}`);
  }

  /**
   * 移除监控项
   */
  public removeItem(itemId: string): void {
    this.monitoringItems.delete(itemId);
    console.log(`监控项已移除: ${itemId}`);
  }

  /**
   * 检查并清理过期的执行锁
   */
  private cleanupStaleLocks(): void {
    const now = Date.now();
    const EXECUTION_TIMEOUT = 5 * 60 * 1000; // 5分钟超时

    for (const [id, startTime] of this.executingItems.entries()) {
      if (now - startTime > EXECUTION_TIMEOUT) {
        console.log(`清理超时的执行锁: ${id}`);
        this.executingItems.delete(id);
        
        // 重置监控项状态
        const item = this.monitoringItems.get(id);
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
   * 检查并执行需要监控的任务
   */
  private async checkAndExecuteMonitoring(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // 清理过期的执行锁
    this.cleanupStaleLocks();

    for (const [id, item] of this.monitoringItems.entries()) {
      try {
        // 检查是否已在执行中
        if (this.executingItems.has(id)) {
          console.log(`跳过执行：监控任务 ${item.name} 正在执行中`);
          continue;
        }

        if (shouldExecuteMonitoring(item)) {
          console.log(`开始执行监控任务: ${item.name}`);
          
          // 添加到执行锁集合，记录开始时间
          this.executingItems.set(id, Date.now());
          
          // 更新执行状态
          const updatedItem = { ...item, is_executing: true };
          this.monitoringItems.set(id, updatedItem);

          try {
            // 通过 API 执行监控任务
            const response = await fetch('/api/monitoring/execute', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(updatedItem),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`监控执行失败: ${response.statusText}, 详细信息: ${errorText}`);
            }

            const result = await response.json();

            // 更新监控时间和状态
            const completedItem = {
              ...updateMonitoringTimes(updatedItem),
              is_executing: false
            };
            this.monitoringItems.set(id, completedItem);

            console.log(`监控任务完成: ${item.name}, 下次执行时间: ${completedItem.next_monitor_time}`);
          } catch (error) {
            console.error(`监控任务执行失败: ${item.name}`, error);
            if (error instanceof Error) {
              console.error('错误详情:', error.message);
              console.error('错误堆栈:', error.stack);
            }
            
            // 更新状态为非执行状态，但保持监控状态
            const failedItem = { 
              ...item, 
              is_executing: false,
              status: "执行失败",
              next_monitor_time: new Date(Date.now() + 5 * 60 * 1000).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              }).replace(/\//g, "-")
            };
            this.monitoringItems.set(id, failedItem);
            
            // 重新抛出错误，让外层 catch 处理
            throw error;
          }
        }
      } catch (error) {
        console.error(`监控任务执行失败: ${item.name}`, error);
        if (error instanceof Error) {
          console.error('错误详情:', error.message);
          console.error('错误堆栈:', error.stack);
        }
      } finally {
        // 无论成功还是失败，都从执行锁集合中移除
        this.executingItems.delete(id);
      }
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
}

// 导出单例实例
export const monitoringScheduler = MonitoringScheduler.getInstance(); 