import ExcelJS from 'exceljs'
import type { MonitoringItem, MonitoringRecord, MonitoringDetail } from "@/lib/monitoring"
import { Buffer } from 'buffer'
import DiffMatchPatch from 'diff-match-patch'

/**
 * 导出监控结果到 Excel 文件
 * @param item 监控项
 * @param record 监控记录
 * @param details 监控详情
 * @returns Excel 文件的 Buffer
 */
export async function exportMonitoringResults(
  item: MonitoringItem,
  record: MonitoringRecord,
  details: MonitoringDetail[]
): Promise<ExcelJS.Buffer> {
  // 创建工作簿
  const workbook = new ExcelJS.Workbook()
  
  // 添加监控记录工作表
  const recordSheet = workbook.addWorksheet('监控记录')
  recordSheet.columns = [
    { header: '监控项', key: 'name', width: 20 },
    { header: '监控时间', key: 'date', width: 20 },
    { header: '监控状态', key: 'status', width: 15 },
    { header: '监控结果', key: 'summary', width: 30 }
  ]
  
  // 添加监控记录数据
  recordSheet.addRow({
    name: item.name,
    date: record.date,
    status: record.status,
    summary: record.summary
  })
  
  // 添加监控详情工作表
  const detailSheet = workbook.addWorksheet('监控详情')
  detailSheet.columns = [
    { header: '序号', key: 'index', width: 8 },
    { header: '页面', key: 'page', width: 20 },
    { header: '链接', key: 'link', width: 50 },
    { header: '变化状态', key: 'action', width: 15 },
    { header: '内容变化', key: 'changes', width: 60 },
    { header: '竞品分析', key: 'analysis', width: 60 }
  ]
  
  // 添加监控详情数据
  details.forEach((detail, index) => {
    // 计算内容差异
    const dmp = new DiffMatchPatch();
    const oldText = detail.old_content === "首次监测" ? "" : detail.old_content;
    const diffs = dmp.diff_main(oldText, detail.new_content);
    dmp.diff_cleanupSemantic(diffs);
    
    // 将差异转换为文本格式
    const changes = diffs.map(([type, text]) => {
      switch (type) {
        case -1: // 删除的文本
          return `【删除】${text}`;
        case 1: // 添加的文本
          return `【新增】${text}`;
        default: // 未变化的文本
          return text;
      }
    }).join('');

    // 提取分析结果
    let analysisResult = '';
    if (detail.analysis_result) {
      const parts = detail.analysis_result.split('\n\n---\n\n');
      analysisResult = parts.length > 1 ? parts[1] : detail.analysis_result;
    }

    detailSheet.addRow({
      index: index + 1,
      page: detail.page,
      link: detail.link,
      action: detail.action,
      changes: changes,
      analysis: analysisResult
    })
  })
  
  // 设置表格样式
  ;[recordSheet, detailSheet].forEach(sheet => {
    // 设置表头样式
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F0FF' }
    }
    
    // 设置边框和自动换行
    sheet.eachRow((row: ExcelJS.Row) => {
      row.eachCell((cell: ExcelJS.Cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
        cell.alignment = {
          wrapText: true,
          vertical: 'top'
        }
      })
    })

    // 设置适当的行高
    sheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
      if (rowNumber > 1) {
        row.height = 100;
      }
    })
  })
  
  // 导出为 Buffer
  return await workbook.xlsx.writeBuffer()
} 