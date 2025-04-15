import { chromium, Page } from 'playwright';
import type { MonitoringItem, MonitoringRecord, MonitoringDetail } from "@/lib/monitoring";
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';

/**
 * 提取页面内容并转换为Markdown格式
 */
async function extractContentAsMarkdown(page: Page): Promise<{
  htmlContent: string;
  markdownContent: string;
}> {
  return page.evaluate(() => {
    // 查找主要内容区域，增加更多可能的选择器
    const mainContent = document.querySelector('.page-content') || 
                       document.querySelector('.md') || 
                       document.querySelector('.tplContent') ||
                       document.querySelector('.content-wrap') ||
                       document.querySelector('.content-container');
    
    if (!mainContent) {
      console.log('未找到主要内容区域');
      return { htmlContent: '', markdownContent: '' };
    }

    // 获取HTML内容
    const htmlContent = mainContent.innerHTML;

    // 转换为Markdown
    let markdown = '';
    
    // 处理标题
    const title = document.querySelector('.sub-head .title') || 
                 document.querySelector('.page-title') ||
                 document.querySelector('h1');
    if (title) {
      markdown += `# ${title.textContent?.trim()}\n\n`;
    }

    // 处理更新时间
    const updateTime = document.querySelector('.time') || 
                      document.querySelector('.update-time');
    if (updateTime) {
      markdown += `*更新时间: ${updateTime.textContent?.trim()}*\n\n`;
    }

    // 处理主要内容
    function processContent(element: Element) {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            // 跳过不需要的节点
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.tagName.toLowerCase() === 'script' ||
                  element.tagName.toLowerCase() === 'style' ||
                  element.classList.contains('el-icon-arrow-right') ||
                  element.classList.contains('leftBorder') ||
                  element.classList.contains('nav-container') ||
                  element.classList.contains('menu-container') ||
                  element.classList.contains('header') ||
                  element.classList.contains('footer') ||
                  // 跳过表格内的文本节点，避免重复处理
                  (element.closest('.tableWrap') && !element.classList.contains('tableWrap'))) {
                return NodeFilter.FILTER_REJECT;
              }
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      let currentNode = walker.nextNode();
      while (currentNode) {
        if (currentNode.nodeType === Node.ELEMENT_NODE) {
          const element = currentNode as Element;
          
          // 处理标题
          if (/^h[1-6]$/i.test(element.tagName)) {
            const level = parseInt(element.tagName.substring(1));
            const text = element.textContent?.trim();
            if (text) {
              markdown += `${'#'.repeat(level)} ${text}\n\n`;
            }
          }
          // 处理段落和链接
          else if (element.tagName.toLowerCase() === 'p') {
            let text = '';
            // 处理段落中的链接
            const links = element.getElementsByTagName('a');
            if (links.length > 0) {
              let lastIndex = 0;
              const textContent = element.textContent || '';
              for (const link of links) {
                const linkText = link.textContent?.trim();
                const href = link.getAttribute('href');
                if (linkText && href && !href.startsWith('javascript:')) {
                  const fullHref = href.startsWith('http') ? href : 
                                 href.startsWith('/') ? `https://www.ctyun.cn${href}` : 
                                 `https://www.ctyun.cn/${href}`;
                  const linkIndex = textContent.indexOf(linkText, lastIndex);
                  if (linkIndex !== -1) {
                    text += textContent.substring(lastIndex, linkIndex);
                    text += `[${linkText}](${fullHref})`;
                    lastIndex = linkIndex + linkText.length;
                  }
                }
              }
              text += textContent.substring(lastIndex);
            } else {
              text = element.textContent?.trim() || '';
            }
            if (text) {
              markdown += `${text}\n\n`;
            }
          }
          // 处理列表
          else if (element.tagName.toLowerCase() === 'ul' || element.tagName.toLowerCase() === 'ol') {
            const isOrdered = element.tagName.toLowerCase() === 'ol';
            const items = Array.from(element.querySelectorAll('li'));
            if (items.length > 0) {
              items.forEach((item, index) => {
                let text = '';
                // 处理列表项中的链接
                const links = item.getElementsByTagName('a');
                if (links.length > 0) {
                  let lastIndex = 0;
                  const textContent = item.textContent || '';
                  for (const link of links) {
                    const linkText = link.textContent?.trim();
                    const href = link.getAttribute('href');
                    if (linkText && href && !href.startsWith('javascript:')) {
                      const fullHref = href.startsWith('http') ? href : 
                                     href.startsWith('/') ? `https://www.ctyun.cn${href}` : 
                                     `https://www.ctyun.cn/${href}`;
                      const linkIndex = textContent.indexOf(linkText, lastIndex);
                      if (linkIndex !== -1) {
                        text += textContent.substring(lastIndex, linkIndex);
                        text += `[${linkText}](${fullHref})`;
                        lastIndex = linkIndex + linkText.length;
                      }
                    }
                  }
                  text += textContent.substring(lastIndex);
                } else {
                  text = item.textContent?.trim() || '';
                }
                if (text) {
                  markdown += isOrdered ? `${index + 1}. ${text}\n` : `- ${text}\n`;
                }
              });
              markdown += '\n';
            }
          }
          // 处理表格
          else if (element.tagName.toLowerCase() === 'div' && element.classList.contains('tableWrap')) {
            // 找到第一个实际的表格（排除 fixed-table）
            const table = element.querySelector('table:not(.fixed-table)');
            if (table) {
              const thead = table.querySelector('thead');
              const tbody = table.querySelector('tbody');
              
              if (thead && tbody) {
                // 获取表头
                const headerRow = thead.querySelector('tr');
                if (headerRow) {
                  const headers = Array.from(headerRow.querySelectorAll('th')).map(th => {
                    // 移除表头中的 strong 标签，直接获取文本
                    return th.textContent?.trim() || '';
                  });

                  if (headers.length > 0 && !headers.every(h => h === '')) {
                    // 输出表头
                    markdown += `| ${headers.join(' | ')} |\n`;
                    // 输出分隔行
                    markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;

                    // 处理表格内容
                    const rows = tbody.querySelectorAll('tr');
                    for (const row of rows) {
                      const cells = Array.from(row.querySelectorAll('td')).map(td => {
                        let cellContent = '';
                        // 检查是否有链接
                        const links = td.getElementsByTagName('a');
                        if (links.length > 0) {
                          let lastIndex = 0;
                          const textContent = td.textContent || '';
                          for (const link of links) {
                            const linkText = link.textContent?.trim();
                            const href = link.getAttribute('href');
                            if (linkText && href && !href.startsWith('javascript:')) {
                              const fullHref = href.startsWith('http') ? href : 
                                             href.startsWith('/') ? `https://www.ctyun.cn${href}` : 
                                             `https://www.ctyun.cn/${href}`;
                              const linkIndex = textContent.indexOf(linkText, lastIndex);
                              if (linkIndex !== -1) {
                                cellContent += textContent.substring(lastIndex, linkIndex);
                                cellContent += `[${linkText}](${fullHref})`;
                                lastIndex = linkIndex + linkText.length;
                              }
                            }
                          }
                          cellContent += textContent.substring(lastIndex);
                        } else {
                          cellContent = td.textContent?.trim() || '';
                        }
                        // 处理可能的多行内容
                        return cellContent.split('\n').map(line => line.trim()).filter(Boolean).join(' ');
                      });

                      // 确保单元格数量与表头一致
                      if (cells.length === headers.length) {
                        markdown += `| ${cells.join(' | ')} |\n`;
                      } else {
                        // 如果单元格数量不一致，用空值填充
                        const paddedCells = [...cells];
                        while (paddedCells.length < headers.length) {
                          paddedCells.push('');
                        }
                        markdown += `| ${paddedCells.join(' | ')} |\n`;
                      }
                    }
                    markdown += '\n';
                  }
                }
              }
            }
          }
          // 处理图片
          else if (element.tagName.toLowerCase() === 'img') {
            const src = element.getAttribute('src');
            const alt = element.getAttribute('alt') || '';
            if (src && !src.startsWith('data:')) {
              markdown += `![${alt}](${src})\n\n`;
            }
          }
          // 处理独立的链接
          else if (element.tagName.toLowerCase() === 'a') {
            const href = element.getAttribute('href');
            const text = element.textContent?.trim();
            if (text && href && !href.startsWith('javascript:')) {
              const fullHref = href.startsWith('http') ? href : 
                             href.startsWith('/') ? `https://www.ctyun.cn${href}` : 
                             `https://www.ctyun.cn/${href}`;
              markdown += `[${text}](${fullHref})\n\n`;
            }
          }
        }
        currentNode = walker.nextNode();
      }
    }

    // 处理所有可能的内容区域
    const contentAreas = [
      mainContent.querySelector('.md'),
      mainContent.querySelector('.content'),
      mainContent.querySelector('.article-content'),
      mainContent
    ].filter(Boolean);

    for (const area of contentAreas) {
      if (area) {
        processContent(area);
      }
    }

    // 清理多余的空行
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

    return { htmlContent, markdownContent: markdown };
  });
}

const MAX_RETRIES = 3;
const BASE_TIMEOUT = 60000;
const RETRY_DELAY = 3000;

interface LoadPageOptions {
  timeout?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
}

async function loadPageWithFallback(page: Page, url: string, options: LoadPageOptions = {}, waitForContent: boolean = true) {
  if (!url || url === 'javascript:' || !url.startsWith('http')) {
    console.log(`跳过无效URL: ${url}`);
    return false;
  }

  try {
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: BASE_TIMEOUT 
    });

    // 只有在需要等待内容时才等待内容选择器
    if (waitForContent) {
      try {
        // 等待页面主要内容加载
        await Promise.race([
          page.waitForSelector('.page-content', { timeout: 10000 }),
          page.waitForSelector('.md', { timeout: 10000 }),
          page.waitForSelector('.tplContent', { timeout: 10000 })
        ]);
      } catch (selectorError) {
        console.log('内容选择器等待超时，继续处理');
      }
    }

    // 等待页面完全加载
    await page.waitForTimeout(2000);
    return true;
  } catch (error) {
    console.error(`页面加载失败: ${error}`);
    return false;
  }
}

/**
 * 重试操作的配置接口
 */
interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  baseTimeout: number;
}

/**
 * 重试操作的结果接口
 */
interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
}

/**
 * 对异步操作进行重试的通用函数
 * @param operation - 要重试的异步操作
 * @param name - 操作的名称，用于日志记录
 * @param url - 相关的URL，用于日志记录
 * @param config - 重试配置（可选）
 * @returns 返回操作的结果
 * @throws 如果所有重试都失败，则抛出最后一个错误
 */
async function retryOperation<T>(
  operation: () => Promise<T>,
  name: string,
  url: string,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const {
    maxRetries = MAX_RETRIES,
    retryDelay = RETRY_DELAY,
    baseTimeout = BASE_TIMEOUT
  } = config;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      console.log(`${name} (${url}) 操作成功，用时 ${attempt} 次尝试`);
      return result;
    } catch (error) {
      console.error(`处理${name} (${url}) 第 ${attempt} 次尝试失败:`, error);
      
      if (attempt === maxRetries) {
        const finalError = error instanceof Error 
          ? error 
          : new Error(`未知错误: ${String(error)}`);
        
        finalError.message = `${name} 在 ${maxRetries} 次尝试后仍然失败: ${finalError.message}`;
        throw finalError;
      }
      
      const currentDelay = retryDelay * attempt;
      console.log(`等待 ${currentDelay}ms 后进行第 ${attempt + 1} 次尝试...`);
      await new Promise(resolve => setTimeout(resolve, currentDelay));
    }
  }
  
  throw new Error(`在 ${maxRetries} 次尝试后仍然失败`);
}

async function checkMonitoringStatus(itemId: string, checkIsMonitoring: boolean = true): Promise<boolean> {
  try {
    const item = await db.getMonitoringItemById(itemId);
    if (!item) {
      console.log('监控项不存在，停止监控');
      return false;
    }
    // 只在需要时检查 is_monitoring 状态
    const shouldContinue = checkIsMonitoring ? item.is_monitoring === true : true;
    if (!shouldContinue && checkIsMonitoring) {
      console.log('监控已被用户停止');
    }
    return shouldContinue;
  } catch (error) {
    console.error('检查监控项状态时出错:', error);
    return false;
  }
}

async function findModule(page: Page, module: string): Promise<{ moduleFound: boolean; moduleText: string; moduleLink: string; moduleContent?: string; hasValidLink: boolean }> {
  const level1Results = await page.evaluate(({ targetModule }: { targetModule: string }) => {
    // 查找所有一级菜单项
    const level1Items = document.querySelectorAll('.item.level1[data-v-7da15e8e]');
    
    for (const item of level1Items) {
      // 查找菜单标签(可能是 a 标签或 span 标签)
      const label = item.querySelector('.item-label[data-v-7da15e8e] .name');
      if (!label) continue;
      
      const text = label.textContent?.trim() || '';
      
      if (text === targetModule) {
        // 获取链接(如果有)
        const link = label.tagName.toLowerCase() === 'a' ? label.getAttribute('href') : '';
        
        // 处理相对路径链接
        let processedLink = link;
        if (link && !link.startsWith('http') && !link.startsWith('javascript:')) {
          processedLink = link.startsWith('/') ? `https://www.ctyun.cn${link}` : `https://www.ctyun.cn/${link}`;
        }
        
        // 查找所有子菜单项
        const subItems = [];
        let currentElement = item.parentElement?.nextElementSibling;
        
        while (currentElement && !currentElement.querySelector('.item.level1[data-v-7da15e8e]')) {
          const subItem = currentElement.querySelector('.item[data-v-7da15e8e]');
          if (subItem) {
            const subLabel = subItem.querySelector('.item-label[data-v-7da15e8e] .name');
            if (subLabel) {
              const subText = subLabel.textContent?.trim() || '';
              let subLink = subLabel.tagName.toLowerCase() === 'a' ? subLabel.getAttribute('href') : '';
              
              // 处理子菜单相对路径链接
              if (subLink && !subLink.startsWith('http') && !subLink.startsWith('javascript:')) {
                subLink = subLink.startsWith('/') ? `https://www.ctyun.cn${subLink}` : `https://www.ctyun.cn/${subLink}`;
              }
              
              const hasChildren = !!subItem.querySelector('.el-icon-arrow-right.expand[data-v-7da15e8e]');
              
              subItems.push({
                text: subText,
                href: subLink,
                level: parseInt(subItem.className.match(/level(\d+)/)?.[1] || '2'),
                hasChildren
              });
            }
          }
          currentElement = currentElement.nextElementSibling;
        }
        
        return [{
          text,
          href: processedLink,
          isValidLink: !!processedLink || subItems.length > 0,
          subItems,
          hasDirectLink: !!processedLink
        }];
      }
    }
    return [];
  }, { targetModule: module });

  if (level1Results && level1Results.length > 0) {
    const firstMatch = level1Results[0];
    console.log(`找到一级菜单项: ${firstMatch.text}${firstMatch.isValidLink ? `, 链接: ${firstMatch.href}` : ' (无链接)'}${firstMatch.hasDirectLink ? ' (直接链接)' : ' (子菜单链接)'}`);
    
    let moduleContent = undefined;
    if (firstMatch.isValidLink && firstMatch.href) {
      try {
        const context = page.context();
        const modulePage = await context.newPage();
        
        let fullUrl = firstMatch.href;
        if (!fullUrl.startsWith('http')) {
          const currentUrl = page.url();
          const baseUrl = new URL(currentUrl).origin;
          fullUrl = new URL(fullUrl, baseUrl).href;
        }

        console.log(`正在访问模块链接: ${fullUrl}`);
        const loaded = await loadPageWithFallback(modulePage, fullUrl);
        
        if (loaded) {
          const { markdownContent } = await extractContentAsMarkdown(modulePage);
          moduleContent = markdownContent;
          console.log(`成功提取模块页面内容，内容长度: ${moduleContent?.length || 0}`);
        } else {
          console.log('页面加载失败');
        }

        await modulePage.close();
      } catch (error) {
        console.error(`访问模块链接失败:`, error);
      }
    } else {
      console.log(`该菜单项没有有效的链接`);
    }

    return {
      moduleFound: true,
      moduleText: firstMatch.text,
      moduleLink: firstMatch.href || '',
      moduleContent,
      hasValidLink: firstMatch.isValidLink && !!firstMatch.href
    };
  }

  console.log(`未找到一级菜单项: ${module}`);
  return {
    moduleFound: false,
    moduleText: '',
    moduleLink: '',
    hasValidLink: false
  };
}

interface SubMenuLink {
  text: string;
  href: string;
  level: number;
  hasChildren: boolean;
  path: string[];
}

async function processSubmenus(
  page: Page,
  module: string,
  moduleText: string,
  item: MonitoringItem,
  details: MonitoringDetail[],
  rank: number,
  context: any
): Promise<{ currentRank: number; stopped: boolean }> {
  const subMenuLinks = await page.evaluate((targetModule: string) => {
    // 找到目标一级菜单项
    const level1Items = document.querySelectorAll('.item.level1[data-v-7da15e8e]');
    const targetNavItem = Array.from(level1Items).find(item => {
      const label = item.querySelector('.item-label[data-v-7da15e8e] .name');
      return label?.textContent?.trim() === targetModule;
    });

    if (!targetNavItem) {
      console.log(`未找到一级菜单项: ${targetModule}`);
      return [];
    }

    // 获取所有子菜单项
    const results: SubMenuLink[] = [];
    const parentLi = targetNavItem.closest('li');
    if (!parentLi) return results;

    // 递归获取所有子菜单
    function collectSubItems(element: Element | null, currentPath: string[]) {
      if (!element) return;
      
      let currentElement = element.nextElementSibling;
      while (currentElement && !currentElement.querySelector('.item.level1[data-v-7da15e8e]')) {
        const item = currentElement.querySelector('.item[data-v-7da15e8e]');
        if (item) {
          const link = item.querySelector('.item-label[data-v-7da15e8e] .name');
          if (link) {
            const text = link.textContent?.trim() || '';
            const href = link.tagName.toLowerCase() === 'a' ? link.getAttribute('href') : '';
            const hasChildren = !!item.querySelector('.el-icon-arrow-right.expand[data-v-7da15e8e]');
            const level = parseInt(item.className.match(/level(\d+)/)?.[1] || '2');
            
            if (text && href && !href.startsWith('javascript:')) {
              results.push({
                text,
                href,
                level,
                hasChildren,
                path: [...currentPath, text]
              });
            }
            
            // 如果有子菜单，递归处理
            if (hasChildren) {
              collectSubItems(item, [...currentPath, text]);
            }
          }
        }
        currentElement = currentElement.nextElementSibling;
      }
    }

    collectSubItems(parentLi, [targetModule]);
    return results;
  }, module);

  let currentRank = rank;

  if (!subMenuLinks || subMenuLinks.length === 0) {
    console.log(`未找到子菜单: ${moduleText}`);
    return { currentRank, stopped: false };
  }

  console.log(`找到 ${subMenuLinks.length} 个子菜单，开始处理...`);

  for (const link of subMenuLinks) {
    if (!await checkMonitoringStatus(item.id)) {
      console.log('监控已停止，正在清理资源...');
      return { currentRank, stopped: true };
    }

    try {
      const fullPath = link.path.join(' > ');
      console.log(`正在爬取: ${fullPath}`);

      const subPage = await context.newPage();
      
      let fullUrl = link.href;
      if (!fullUrl.startsWith('http')) {
        const currentUrl = page.url();
        const baseUrl = new URL(currentUrl).origin;
        fullUrl = new URL(fullUrl, baseUrl).href;
      }

      if (!await checkMonitoringStatus(item.id)) {
        await subPage.close();
        return { currentRank, stopped: true };
      }

      await loadPageWithFallback(subPage, fullUrl);

      if (!await checkMonitoringStatus(item.id)) {
        await subPage.close();
        return { currentRank, stopped: true };
      }

      const { markdownContent } = await extractContentAsMarkdown(subPage);
      
      details.push({
        item_id: item.id,
        rank: currentRank++,
        page: fullPath,
        link: fullUrl,
        old_content: "首次监测",
        new_content: markdownContent || "无内容",
        action: markdownContent && markdownContent !== "无内容" ? "内容变化" : "无变化"
      });
      
      await subPage.close();
    } catch (error) {
      console.error(`处理子菜单 ${link.text} 时出错:`, error);
      const fullPath = link.path.join(' > ');
      details.push({
        item_id: item.id,
        rank: currentRank++,
        page: fullPath,
        link: link.href,
        old_content: "首次监测",
        new_content: `抓取失败: ${error instanceof Error ? error.message : String(error)}`,
        action: "无变化"
      });
    }
  }

  return { currentRank, stopped: false };
}

const executionLocks = new Map<string, boolean>();
const executionQueue: string[] = [];

async function acquireExecutionLock(itemId: string): Promise<boolean> {
  if (executionLocks.get(itemId)) {
    if (!executionQueue.includes(itemId)) {
      executionQueue.push(itemId);
    }
    return false;
  }
  
  executionLocks.set(itemId, true);
  return true;
}

async function releaseExecutionLock(itemId: string): Promise<void> {
  executionLocks.set(itemId, false);
  
  const index = executionQueue.indexOf(itemId);
  if (index > -1) {
    executionQueue.splice(index, 1);
  }
}

async function cleanupHistoryRecords(itemId: string): Promise<void> {
  try {
    const { data: records, error } = await supabase
      .from('monitoring_records')
      .select('id')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('获取监控记录失败:', error);
      return;
    }

    if (records && records.length > 0) {
      const recordsToKeep = records.slice(0, 5);
      const recordsToDelete = records.slice(5);

      for (let i = 0; i < recordsToKeep.length; i++) {
        const { error: updateError } = await supabase
          .from('monitoring_records')
          .update({ rank: i + 1 })
          .eq('id', recordsToKeep[i].id);

        if (updateError) {
          console.error(`更新记录 ${recordsToKeep[i].id} 的rank值失败:`, updateError);
        }
      }
      
      if (recordsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('monitoring_records')
          .delete()
          .in('id', recordsToDelete.map(r => r.id));

        if (deleteError) {
          console.error(`批量删除记录失败:`, deleteError);
        } else {
          console.log(`已清理监控项 ${itemId} 的历史记录，删除了 ${recordsToDelete.length} 条记录`);
        }
      }
    }
  } catch (error) {
    console.error('清理历史记录时出错:', error);
  }
}

/**
 * 抓取天翼云产品文档
 * @param item 监控项
 * @returns 监控结果，包含记录和详情
 */
const scrapeCTyun = async (item: MonitoringItem): Promise<{
  record: MonitoringRecord;
  details: MonitoringDetail[];
}> => {
  if (!await acquireExecutionLock(item.id)) {
    throw new Error('监控任务已在执行中');
  }

  let browser = null;
  let context = null;
  const details: MonitoringDetail[] = [];
  let currentRank = 1;
  let monitoringStopped = false;

  try {
    if (!await checkMonitoringStatus(item.id)) {
      monitoringStopped = true;
      return {
        record: {
          id: new Date().getTime().toString(),
          item_id: item.id,
          rank: 1,
          date: new Date().toISOString().split('T')[0],
          status: "监测已停止",
          summary: "监测已被手动停止"
        },
        details
      };
    }

    browser = await chromium.launch({
      headless: true
    });

    context = await browser.newContext();
    const page = await context.newPage();
    
    if (!await checkMonitoringStatus(item.id)) {
      monitoringStopped = true;
      return {
        record: {
          id: new Date().getTime().toString(),
          item_id: item.id,
          rank: 1,
          date: new Date().toISOString().split('T')[0],
          status: "监测已停止",
          summary: "监测已被手动停止"
        },
        details
      };
    }

    console.log(`开始访问文档首页: ${item.url}`);
    await loadPageWithFallback(page, item.url, {}, false);
    
    const pageTitle = await page.title();
    console.log(`已进入文档: ${pageTitle}`);
    
    if (!item.modules || item.modules.length === 0) {
      if (!await checkMonitoringStatus(item.id)) {
        monitoringStopped = true;
        return {
          record: {
            id: new Date().getTime().toString(),
            item_id: item.id,
            rank: 1,
            date: new Date().toISOString().split('T')[0],
            status: "监测已停止",
            summary: "监测已被手动停止"
          },
          details
        };
      }

      console.log('未指定监控模块，将爬取整个页面');
      const { markdownContent } = await extractContentAsMarkdown(page);
      
      details.push({
        item_id: item.id,
        rank: currentRank++,
        page: pageTitle || '主页面',
        link: item.url,
        old_content: "首次监测",
        new_content: markdownContent,
        action: markdownContent && markdownContent !== "无内容" ? "内容变化" : "无变化"
      });

      const now = new Date();
      const record: MonitoringRecord = {
        id: now.getTime().toString(),
        item_id: item.id,
        rank: 1,
        date: now.toISOString().split('T')[0],
        status: "监测成功",
        summary: "首次监测，发现 1 个页面"
      };

      await cleanupHistoryRecords(item.id);
      return { record, details };
    }

    for (const module of item.modules) {
      try {
        if (!await checkMonitoringStatus(item.id)) {
          monitoringStopped = true;
          break;
        }

        console.log(`\n开始处理模块: ${module}`);
        
        const { moduleFound, moduleText, moduleLink, moduleContent, hasValidLink } = await findModule(page, module);
        
        if (moduleFound) {
          if (moduleContent) {
            details.push({
              item_id: item.id,
              rank: currentRank++,
              page: moduleText,
              link: moduleLink || item.url,
              old_content: "首次监测",
              new_content: moduleContent,
              action: "内容变化"
            });
          }

          if (!await checkMonitoringStatus(item.id)) {
            monitoringStopped = true;
            break;
          }

          const result = await processSubmenus(page, module, moduleText, item, details, currentRank, context);
          currentRank = result.currentRank;
          if (result.stopped) {
            monitoringStopped = true;
            break;
          }
        } else {
          console.log(`未找到模块: ${module}`);
          details.push({
            item_id: item.id,
            rank: currentRank++,
            page: module,
            link: item.url,
            old_content: "首次监测",
            new_content: `未找到"${module}"模块`,
            action: "无变化"
          });
        }
      } catch (moduleError) {
        console.error(`处理模块 ${module} 时出错:`, moduleError);
        details.push({
          item_id: item.id,
          rank: currentRank++,
          page: module,
          link: item.url,
          old_content: "首次监测",
          new_content: `处理失败: ${moduleError instanceof Error ? moduleError.message : String(moduleError)}`,
          action: "无变化"
        });
      }
    }
    
    const now = new Date();
    let record: MonitoringRecord;
    
    if (monitoringStopped) {
      record = {
        id: now.getTime().toString(),
        item_id: item.id,
        rank: 1,
        date: now.toISOString().split('T')[0],
        status: "监测已停止",
        summary: `监测已被手动停止，已处理 ${details.length} 个页面`
      };
    } else {
      console.log(`\n爬取完成，共发现 ${details.length} 个页面`);
      record = {
        id: now.getTime().toString(),
        item_id: item.id,
        rank: 1,
        date: now.toISOString().split('T')[0],
        status: details.length > 0 ? "监测成功" : "监测失败",
        summary: details.length > 0 ? `首次监测，发现 ${details.length} 个页面` : "没有发现任何页面"
      };
    }
    
    await cleanupHistoryRecords(item.id);
    return { record, details };
  } catch (error) {
    console.error('天翼云抓取错误:', error);
    
    const now = new Date();
    const record: MonitoringRecord = {
      id: now.getTime().toString(),
      item_id: item.id,
      rank: 1,
      date: now.toISOString().split('T')[0],
      status: "监测失败",
      summary: `抓取失败: ${error instanceof Error ? error.message : String(error)}`
    };
    
    await cleanupHistoryRecords(item.id);
    return { record, details };
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (e) {
        console.error('关闭context时出错:', e);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('关闭browser时出错:', e);
      }
    }
    await releaseExecutionLock(item.id);
  }
};

export default scrapeCTyun; 