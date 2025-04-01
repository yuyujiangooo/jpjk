import type { MonitoringItem } from "@/lib/monitoring";

/**
 * 解析监控频率字符串，返回毫秒数
 * @param frequency 频率字符串，如 "1 小时/次", "30 分钟/次"
 * @returns 间隔毫秒数
 */
export function parseFrequency(frequency: string): number {
  const match = frequency.match(/^(\d+)\s*(分钟|小时|天)\/次$/);
  if (!match) {
    throw new Error(`无效的频率格式: ${frequency}`);
  }

  const [_, value, unit] = match;
  const number = parseInt(value, 10);

  switch (unit) {
    case '分钟':
      return number * 60 * 1000; // 转换为毫秒
    case '小时':
      return number * 60 * 60 * 1000;
    case '天':
      return number * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`不支持的时间单位: ${unit}`);
  }
}

/**
 * 计算下次监控时间
 * @param frequency 频率字符串
 * @param lastMonitorTime 上次监控时间
 * @returns 下次监控时间
 */
export function calculateNextMonitorTime(frequency: string, lastMonitorTime?: string): Date {
  const interval = parseFrequency(frequency);
  const baseTime = lastMonitorTime ? new Date(lastMonitorTime) : new Date();
  
  // 如果没有提供上次监控时间，直接返回当前时间加上间隔
  if (!lastMonitorTime) {
    return new Date(baseTime.getTime() + interval);
  }
  
  // 将基准时间转换为本地时间字符串，再解析回 Date 对象
  const localBaseTime = new Date(baseTime.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }));
  const nextTime = new Date(localBaseTime.getTime() + interval);
  
  // 确保返回的时间也是本地时间
  return new Date(nextTime.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }));
}

/**
 * 检查是否需要执行监控
 * @param item 监控项
 * @returns 是否需要执行
 */
export function shouldExecuteMonitoring(item: MonitoringItem): boolean {
  if (!item.is_monitoring) {
    return false;
  }

  const now = new Date();
  const frequency = item.frequency || "30 天/次";

  // 如果有 next_monitor_time，直接用它来判断
  if (item.next_monitor_time) {
    return now >= new Date(item.next_monitor_time);
  }

  // 如果没有 next_monitor_time，但有 last_monitor_time，计算下一次执行时间
  if (item.last_monitor_time) {
    const nextMonitorTime = calculateNextMonitorTime(frequency, item.last_monitor_time);
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
export function updateMonitoringTimes(item: MonitoringItem): MonitoringItem {
  const now = new Date();
  const frequency = item.frequency || "30 天/次"; // 设置默认频率
  
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