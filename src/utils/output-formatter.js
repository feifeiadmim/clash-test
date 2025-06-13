/**
 * 输出格式化器
 * 提供用户友好的输出格式和美化功能
 */

import { SafeInputSanitizer } from './security.js';

/**
 * 输出格式枚举
 */
export const OutputFormat = {
  JSON: 'json',
  YAML: 'yaml',
  TEXT: 'text',
  TABLE: 'table',
  MARKDOWN: 'markdown',
  CSV: 'csv'
};

/**
 * 颜色主题枚举
 */
export const ColorTheme = {
  DEFAULT: 'default',
  DARK: 'dark',
  LIGHT: 'light',
  COLORFUL: 'colorful',
  MINIMAL: 'minimal'
};

/**
 * 输出格式化器类
 */
export class OutputFormatter {
  constructor() {
    this.currentTheme = ColorTheme.DEFAULT;
    this.indentSize = 2;
    this.maxLineLength = 120;
    this.showProgress = true;
    this.showTimestamps = true;
  }

  /**
   * 设置格式化选项
   * @param {Object} options - 格式化选项
   */
  setOptions(options = {}) {
    const {
      theme = this.currentTheme,
      indentSize = this.indentSize,
      maxLineLength = this.maxLineLength,
      showProgress = this.showProgress,
      showTimestamps = this.showTimestamps
    } = options;

    this.currentTheme = theme;
    this.indentSize = indentSize;
    this.maxLineLength = maxLineLength;
    this.showProgress = showProgress;
    this.showTimestamps = showTimestamps;
  }

  /**
   * 格式化节点配置输出
   * @param {Array} nodes - 节点数组
   * @param {string} format - 输出格式
   * @param {Object} options - 格式化选项
   * @returns {string} 格式化后的输出
   */
  formatNodes(nodes, format = OutputFormat.JSON, options = {}) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return this.formatEmpty('没有找到有效的节点配置');
    }

    // 清理敏感信息
    const sanitizedNodes = this.sanitizeNodes(nodes);

    switch (format.toLowerCase()) {
      case OutputFormat.JSON:
        return this.formatAsJSON(sanitizedNodes, options);
      case OutputFormat.YAML:
        return this.formatAsYAML(sanitizedNodes, options);
      case OutputFormat.TEXT:
        return this.formatAsText(sanitizedNodes, options);
      case OutputFormat.TABLE:
        return this.formatAsTable(sanitizedNodes, options);
      case OutputFormat.MARKDOWN:
        return this.formatAsMarkdown(sanitizedNodes, options);
      case OutputFormat.CSV:
        return this.formatAsCSV(sanitizedNodes, options);
      default:
        return this.formatAsJSON(sanitizedNodes, options);
    }
  }

  /**
   * 清理节点中的敏感信息
   * @param {Array} nodes - 节点数组
   * @returns {Array} 清理后的节点数组
   */
  sanitizeNodes(nodes) {
    return nodes.map(node => {
      const sanitized = { ...node };
      
      // 清理密码字段
      if (sanitized.password) {
        sanitized.password = '***';
      }
      
      // 清理其他敏感字段
      const sensitiveFields = ['auth', 'token', 'key', 'secret'];
      for (const field of sensitiveFields) {
        if (sanitized[field]) {
          sanitized[field] = '***';
        }
      }

      return sanitized;
    });
  }

  /**
   * JSON格式化
   * @param {Array} nodes - 节点数组
   * @param {Object} options - 选项
   * @returns {string} JSON字符串
   */
  formatAsJSON(nodes, options = {}) {
    const { pretty = true, includeMetadata = true } = options;
    
    const output = {
      ...(includeMetadata && {
        metadata: {
          timestamp: new Date().toISOString(),
          count: nodes.length,
          format: 'json',
          version: '1.0'
        }
      }),
      nodes
    };

    if (pretty) {
      return JSON.stringify(output, null, this.indentSize);
    } else {
      return JSON.stringify(output);
    }
  }

  /**
   * YAML格式化
   * @param {Array} nodes - 节点数组
   * @param {Object} options - 选项
   * @returns {string} YAML字符串
   */
  formatAsYAML(nodes, options = {}) {
    const { includeMetadata = true } = options;
    
    let yaml = '';
    
    if (includeMetadata) {
      yaml += '# 节点配置文件\n';
      yaml += `# 生成时间: ${new Date().toISOString()}\n`;
      yaml += `# 节点数量: ${nodes.length}\n\n`;
      yaml += 'metadata:\n';
      yaml += `  timestamp: "${new Date().toISOString()}"\n`;
      yaml += `  count: ${nodes.length}\n`;
      yaml += '  format: yaml\n';
      yaml += '  version: "1.0"\n\n';
    }
    
    yaml += 'nodes:\n';
    
    for (const [index, node] of nodes.entries()) {
      yaml += `  - # 节点 ${index + 1}\n`;
      yaml += this.objectToYAML(node, 4);
      yaml += '\n';
    }
    
    return yaml;
  }

  /**
   * 对象转YAML
   * @param {Object} obj - 对象
   * @param {number} indent - 缩进
   * @returns {string} YAML字符串
   */
  objectToYAML(obj, indent = 0) {
    let yaml = '';
    const spaces = ' '.repeat(indent);
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        yaml += `${spaces}${key}: null\n`;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        yaml += this.objectToYAML(value, indent + 2);
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'object') {
            yaml += `${spaces}  -\n`;
            yaml += this.objectToYAML(item, indent + 4);
          } else {
            yaml += `${spaces}  - ${this.escapeYAMLValue(item)}\n`;
          }
        }
      } else {
        yaml += `${spaces}${key}: ${this.escapeYAMLValue(value)}\n`;
      }
    }
    
    return yaml;
  }

  /**
   * 转义YAML值
   * @param {any} value - 值
   * @returns {string} 转义后的值
   */
  escapeYAMLValue(value) {
    if (typeof value === 'string') {
      // 如果包含特殊字符，需要引号
      if (/[:\[\]{}|>]/.test(value) || value.includes('\n')) {
        return `"${value.replace(/"/g, '\\"')}"`;
      }
      return value;
    }
    return String(value);
  }

  /**
   * 文本格式化
   * @param {Array} nodes - 节点数组
   * @param {Object} options - 选项
   * @returns {string} 文本字符串
   */
  formatAsText(nodes, options = {}) {
    const { includeIndex = true, includeMetadata = true } = options;
    
    let text = '';
    
    if (includeMetadata) {
      text += '='.repeat(60) + '\n';
      text += '           节点配置信息\n';
      text += '='.repeat(60) + '\n';
      text += `生成时间: ${new Date().toLocaleString()}\n`;
      text += `节点数量: ${nodes.length}\n`;
      text += '='.repeat(60) + '\n\n';
    }
    
    for (const [index, node] of nodes.entries()) {
      if (includeIndex) {
        text += `[${index + 1}] ${node.name || '未命名节点'}\n`;
      }
      
      text += '-'.repeat(40) + '\n';
      text += `协议: ${node.type || 'unknown'}\n`;
      text += `服务器: ${node.server || 'unknown'}\n`;
      text += `端口: ${node.port || 'unknown'}\n`;
      
      if (node.method) text += `加密方式: ${node.method}\n`;
      if (node.network) text += `传输协议: ${node.network}\n`;
      if (node.security) text += `安全类型: ${node.security}\n`;
      
      // 显示其他配置
      const otherFields = Object.keys(node).filter(key => 
        !['name', 'type', 'server', 'port', 'method', 'network', 'security', 'password'].includes(key)
      );
      
      if (otherFields.length > 0) {
        text += '其他配置:\n';
        for (const field of otherFields) {
          text += `  ${field}: ${node[field]}\n`;
        }
      }
      
      text += '\n';
    }
    
    return text;
  }

  /**
   * 表格格式化
   * @param {Array} nodes - 节点数组
   * @param {Object} options - 选项
   * @returns {string} 表格字符串
   */
  formatAsTable(nodes, options = {}) {
    const { columns = ['name', 'type', 'server', 'port'] } = options;
    
    if (nodes.length === 0) {
      return '没有数据可显示';
    }
    
    // 计算列宽
    const columnWidths = {};
    for (const col of columns) {
      columnWidths[col] = Math.max(
        col.length,
        ...nodes.map(node => String(node[col] || '').length)
      );
    }
    
    let table = '';
    
    // 表头
    const headerRow = columns.map(col => 
      col.padEnd(columnWidths[col])
    ).join(' | ');
    table += `| ${headerRow} |\n`;
    
    // 分隔线
    const separatorRow = columns.map(col => 
      '-'.repeat(columnWidths[col])
    ).join('-|-');
    table += `|-${separatorRow}-|\n`;
    
    // 数据行
    for (const node of nodes) {
      const dataRow = columns.map(col => 
        String(node[col] || '').padEnd(columnWidths[col])
      ).join(' | ');
      table += `| ${dataRow} |\n`;
    }
    
    return table;
  }

  /**
   * Markdown格式化
   * @param {Array} nodes - 节点数组
   * @param {Object} options - 选项
   * @returns {string} Markdown字符串
   */
  formatAsMarkdown(nodes, options = {}) {
    const { includeMetadata = true, includeTable = true } = options;
    
    let markdown = '';
    
    if (includeMetadata) {
      markdown += '# 节点配置信息\n\n';
      markdown += `**生成时间**: ${new Date().toLocaleString()}\n`;
      markdown += `**节点数量**: ${nodes.length}\n\n`;
    }
    
    if (includeTable && nodes.length > 0) {
      markdown += '## 节点列表\n\n';
      markdown += this.formatAsTable(nodes, { columns: ['name', 'type', 'server', 'port'] });
      markdown += '\n\n';
    }
    
    markdown += '## 详细配置\n\n';
    
    for (const [index, node] of nodes.entries()) {
      markdown += `### ${index + 1}. ${node.name || '未命名节点'}\n\n`;
      markdown += '```yaml\n';
      markdown += this.objectToYAML(node);
      markdown += '```\n\n';
    }
    
    return markdown;
  }

  /**
   * CSV格式化
   * @param {Array} nodes - 节点数组
   * @param {Object} options - 选项
   * @returns {string} CSV字符串
   */
  formatAsCSV(nodes, options = {}) {
    const { columns = ['name', 'type', 'server', 'port', 'method'] } = options;
    
    if (nodes.length === 0) {
      return columns.join(',') + '\n';
    }
    
    let csv = '';
    
    // CSV头部
    csv += columns.join(',') + '\n';
    
    // 数据行
    for (const node of nodes) {
      const row = columns.map(col => {
        const value = String(node[col] || '');
        // 如果包含逗号或引号，需要转义
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csv += row.join(',') + '\n';
    }
    
    return csv;
  }

  /**
   * 格式化空结果
   * @param {string} message - 消息
   * @returns {string} 格式化的空结果
   */
  formatEmpty(message = '没有数据') {
    return `\n⚠️  ${message}\n\n`;
  }

  /**
   * 格式化错误信息
   * @param {Error} error - 错误对象
   * @param {Object} options - 选项
   * @returns {string} 格式化的错误信息
   */
  formatError(error, options = {}) {
    const { includeStack = false, includeTimestamp = true } = options;
    
    let output = '';
    
    if (includeTimestamp) {
      output += `[${new Date().toLocaleString()}] `;
    }
    
    output += `❌ 错误: ${error.message}\n`;
    
    if (error.code) {
      output += `   错误代码: ${error.code}\n`;
    }
    
    if (includeStack && error.stack) {
      output += `   堆栈信息:\n${error.stack}\n`;
    }
    
    return output;
  }

  /**
   * 格式化成功信息
   * @param {string} message - 成功消息
   * @param {Object} data - 相关数据
   * @returns {string} 格式化的成功信息
   */
  formatSuccess(message, data = null) {
    let output = `✅ ${message}\n`;
    
    if (data) {
      if (typeof data === 'object') {
        output += `   详情: ${JSON.stringify(data, null, 2)}\n`;
      } else {
        output += `   详情: ${data}\n`;
      }
    }
    
    return output;
  }

  /**
   * 格式化进度信息
   * @param {number} current - 当前进度
   * @param {number} total - 总数
   * @param {string} message - 进度消息
   * @returns {string} 格式化的进度信息
   */
  formatProgress(current, total, message = '') {
    if (!this.showProgress) return '';
    
    const percentage = Math.round((current / total) * 100);
    const progressBar = this.createProgressBar(percentage);
    
    return `🔄 ${message} ${progressBar} ${current}/${total} (${percentage}%)\n`;
  }

  /**
   * 创建进度条
   * @param {number} percentage - 百分比
   * @param {number} width - 进度条宽度
   * @returns {string} 进度条字符串
   */
  createProgressBar(percentage, width = 20) {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  /**
   * 格式化统计信息
   * @param {Object} stats - 统计数据
   * @returns {string} 格式化的统计信息
   */
  formatStats(stats) {
    let output = '\n📊 统计信息:\n';
    output += '─'.repeat(30) + '\n';
    
    for (const [key, value] of Object.entries(stats)) {
      const formattedKey = key.replace(/([A-Z])/g, ' $1').toLowerCase();
      output += `${formattedKey}: ${value}\n`;
    }
    
    return output;
  }

  /**
   * 应用颜色主题
   * @param {string} text - 文本
   * @param {string} type - 类型
   * @returns {string} 带颜色的文本
   */
  applyTheme(text, type = 'default') {
    // 简化的颜色应用，实际实现可以使用chalk等库
    const themes = {
      [ColorTheme.DEFAULT]: {
        success: text => `\x1b[32m${text}\x1b[0m`,
        error: text => `\x1b[31m${text}\x1b[0m`,
        warning: text => `\x1b[33m${text}\x1b[0m`,
        info: text => `\x1b[36m${text}\x1b[0m`
      }
    };
    
    const theme = themes[this.currentTheme];
    if (theme && theme[type]) {
      return theme[type](text);
    }
    
    return text;
  }
}

// 创建全局输出格式化器实例
export const globalOutputFormatter = new OutputFormatter();

export default globalOutputFormatter;
