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
        '.header:not(.aliyun-docs-view-header)', '.footer', '.ad', '.advertisement', '.breadcrumb',
        '.sidebar:not(.content-sidebar)', '.comment', '.cookie', '.popup',
        // 添加阿里云文档特有的不需要元素
        '.flex', '.help-iconfont', '.help-icon', '.help-menu-scroll-container', 
        '.icon', '.sidebar-container', '.copy-code-btn',
        '.aliyun-docs-side', '.aliyun-docs-pagination',
        '.FeedbackButton--feedbackContainer--v2ywOOX',
        '.RecommendDoc--container--IhRK6Om',
        '.Contact--contactButton--TBwTX5R',
        '.Header--right--l4TSW1E'
      ];
      
      removeSelectors.forEach(selector => {
        clonedNode.querySelectorAll(selector).forEach(el => {
          el.remove();
        });
      });

      // 特殊处理阿里云文档的内容区域
      const mainContent = clonedNode.querySelector('.markdown-body, .icms-help-docs-content');
      if (mainContent) {
        clonedNode.innerHTML = mainContent.innerHTML;
      }
      
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
      
      // 处理图片
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
      
      // 处理表格
      Array.from(clonedNode.querySelectorAll('table')).forEach(table => {
        // 检查表格是否为空
        const cells = table.querySelectorAll('td, th');
        if (cells.length === 0 || Array.from(cells).every(cell => !cell.textContent?.trim())) {
          table.remove();
          return;
        }
        
        // 跳过隐藏的固定表头表格
        if (table.closest('.fixed-table') || table.style.visibility === 'hidden') {
          table.remove();
          return;
        }
        
        let markdown = '\n\n';
        
        // 获取表格标题（如果有的话）
        const tableTitle = table.previousElementSibling?.textContent?.trim();
        if (tableTitle) {
          markdown += tableTitle + '\n\n';
        }

        // 获取所有行，包括表头和内容
        const allRows = Array.from(table.querySelectorAll('tr'));
        
        // 检测重复的表头行
        let headerRowIndex = 0;
        let contentStartIndex = 1;
        
        // 如果存在两行以上且第一行和第二行内容相似，则跳过第一行
        if (allRows.length >= 2) {
          const firstRowText = allRows[0].textContent?.trim().replace(/\s+/g, ' ') || '';
          const secondRowText = allRows[1].textContent?.trim().replace(/\s+/g, ' ') || '';
          
          // 比较两行文本的相似度
          if (firstRowText === secondRowText || 
              (firstRowText.length > 0 && secondRowText.length > 0 && 
               (firstRowText.includes(secondRowText) || secondRowText.includes(firstRowText)))) {
            headerRowIndex = 1; // 使用第二行作为表头
            contentStartIndex = 2; // 内容从第三行开始
          }
        }
        
        // 确定表头行
        const headerRow = allRows[headerRowIndex];
        if (headerRow) {
          const headerCells = Array.from(headerRow.querySelectorAll('td, th'));
          if (headerCells.length > 0) {
            // 处理表头单元格
            const headers = headerCells.map(cell => {
              let text = '';
              // 处理加粗文本
              const boldText = cell.querySelector('b, strong');
              if (boldText) {
                text = boldText.textContent?.trim() || '';
              } else {
                text = cell.textContent?.trim() || '';
              }
              // 移除多余的空白和换行
              text = text.replace(/\s+/g, ' ');
              // 处理特殊字符
              text = text.replace(/\|/g, '\\|');
              return text || ' ';
            });
            
            // 添加表头行
            markdown += '| ' + headers.join(' | ') + ' |\n';
            // 添加分隔行
            markdown += '|' + headers.map(() => ' --- ').join('|') + '|\n';
          }
        }
        
        // 处理表格内容行（从contentStartIndex开始）
        const contentRows = allRows.slice(contentStartIndex);
        contentRows.forEach(row => {
          const cells = Array.from(row.querySelectorAll('td, th'));
          if (cells.length > 0) {
            // 处理每个单元格的内容
            const cellContents = cells.map(cell => {
              let text = '';
              
              // 处理单元格中的链接
              const links = Array.from(cell.querySelectorAll('a'));
              if (links.length > 0) {
                text = links.map(link => {
                  const linkText = link.textContent?.trim() || '';
                  const href = link.getAttribute('href') || '';
                  if (linkText && href && !href.startsWith('javascript:')) {
                    return `[${linkText}](${href})`;
                  }
                  return linkText;
                }).join(' ');
              }
              
              // 如果没有链接，获取普通文本内容
              if (!text) {
                // 处理带有空格的特殊文本
                const spans = Array.from(cell.querySelectorAll('.help-letter-space'));
                if (spans.length > 0) {
                  text = cell.textContent?.trim().replace(/\s+/g, ' ') || '';
                } else {
                  text = cell.textContent?.trim() || '';
                }
              }
              
              // 处理列表项
              const listItems = Array.from(cell.querySelectorAll('li'));
              if (listItems.length > 0) {
                text = listItems.map(item => item.textContent?.trim()).join('\\n- ');
                if (text) {
                  text = '- ' + text;
                }
              }
              
              // 清理文本
              text = text.trim();
              text = text.replace(/\s+/g, ' ');
              text = text.replace(/\|/g, '\\|');
              // 保留列表格式的换行，但替换其他换行
              if (!text.includes('\\n')) {
                text = text.replace(/\n/g, ' ');
              }
              
              return text || ' ';
            });
            
            markdown += '| ' + cellContents.join(' | ') + ' |\n';
          }
        });
        
        table.outerHTML = markdown + '\n';
      });
      
      // 处理提示框
      Array.from(clonedNode.querySelectorAll('.note')).forEach(note => {
        const noteType = note.classList.contains('note-important') ? '重要' :
                        note.classList.contains('note-warning') ? '警告' : '说明';
        const noteContent = note.querySelector('.noteContentSpan')?.textContent?.trim() || '';
        if (noteContent) {
          note.outerHTML = `\n\n> **${noteType}：** ${noteContent}\n\n`;
        } else {
          note.remove();
        }
      });
      
      // 处理代码块
      Array.from(clonedNode.querySelectorAll('pre, code')).forEach(codeBlock => {
        const text = codeBlock.textContent?.trim() || '';
        if (text) {
          codeBlock.outerHTML = '\n\n```\n' + text + '\n```\n\n';
        } else {
          codeBlock.remove();
        }
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
      
      // 额外清理步骤，删除阿里云文档特有的冗余信息
      markdown = cleanupAlibabaDocMarkdown(markdown);
      
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
    
    // 清理阿里云文档特有的冗余信息
    function cleanupAlibabaDocMarkdown(markdown: string): string {
      // 移除一些阿里云特有的无用文本
      const patterns = [
        /复制成功/g,
        /复制/g,
        /更新时间：\d{4}-\d{2}-\d{2}/g,
        /\d+人点赞/g,
        /\d+次阅读/g,
        /点赞/g,
        /提交反馈/g,
        /目录/g,
        /下一页/g,
        /上一页/g,
        /回到顶部/g,
        /收藏/g,
        /版权所有/g,
        /该文章对您有帮助吗？/g,
        /反馈/g
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
      
      // 确保标题下的空行不过多
      cleanedMarkdown = cleanedMarkdown.replace(/(#+ .*)\n\n\n/g, '$1\n\n');
      
      // 最后移除文档开头可能存在的大量空白
      cleanedMarkdown = cleanedMarkdown.replace(/^\s+/, '');
      
      return cleanedMarkdown;
    }
    
    // 查找主要内容区域，阿里云特定
    const mainElement = document.querySelector('.markdown-body, .icms-help-docs-content') || document.body;
    
    // 获取原始HTML
    const htmlContent = mainElement.innerHTML || '';
    
    // 转换为Markdown
    const markdownContent = convertHtmlToMarkdown(mainElement);
    
    return { htmlContent, markdownContent };
  });
}

// 定义常量和辅助函数
const MAX_RETRIES = 3;
const BASE_TIMEOUT = 60000; // 60秒
const RETRY_DELAY = 3000; // 3秒

// 优化的页面加载函数
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
        page.waitForSelector('.help-content', { timeout: 10000 }),
        page.waitForSelector('.custom-html-content', { timeout: 10000 }),
        page.waitForSelector('.content-wrapper', { timeout: 10000 }),
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

// 检查监控项状态的函数
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

// 查找阿里云中的模块
async function findModule(page: any, module: string): Promise<{ moduleFound: boolean; moduleText: string; moduleLink: string; moduleContent?: string }> {
  // 先尝试展开所有一级菜单，确保所有一级菜单项可见
  await page.evaluate(() => {
    // 查找所有折叠的一级菜单项
    const collapsedMenus = document.querySelectorAll('.Menu--level1--UN3zYr3:not(.Menu--open--eaGlqyq)');
    // 模拟点击展开所有折叠的一级菜单
    collapsedMenus.forEach(menu => {
      const clickableEl = menu.querySelector('a');
      if (clickableEl) {
        clickableEl.click();
      }
    });
  });
  
  // 等待菜单展开动画完成
  await page.waitForTimeout(1000);
  
  const moduleResults = await page.evaluate(({ targetModule }: { targetModule: string }) => {
    // 只查找一级菜单项
    const menuItems = Array.from(document.querySelectorAll('.Menu--level1--UN3zYr3'));
    
    for (const item of menuItems) {
      const link = item.querySelector('a');
      if (!link) continue;
      
      const text = link.textContent?.trim() || '';
      
      if (text === targetModule || text.includes(targetModule)) {
        const href = link.getAttribute('href') || '';
        const isValidLink = href && !href.startsWith('javascript:');
        
        return [{
          text,
          href: isValidLink ? href : '',
          isValidLink,
          itemId: item.id || ''
        }];
      }
    }
    
    // 如果在一级菜单中没有找到，尝试在帮助菜单中查找一级项
    const helpMenuItems = document.querySelectorAll('.help-menu-scroll-container > ul > li > a');
    
    for (const link of helpMenuItems) {
      const text = link.textContent?.trim() || '';
      
      if (text === targetModule || text.includes(targetModule)) {
        const href = link.getAttribute('href') || '';
        const isValidLink = href && !href.startsWith('javascript:');
        
        return [{
          text,
          href: isValidLink ? href : '',
          isValidLink,
          itemId: link.id || ''
        }];
      }
    }
    
    return [];
  }, { targetModule: module });

  if (moduleResults && moduleResults.length > 0) {
    const firstMatch = moduleResults[0];
    console.log(`找到一级菜单项: ${firstMatch.text}${firstMatch.isValidLink ? `, 链接: ${firstMatch.href}` : ''}`);
    
    // 如果有菜单项ID，确保该菜单项展开
    if (firstMatch.itemId) {
      await page.evaluate((itemId: string) => {
        const menuItem = document.getElementById(itemId);
        if (menuItem) {
          // 确保菜单展开
          const menuParent = menuItem.closest('.Menu--level1--UN3zYr3:not(.Menu--open--eaGlqyq)');
          if (menuParent) {
            const clickableEl = menuParent.querySelector('a');
            if (clickableEl) {
              clickableEl.click();
            }
          }
        }
      }, firstMatch.itemId);
      
      // 等待菜单展开动画完成
      await page.waitForTimeout(1000);
    }
    
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
        console.log(`正在访问一级菜单链接: ${fullUrl}`);
        const loaded = await loadPageWithFallback(modulePage, fullUrl);
        
        if (loaded) {
          // 提取内容
          const { markdownContent } = await extractContentAsMarkdown(modulePage);
          moduleContent = markdownContent;
          console.log(`成功提取一级菜单页面内容，内容长度: ${moduleContent?.length || 0}`);
        }

        // 关闭页面
        await modulePage.close();
      } catch (error) {
        console.error(`访问一级菜单链接失败:`, error);
      }
    }

    return {
      moduleFound: true,
      moduleText: firstMatch.text,
      moduleLink: firstMatch.href,
      moduleContent
    };
  }

  console.log(`未找到一级菜单项: ${module}`);
  return {
    moduleFound: false,
    moduleText: '',
    moduleLink: ''
  };
}

// 处理子菜单函数
async function processSubmenus(
  page: any,
  module: string,
  moduleText: string,
  item: MonitoringItem,
  details: MonitoringDetail[],
  rank: number,
  context: any
): Promise<number> {
  // 确保所有菜单都展开
  await page.evaluate(() => {
    function expandAllMenus(element = document) {
      // 查找所有折叠的菜单项（包括所有层级）
      const collapsedMenus = element.querySelectorAll([
        '.Menu--level1--UN3zYr3:not(.Menu--open--eaGlqyq)',
        '.Menu--level2--O_pVFkb:not(.Menu--open--eaGlqyq)',
        '.Menu--level3--kTyQhnG:not(.Menu--open--eaGlqyq)',
        '.Menu--level4--mdaQTmY:not(.Menu--open--eaGlqyq)',
        '.Menu--level5--MdFkTMS:not(.Menu--open--eaGlqyq)',
        '.Menu--level6--w4e_9ka:not(.Menu--open--eaGlqyq)'
      ].join(','));
      
      // 模拟点击展开所有折叠的菜单
      collapsedMenus.forEach(menu => {
        const clickableEl = menu.querySelector('a');
        if (clickableEl) {
          clickableEl.click();
        }
      });
    }
    
    // 初始展开所有菜单
    expandAllMenus();
    
    // 等待一小段时间后再次展开，以确保动态加载的菜单也被展开
    setTimeout(expandAllMenus, 500);
  });
  
  // 等待菜单展开动画完成
  await page.waitForTimeout(1500);
  
  // 获取所有层级的菜单链接
  const menuLinks = await page.evaluate((targetModule: string) => {
    // 基于阿里云的菜单结构，查找所有层级的菜单
    const menuContainer = document.querySelector('.help-menu-scroll-container');
    if (!menuContainer) return [];
    
    const submenuResults: Array<{text: string; href: string; path: string[]}> = [];
    
    // 递归获取所有层级的菜单项
    function getAllMenuItems(element: Element, currentPath: string[] = []) {
      // 获取当前菜单项的文本和链接
      const link = element.querySelector(':scope > a');
      if (link) {
        const text = link.textContent?.trim() || '';
        const href = link.getAttribute('href') || '';
        
        if (text && href && !href.startsWith('javascript:')) {
          const newPath = [...currentPath];
          if (text !== targetModule) { // 不包含目标模块本身
            newPath.push(text);
            submenuResults.push({
              text,
              href,
              path: newPath
            });
          }
        }
      }
      
      // 递归处理所有子菜单
      const subLists = element.querySelectorAll(':scope > ul > li');
      subLists.forEach(subItem => {
        // 获取当前项的文本作为路径的一部分
        const itemLink = subItem.querySelector(':scope > a');
        const itemText = itemLink?.textContent?.trim() || '';
        const newPath = [...currentPath];
        if (itemText && itemText !== targetModule) {
          newPath.push(itemText);
        }
        getAllMenuItems(subItem, newPath);
      });
    }
    
    // 找到目标模块所在的菜单项
    const menuItems = Array.from(document.querySelectorAll([
      '.Menu--level1--UN3zYr3',
      '.Menu--level2--O_pVFkb',
      '.Menu--level3--kTyQhnG',
      '.Menu--level4--mdaQTmY',
      '.Menu--level5--MdFkTMS',
      '.Menu--level6--w4e_9ka'
    ].join(',')));
    
    let targetMenuItem = null;
    
    for (const item of menuItems) {
      const text = item.textContent?.trim() || '';
      if (text.includes(targetModule)) {
        targetMenuItem = item;
        break;
      }
    }
    
    if (targetMenuItem) {
      // 从目标模块开始获取所有子菜单
      getAllMenuItems(targetMenuItem, [targetModule]);
    }
    
    return submenuResults;
  }, module);

  let currentRank = rank;

  if (!menuLinks || menuLinks.length === 0) {
    console.log(`未找到子菜单或已到达叶子节点: ${moduleText}`);
    return currentRank;
  }

  console.log(`找到 ${menuLinks.length} 个菜单项，开始处理...`);

  // 处理每个菜单链接
  for (const link of menuLinks) {
    // 每处理一个链接前检查监控状态
    if (!await checkMonitoringStatus(item.id)) {
      console.log('监控已停止，保存当前结果并退出');
      throw new Error('监控项已停止');
    }

    try {
      // 构建完整路径名
      const fullPath = link.path.join(' > ');
      console.log(`正在爬取: ${fullPath}`);

      // 创建新页面
      const subPage = await context.newPage();
      
      // 处理相对链接
      let fullUrl = link.href;
      if (!fullUrl.startsWith('http')) {
        const currentUrl = page.url();
        const baseUrl = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
        fullUrl = new URL(fullUrl, baseUrl).href;
      }

      // 加载页面
      await loadPageWithFallback(subPage, fullUrl);

      // 获取内容
      const { markdownContent } = await extractContentAsMarkdown(subPage);
      
      // 添加到监控详情
      details.push({
        item_id: item.id,
        rank: currentRank++,
        page: fullPath,
        link: fullUrl,
        old_content: "首次监测",
        new_content: markdownContent || "无内容",
        action: markdownContent && markdownContent !== "无内容" ? "内容变化" : "无变化"
      });
      
      // 关闭子页面
      await subPage.close();
    } catch (error) {
      console.error(`处理菜单项 ${link.text} 时出错:`, error);
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

  return currentRank;
}

// 执行锁管理
const executionLocks = new Map<string, boolean>();
const executionQueue: string[] = [];

// 获取执行锁的函数
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

// 释放执行锁的函数
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
 * 抓取阿里云产品文档
 * @param item 监控项
 * @returns 监控结果，包含记录和详情
 */
const scrapeAlibabaCloud = async (item: MonitoringItem): Promise<{
  record: MonitoringRecord;
  details: MonitoringDetail[];
}> => {
  // 尝试获取执行锁
  if (!await acquireExecutionLock(item.id)) {
    throw new Error('监控任务已在执行中');
  }

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext();
  const details: MonitoringDetail[] = [];
  let currentRank = 1;

  try {
    // 初始检查监控项状态
    if (!await checkMonitoringStatus(item.id)) {
      console.log('监控已停止，终止任务');
      throw new Error('监控项已停止');
    }

    const page = await context.newPage();
    
    console.log(`开始访问文档首页: ${item.url}`);
    await loadPageWithFallback(page, item.url);
    
    // 加载页面后再次检查状态
    if (!await checkMonitoringStatus(item.id)) {
      console.log('监控已停止，终止任务');
      throw new Error('监控项已停止');
    }
    
    const pageTitle = await page.title();
    console.log(`已进入文档: ${pageTitle}`);
    
    // 检查 modules 是否存在
    if (!item.modules || item.modules.length === 0) {
      // 爬取整个页面前检查状态
      if (!await checkMonitoringStatus(item.id)) {
        console.log('监控已停止，终止任务');
        throw new Error('监控项已停止');
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

    // 遍历用户选择的模块
    for (const module of item.modules) {
      try {
        // 每处理一个模块前检查监控状态
        if (!await checkMonitoringStatus(item.id)) {
          console.log(`监控已停止，保存当前进度并退出`);
          throw new Error('监控项已停止');
        }

        console.log(`\n开始处理模块: ${module}`);
        
        const { moduleFound, moduleText, moduleLink, moduleContent } = await findModule(page, module);
        
        if (moduleFound) {
          // 处理模块内容前再次检查状态
          if (!await checkMonitoringStatus(item.id)) {
            console.log('监控已停止，保存当前进度并退出');
            throw new Error('监控项已停止');
          }

          try {
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

            // 处理子菜单前再次检查状态
            if (!await checkMonitoringStatus(item.id)) {
              console.log('监控已停止，保存当前进度并退出');
              throw new Error('监控项已停止');
            }

            currentRank = await processSubmenus(page, module, moduleText, item, details, currentRank, context);
          } catch (moduleProcessError) {
            if (moduleProcessError instanceof Error && 
                moduleProcessError.message === '监控项已停止') {
              // 如果是停止监控导致的错误，保存当前进度
              const now = new Date();
              const record: MonitoringRecord = {
                id: now.getTime().toString(),
                item_id: item.id,
                rank: 1,
                date: now.toISOString().split('T')[0],
                status: "监测中断",
                summary: `监控已停止，已处理 ${details.length} 个页面`
              };
              
              await cleanupHistoryRecords(item.id);
              return { record, details };
            }
            throw moduleProcessError;
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
        if (moduleError instanceof Error && 
            moduleError.message === '监控项已停止') {
          throw moduleError;
        }
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
    
    console.log(`\n爬取完成，共发现 ${details.length} 个页面`);
    
    const now = new Date();
    const record: MonitoringRecord = {
      id: now.getTime().toString(),
      item_id: item.id,
      rank: 1,
      date: now.toISOString().split('T')[0],
      status: details.length > 0 ? "监测成功" : "监测失败",
      summary: details.length > 0 ? `首次监测，发现 ${details.length} 个页面` : "没有发现任何页面"
    };
    
    await cleanupHistoryRecords(item.id);
    return { record, details };
  } catch (error) {
    console.error('阿里云抓取错误:', error);
    
    const now = new Date();
    const record: MonitoringRecord = {
      id: now.getTime().toString(),
      item_id: item.id,
      rank: 1,
      date: now.toISOString().split('T')[0],
      status: error instanceof Error && 
             error.message === '监控项已停止' ? "监测中断" : "监测失败",
      summary: error instanceof Error && 
               error.message === '监控项已停止' ? 
               `监控已停止，已处理 ${details.length} 个页面` : 
               `抓取失败: ${error instanceof Error ? error.message : String(error)}`
    };
    
    await cleanupHistoryRecords(item.id);
    return { record, details };
  } finally {
    await releaseExecutionLock(item.id);
    await context.close();
    await browser.close();
  }
};

export default scrapeAlibabaCloud;
