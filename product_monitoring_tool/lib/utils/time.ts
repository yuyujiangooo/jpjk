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
 * 格式化日期为本地时间字符串
 * @param date 日期对象
 * @returns 格式化后的字符串 (YYYY-MM-DD HH:mm:ss)
 */
export function formatLocalDateTime(date: Date): string {
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).replace(/\//g, "-");
} 