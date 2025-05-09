import { chromium } from 'playwright';
import type { MonitoringItem, MonitoringRecord, MonitoringDetail } from "@/lib/monitoring";
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';

/**
 * 提取页面内容并转换为Markdown格式，专注于文字、图片和视频内容
 */
async function extractContentAsMarkdown(page: any): Promise<{
  htmlContent: string;
  markdownContent: string;
}> {
  return page.evaluate(() => {
    function convertHtmlToMarkdown(element: Element | null): string {
      if (!element) return '';
      
      // 深拷贝节点，避免修改原始DOM
      const clonedNode = element.cloneNode(true) as Element;
      
      // 移除不需要的元素
      const removeSelectors = [
        'script', 'style', 'meta', 'link', 'noscript', 'iframe:not([src*="video"])',
        '.hidden', '.d-none', '.invisible', '.nav', '.navigation', '.menu',
        '.header', '.footer', '.ad', '.advertisement', '.breadcrumb',
        '.sidebar:not(.content-sidebar)', '.comment', '.cookie', '.popup',
        // 添加华为云文档特有的不需要元素
        '.document-btn', '.pull-right', '.icon-shareicon', '.h-icon-list',
        '.doc-info', 'a[href*="pdf"]', '.icon', '.shared', '.link-to-share',
        '.copy-link', '.link-shared-section', '.h-icon', '.user-info'
      ];
      
      removeSelectors.forEach(selector => {
        clonedNode.querySelectorAll(selector).forEach(el => {
          el.remove();
        });
      });
      
      // 转换标题
      Array.from(clonedNode.querySelectorAll('h1, h2, h3, h4, h5, h6')).forEach(heading => {
        const level = parseInt(heading.tagName.substring(1));
        const text = heading.textContent?.trim() || '';
        heading.outerHTML = '\n\n' + '#'.repeat(level) + ' ' + text + '\n\n';
      });
      
      // 转换段落
      Array.from(clonedNode.querySelectorAll('p')).forEach(paragraph => {
        // 检查是否为纯文本段落
        const hasImportantChild = Array.from(paragraph.children).some(child => 
          ['IMG', 'VIDEO', 'IFRAME', 'A'].includes(child.tagName)
        );
        
        if (!hasImportantChild) {
          const text = paragraph.textContent?.trim() || '';
          if (text) {
            paragraph.outerHTML = '\n\n' + text + '\n\n';
          } else {
            paragraph.remove();
          }
        }
      });
      
      // 转换链接
      Array.from(clonedNode.querySelectorAll('a')).forEach(link => {
        const text = link.textContent?.trim() || '';
        const href = link.getAttribute('href') || '';
        if (text && href && !href.startsWith('javascript:')) {
          link.outerHTML = `[${text}](${href})`;
        } else if (text) {
          link.outerHTML = text;
        } else {
          link.remove();
        }
      });
      
      // 转换列表
      Array.from(clonedNode.querySelectorAll('ul, ol')).forEach(list => {
        const isOrdered = list.tagName.toLowerCase() === 'ol';
        const listItems = Array.from(list.querySelectorAll('li')).filter(li => li.textContent?.trim());
        
        if (listItems.length === 0) {
          list.remove();
          return;
        }
        
        let markdown = '\n\n';
        listItems.forEach((item, index) => {
          const text = item.textContent?.trim() || '';
          if (text) {
            markdown += isOrdered ? `${index + 1}. ${text}\n` : `- ${text}\n`;
          }
        });
        markdown += '\n';
        
        list.outerHTML = markdown;
      });
      
      // 处理图片 - 增强的图片处理
      Array.from(clonedNode.querySelectorAll('img')).forEach(img => {
        const alt = img.getAttribute('alt') || '';
        let src = img.getAttribute('src') || '';
        const title = img.getAttribute('title') || '';
        
        // 跳过微小图片和图标
        const width = img.getAttribute('width');
        const height = img.getAttribute('height');
        if ((width && parseInt(width) < 30) || (height && parseInt(height) < 30)) {
          img.remove();
          return;
        }
        
        // 检查是否为有效图片URL
        if (!src || src.startsWith('data:image/') || src.includes('blank.gif') || src.includes('spacer.gif')) {
          // 检查是否有懒加载的实际URL
          const lazySrc = img.getAttribute('data-src') || img.getAttribute('data-original') || 
                         img.getAttribute('data-lazy-src') || img.getAttribute('data-lazyload');
          if (lazySrc) {
            src = lazySrc;
          } else {
            img.remove();
            return;
          }
        }
        
        // 构建Markdown图片
        const titleText = title ? ` "${title}"` : '';
        img.outerHTML = `\n\n![${alt}](${src}${titleText})\n\n`;
      });
      
      // 处理视频
      Array.from(clonedNode.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="bilibili"]')).forEach(video => {
        let videoUrl = '';
        
        if (video.tagName === 'VIDEO') {
          const source = video.querySelector('source');
          if (source) {
            videoUrl = source.getAttribute('src') || '';
          } else {
            videoUrl = video.getAttribute('src') || '';
          }
        } else if (video.tagName === 'IFRAME') {
          videoUrl = video.getAttribute('src') || '';
        }
        
        if (videoUrl) {
          // 在Markdown中标记视频链接
          video.outerHTML = `\n\n🎬 视频: [观看视频](${videoUrl})\n\n`;
        } else {
          video.remove();
        }
      });
      
      // 转换代码块
      Array.from(clonedNode.querySelectorAll('pre, code')).forEach(codeBlock => {
        const text = codeBlock.textContent?.trim() || '';
        if (text) {
          codeBlock.outerHTML = '\n\n```\n' + text + '\n```\n\n';
        } else {
          codeBlock.remove();
        }
      });
      
      // 转换粗体和斜体
      Array.from(clonedNode.querySelectorAll('strong, b')).forEach(bold => {
        const text = bold.textContent?.trim() || '';
        if (text) {
          bold.outerHTML = '**' + text + '**';
        } else {
          bold.remove();
        }
      });
      
      Array.from(clonedNode.querySelectorAll('em, i')).forEach(italic => {
        const text = italic.textContent?.trim() || '';
        if (text) {
          italic.outerHTML = '*' + text + '*';
        } else {
          italic.remove();
        }
      });
      
      // 处理表格 (可选，保留结构化数据)
      Array.from(clonedNode.querySelectorAll('table')).forEach(table => {
        // 检查表格是否为空
        const cells = table.querySelectorAll('td, th');
        if (cells.length === 0 || Array.from(cells).every(cell => !cell.textContent?.trim())) {
          table.remove();
          return;
        }
        
        let markdown = '\n\n';
        
        // 表头
        const headerRows = Array.from(table.querySelectorAll('thead tr'));
        if (headerRows.length > 0) {
          const headerCells = Array.from(headerRows[0].querySelectorAll('th'));
          if (headerCells.length > 0) {
            markdown += '| ' + headerCells.map(cell => cell.textContent?.trim() || '').join(' | ') + ' |\n';
            markdown += '| ' + headerCells.map(() => '---').join(' | ') + ' |\n';
          }
        }
        
        // 表格内容
        const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
        bodyRows.forEach(row => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length > 0) {
            // 处理单元格内容，将换行符替换为 <br>
            markdown += '| ' + cells.map(cell => {
              const text = cell.textContent?.trim() || '';
              // 将换行符替换为 HTML 的 br 标签
              return text.replace(/\n/g, '<br>');
            }).join(' | ') + ' |\n';
          }
        });
        
        table.outerHTML = markdown + '\n\n';
      });
      
      // 处理引用块
      Array.from(clonedNode.querySelectorAll('blockquote')).forEach(quote => {
        const text = quote.textContent?.trim() || '';
        if (text) {
          // 将引用文本的每一行前面加上 >
          const quotedText = text.split('\n').map(line => `> ${line}`).join('\n');
          quote.outerHTML = '\n\n' + quotedText + '\n\n';
        } else {
          quote.remove();
        }
      });
      
      // 处理水平线
      Array.from(clonedNode.querySelectorAll('hr')).forEach(hr => {
        hr.outerHTML = '\n\n---\n\n';
      });
      
      // 最终清理
      let markdown = clonedNode.textContent || '';
      
      // 移除多余空行
      markdown = markdown.replace(/\n{3,}/g, '\n\n');
      
      // 移除多余空格
      markdown = markdown.replace(/[ \t]+/g, ' ');
      
      // 确保开头和结尾不包含多余空白
      markdown = markdown.trim();
      
      // 美化Markdown格式
      markdown = beautifyMarkdown(markdown);
      
      // 额外清理步骤，删除华为云文档特有的冗余信息
      markdown = cleanupHuaweiDocMarkdown(markdown);
      
      return markdown;
    }
    
    // 美化Markdown格式，增强可读性
    function beautifyMarkdown(markdown: string): string {
      // 确保标题前后有空行
      markdown = markdown.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2');
      markdown = markdown.replace(/(#{1,6} .+)\n([^\n])/g, '$1\n\n$2');
      
      // 确保列表项之间没有多余空行
      markdown = markdown.replace(/(\n- [^\n]+)\n\n(- )/g, '$1\n$2');
      markdown = markdown.replace(/(\n\d+\. [^\n]+)\n\n(\d+\. )/g, '$1\n$2');
      
      // 确保段落之间有空行
      markdown = markdown.replace(/([^\n])\n([^\n#\-\d\*\>\[\!\|])/g, '$1\n\n$2');
      
      return markdown;
    }
    
    // 清理华为云文档特有的冗余信息
    function cleanupHuaweiDocMarkdown(markdown: string): string {
      // 移除"链接复制成功"、"分享"、"微博"、"微信"等无关信息
      const patterns = [
        /链接复制成功！/g,
        /分享\s*文档到微博/g,
        /微博/g,
        /微信/g,
        /复制链接/g,
        /复制链接到剪贴板/g,
        /到剪贴板/g,
        /分享/g,
        /\[查看PDF\]\([^)]+\)/g,
        /\s*父主题：.+/g,
        /【英文版】/g,
        /更新时间：\d{4}-\d{2}-\d{2} GMT\+\d{2}:\d{2}\s*/g,
        /链接复制成功/g,
        /复制成功/g,
        /查看PDF/g,
        /i><span>.*?<\/span>/g, // 移除一些包含span的导航提示
        /本文导读/g
      ];
      
      let cleanedMarkdown = markdown;
      patterns.forEach(pattern => {
        cleanedMarkdown = cleanedMarkdown.replace(pattern, '');
      });
      
      // 处理连续的空行和空格行
      cleanedMarkdown = cleanedMarkdown.replace(/\n{3,}/g, '\n\n');
      cleanedMarkdown = cleanedMarkdown.replace(/\n\s+\n/g, '\n\n');
      
      // 移除连续的破折号或符号行
      cleanedMarkdown = cleanedMarkdown.replace(/(\n-\s*){2,}/g, '\n');
      cleanedMarkdown = cleanedMarkdown.replace(/\n-\s*\n-\s*\n-\s*\n/g, '\n');
      cleanedMarkdown = cleanedMarkdown.replace(/\n-\s*\n-\s*\n/g, '\n');
      
      // 处理代码块和JSON格式内容，保持其格式不变
      const codeBlocks: string[] = [];
      const codeBlockRegex = /```[\s\S]*?```/g;
      let match;
      let index = 0;
      
      // 提取并保存代码块
      while ((match = codeBlockRegex.exec(cleanedMarkdown)) !== null) {
        codeBlocks.push(match[0]);
        cleanedMarkdown = cleanedMarkdown.replace(match[0], `__CODE_BLOCK_${index}__`);
        index++;
      }
      
      // 移除行首行尾多余空格（除了代码块占位符）
      cleanedMarkdown = cleanedMarkdown.split('\n')
        .map(line => {
          if (line.trim().startsWith('__CODE_BLOCK_')) {
            return line; // 不处理代码块占位符
          }
          return line.trim();
        })
        .join('\n');
      
      // 恢复代码块
      for (let i = 0; i < codeBlocks.length; i++) {
        cleanedMarkdown = cleanedMarkdown.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
      }
      
      // 清理标题后的常见无用内容
      cleanedMarkdown = cleanedMarkdown.replace(/(#+ .*?)\n+(-\s*)+\n+/g, '$1\n\n');
      
      // 移除包括数字和图标符号的特殊行
      cleanedMarkdown = cleanedMarkdown.replace(/\n\d+\.\s*$/gm, '');
      
      // 特殊处理表格中的标题
      cleanedMarkdown = cleanedMarkdown.replace(/表\d+\s+(.+?)\n\n/g, '表：$1\n\n');
      
      // 特殊处理华为云文档中的列表项，确保格式正确
      cleanedMarkdown = cleanedMarkdown.replace(/^- (.*)/gm, '- $1');
      
      // 在保留h4之类小标题的情况下去除额外空行
      cleanedMarkdown = cleanedMarkdown.replace(/\n\n(####.*)\n\n/g, '\n\n$1\n');
      
      // 处理更新时间格式
      cleanedMarkdown = cleanedMarkdown.replace(/(# .*)\n+更新时间：.*?\n+/g, '$1\n\n');
      
      // 确保标题下的空行不过多
      cleanedMarkdown = cleanedMarkdown.replace(/(#+ .*)\n\n\n/g, '$1\n\n');
      
      // 移除标题后只有破折号的行
      cleanedMarkdown = cleanedMarkdown.replace(/(#+ .*)\n\n-\s*$/gm, '$1\n\n');
      cleanedMarkdown = cleanedMarkdown.replace(/(#+ .*)\n\n-\s*\n\n/g, '$1\n\n');
      
      // 移除复制图标相关文本
      cleanedMarkdown = cleanedMarkdown.replace(/copy-icon\d+/g, '');
      cleanedMarkdown = cleanedMarkdown.replace(/copy-section-icon/g, '');
      cleanedMarkdown = cleanedMarkdown.replace(/data-clipboard-text.+/g, '');
      
      // 最后移除文档开头可能存在的大量空白
      cleanedMarkdown = cleanedMarkdown.replace(/^\s+/, '');
      
      return cleanedMarkdown;
    }
    
    // 查找主要内容区域
    const contentSelectors = [
      '.articleBoxWithoutHead', // 添加华为云特定的主内容区域选择器
      'article', 
      '.article', 
      '.post', 
      '.content',
      '.article-content',
      '.post-content',
      '.entry-content',
      '.main-content',
      '.help-content',
      '.text-content',
      '.doc-content',
      'main',
      '.content-container',
      '#content',
      'body'
    ];
    
    let mainElement: Element | null = null;
    
    // 尝试找到主要内容元素
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        // 检查内容长度，避免选择太短的内容区域
        const textLength = element.textContent?.trim().length || 0;
        if (textLength > 100) {
          mainElement = element;
          console.log(`找到内容区域: ${selector}, 内容长度: ${textLength}`);
                break;
              }
            }
    }
    
    // 如果没有找到合适的内容区域，使用body元素
    if (!mainElement) {
      mainElement = document.body;
    }
    
    // 获取原始HTML
    const htmlContent = mainElement.innerHTML || '';
    
    // 转换为Markdown
    const markdownContent = convertHtmlToMarkdown(mainElement);
    
    return { htmlContent, markdownContent };
  });
}

const MAX_RETRIES = 3;
const BASE_TIMEOUT = 60000; // 60秒
const RETRY_DELAY = 3000; // 3秒

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

// 检查监控项状态的函数
async function checkMonitoringStatus(itemId: string, checkIsMonitoring: boolean = true): Promise<boolean> {
  try {
    const item = await db.getMonitoringItemById(itemId);
    if (!item) {
      return false;
    }
    // 只在需要时检查 is_monitoring 状态
    return checkIsMonitoring ? item.is_monitoring === true : true;
  } catch (error) {
    console.error('检查监控项状态时出错:', error);
    return false;
  }
}

// 修改 findModule 函数，处理非 javascript: 伪链接的一级菜单项
async function findModule(page: any, module: string): Promise<{ moduleFound: boolean; moduleText: string; moduleLink: string; moduleContent?: string }> {
  const level1Results = await page.evaluate(({ targetModule }: { targetModule: string }) => {
    const level1Items = document.querySelectorAll('li.nav-item.level1');
    
    for (const item of level1Items) {
      const link = item.querySelector('a.js-title');
      if (!link) continue;
      
      const text = link.textContent?.trim() || '';
      
      if (text === targetModule) {
        const href = link.getAttribute('href') || '';
        const pHref = link.getAttribute('p-href') || '';
        const finalHref = pHref || href;
        
        // 检查是否为非 javascript: 链接
        const isValidLink = finalHref && !finalHref.startsWith('javascript:');
        
        return [{
          text,
          href: isValidLink ? finalHref : '',
          isValidLink
        }];
      }
    }
    return [];
  }, { targetModule: module });

  if (level1Results && level1Results.length > 0) {
    const firstMatch = level1Results[0];
    console.log(`找到一级菜单项: ${firstMatch.text}${firstMatch.isValidLink ? `, 链接: ${firstMatch.href}` : ''}`);
    
    // 如果是有效链接，访问链接并提取内容
    let moduleContent = undefined;
    if (firstMatch.isValidLink && firstMatch.href) {
      try {
        // 使用传入的 page 的 context 创建新页面
        const context = page.context();
        const modulePage = await context.newPage();
        
        // 如果是相对链接，转为绝对链接
        let fullUrl = firstMatch.href;
        if (!fullUrl.startsWith('http')) {
          const currentUrl = page.url();
          const baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
          fullUrl = new URL(fullUrl, baseUrl).href;
        }

        // 加载页面
        console.log(`正在访问模块链接: ${fullUrl}`);
        const loaded = await loadPageWithFallback(modulePage, fullUrl);
        
        if (loaded) {
          // 提取内容
          const { markdownContent } = await extractContentAsMarkdown(modulePage);
          moduleContent = markdownContent;
          console.log(`成功提取模块页面内容，内容长度: ${moduleContent?.length || 0}`);
        }

        // 关闭页面
        await modulePage.close();
      } catch (error) {
        console.error(`访问模块链接失败:`, error);
      }
    }

    return {
      moduleFound: true,
      moduleText: firstMatch.text,
      moduleLink: firstMatch.href, // 如果是有效链接则返回链接，否则返回空字符串
      moduleContent // 如果成功提取到内容则返回内容，否则为 undefined
    };
  }

  console.log(`未找到一级菜单项: ${module}`);
  return {
    moduleFound: false,
    moduleText: '',
    moduleLink: ''
  };
}

// 修改 processSubmenus 函数
async function processSubmenus(
  page: any,
  module: string,
  moduleText: string,
  item: MonitoringItem,
  details: MonitoringDetail[],
  rank: number,
  context: any
): Promise<{ currentRank: number; stopped: boolean }> {
  const subMenuLinks = await page.evaluate((targetModule: string) => {
    // 找到目标一级菜单项
    const level1Items = document.querySelectorAll('li.nav-item.level1');
    const targetNavItem = Array.from(level1Items).find(item => {
      const link = item.querySelector('a.js-title');
      return link?.textContent?.trim() === targetModule;
    });

    if (!targetNavItem) {
      console.log(`未找到一级菜单项: ${targetModule}`);
      return [];
    }

    // 递归函数：获取所有子菜单项
    function getMenuItemsWithPath(element: Element, parentPath: string[] = []): Array<{
      text: string;
      href: string;
      level: number;
      path: string[];
    }> {
      const results = [];
      
      // 获取当前元素下的所有子菜单列表
      const subLists = element.querySelectorAll(':scope > ul[level]');
      
      for (const subList of subLists) {
        const level = parseInt(subList.getAttribute('level') || '0');
        const items = subList.querySelectorAll(':scope > li.nav-item');
        
        for (const item of items) {
          const link = item.querySelector('a.js-title');
          if (!link) continue;
          
          const text = link.textContent?.trim() || '';
          const href = link.getAttribute('p-href') || link.getAttribute('href') || '';
          
          if (text && href && !href.startsWith('javascript:')) {
            const currentPath = [...parentPath];
            currentPath.push(text);
            
            results.push({
              text,
              href,
              level,
              path: currentPath
            });
            
            // 递归处理子菜单
            results.push(...getMenuItemsWithPath(item, currentPath));
          }
        }
      }
      
      return results;
    }
    
    // 获取所有子菜单项
    return getMenuItemsWithPath(targetNavItem);
  }, module);

  let currentRank = rank;

  if (!subMenuLinks || subMenuLinks.length === 0) {
    console.log(`未找到子菜单: ${moduleText}`);
    return { currentRank, stopped: false };
  }

  console.log(`找到 ${subMenuLinks.length} 个子菜单，开始处理...`);

  // 处理每个子菜单
  for (const link of subMenuLinks) {
    // 每处理一个子菜单前检查监控状态
    if (!await checkMonitoringStatus(item.id)) {
      console.log('监控已停止，正在清理资源...');
      return { currentRank, stopped: true };
    }

    try {
      const fullPath = [moduleText, ...link.path].join(' > ');
      console.log(`正在爬取: ${fullPath}`);

      const subPage = await context.newPage();
      
      let fullUrl = link.href;
      if (!fullUrl.startsWith('http')) {
        const currentUrl = page.url();
        const baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
        fullUrl = new URL(fullUrl, baseUrl).href;
      }

      // 加载页面前再次检查状态
      if (!await checkMonitoringStatus(item.id)) {
        await subPage.close();
        return { currentRank, stopped: true };
      }

      await loadPageWithFallback(subPage, fullUrl);

      // 提取内容前再次检查状态
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
      const fullPath = [moduleText, ...link.path].join(' > ');
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

// 添加执行锁
const executionLocks = new Map<string, boolean>();
const executionQueue: string[] = []; // 添加执行队列

// 添加获取执行锁的函数
async function acquireExecutionLock(itemId: string): Promise<boolean> {
  if (executionLocks.get(itemId)) {
    // 如果已经在执行中，将任务添加到队列
    if (!executionQueue.includes(itemId)) {
      executionQueue.push(itemId);
    }
    return false;
  }
  
  executionLocks.set(itemId, true);
  return true;
}

// 添加释放执行锁的函数
async function releaseExecutionLock(itemId: string): Promise<void> {
  executionLocks.set(itemId, false);
  
  // 检查队列中是否有等待的任务
  const index = executionQueue.indexOf(itemId);
  if (index > -1) {
    executionQueue.splice(index, 1);
  }
}

// 清理历史监控记录，只保留最新的5条记录
async function cleanupHistoryRecords(itemId: string): Promise<void> {
  try {
    // 获取该监控项的所有记录，按创建时间降序排序
    const { data: records, error } = await supabase
      .from('monitoring_records')
      .select('id')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('获取监控记录失败:', error);
      return;
    }

    // 如果有记录
    if (records && records.length > 0) {
      // 保留最新的5条记录，删除多余的记录
      const recordsToKeep = records.slice(0, 5);
      const recordsToDelete = records.slice(5);

      // 更新保留记录的rank值（1-5）
      for (let i = 0; i < recordsToKeep.length; i++) {
        const { error: updateError } = await supabase
          .from('monitoring_records')
          .update({ rank: i + 1 })
          .eq('id', recordsToKeep[i].id);

        if (updateError) {
          console.error(`更新记录 ${recordsToKeep[i].id} 的rank值失败:`, updateError);
        }
      }
      
      // 删除多余的记录
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
 * 优化的页面加载函数
 * @param page - Puppeteer 页面实例
 * @param url - 要加载的URL
 * @param options - 加载选项
 * @returns 是否成功加载页面
 */
async function loadPageWithFallback(page: any, url: string, options = {}) {
  // 检查 URL 是否有效
  if (!url || url === 'javascript:' || !url.startsWith('http')) {
    console.log(`跳过无效URL: ${url}`);
    return false;
  }

  try {
    // 首先尝试使用 domcontentloaded
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: BASE_TIMEOUT 
    });

    try {
      // 尝试等待主要内容加载，但设置较短的超时
      await Promise.race([
        page.waitForSelector('.main-content', { timeout: 10000 }),
        page.waitForSelector('.help-content', { timeout: 10000 }),
        page.waitForSelector('.content', { timeout: 10000 }),
        page.waitForSelector('article', { timeout: 10000 })
      ]);
    } catch (selectorError) {
      console.log('内容选择器等待超时，继续处理');
    }

    // 给页面一个短暂的额外时间加载
    await page.waitForTimeout(2000);
    return true;
  } catch (error) {
    console.error(`页面加载失败: ${error}`);
    return false;
  }
}

/**
 * 抓取华为云产品文档
 * @param item 监控项
 * @returns 监控结果，包含记录和详情
 */
const scrapeHuaweiCloud = async (item: MonitoringItem): Promise<{
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
    
    // 访问页面前检查状态
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
    await loadPageWithFallback(page, item.url);
    
    const pageTitle = await page.title();
    console.log(`已进入文档: ${pageTitle}`);
    
    if (!item.modules || item.modules.length === 0) {
      // 提取内容前检查状态
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
        // 处理每个模块前检查状态
        if (!await checkMonitoringStatus(item.id)) {
          monitoringStopped = true;
          break;
        }

        console.log(`\n开始处理模块: ${module}`);
        
        const { moduleFound, moduleText, moduleLink, moduleContent } = await findModule(page, module);
        
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

          // 处理子菜单前检查状态
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
    console.error('华为云抓取错误:', error);
    
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
    // 确保资源被正确清理
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

export default scrapeHuaweiCloud;