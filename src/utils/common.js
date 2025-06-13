/**
 * 公共工具函数模块
 *
 * 提供统一的工具方法，消除代码冗余，提高代码可维护性
 * 包含格式转换、节点显示、参数验证等常用功能
 *
 * @module utils/common
 * @version 1.0.0
 * @author Proxy Node Merger
 */

import { OutputFormats } from '../types.js';

/**
 * 将格式字符串转换为OutputFormats常量
 * @param {string} inputFormat - 输入格式字符串
 * @returns {string} 解析格式常量
 */
export function getParseFormat(inputFormat) {
  const formatMap = {
    'clash': OutputFormats.CLASH,
    'base64': OutputFormats.BASE64,
    'url': OutputFormats.URL
  };
  return formatMap[inputFormat] || inputFormat;
}

/**
 * 显示节点列表
 * @param {Object[]} nodes - 节点数组
 * @param {number} maxDisplay - 最大显示数量
 * @param {string} title - 显示标题
 */
export function displayNodeList(nodes, maxDisplay = 5, title = '📝 解析到的节点:') {
  console.log(`\n${title}`);
  nodes.slice(0, maxDisplay).forEach((node, index) => {
    console.log(`  ${index + 1}. ${node.name} (${node.type}) - ${node.server}:${node.port}`);
  });
  if (nodes.length > maxDisplay) {
    console.log(`  ... 还有 ${nodes.length - maxDisplay} 个节点`);
  }
}

/**
 * 显示重命名后的节点列表
 * @param {Object[]} nodes - 节点数组
 * @param {number} maxDisplay - 最大显示数量
 */
export function displayRenamedNodeList(nodes, maxDisplay = 5) {
  console.log('\n🏷️ 重命名后的节点:');
  nodes.slice(0, maxDisplay).forEach((node, index) => {
    console.log(`  ${index + 1}. ${node.name}`);
  });
  if (nodes.length > maxDisplay) {
    console.log(`  ... 还有 ${nodes.length - maxDisplay} 个节点`);
  }
}

/**
 * 显示节点统计信息
 * @param {Object} stats - 统计信息对象
 */
export function displayNodeStats(stats) {
  console.log('\n📊 节点统计:');
  console.log(`  总数: ${stats.total}`);
  console.log(`  协议分布: ${Object.entries(stats.types).map(([type, count]) => `${type}(${count})`).join(', ')}`);
  console.log(`  地区分布: ${Object.entries(stats.regions).map(([region, count]) => `${region}(${count})`).join(', ')}`);
}

/**
 * 显示合并后统计信息
 * @param {Object} stats - 统计信息对象
 */
export function displayMergeStats(stats) {
  if (!stats) {
    console.log('\n📊 合并后统计: 统计信息不可用');
    return;
  }

  console.log('\n📊 合并后统计:');
  console.log(`  总数: ${stats.total || 0}`);

  if (stats.types && Object.keys(stats.types).length > 0) {
    console.log(`  协议分布: ${Object.entries(stats.types).map(([type, count]) => `${type}(${count})`).join(', ')}`);
  }

  if (stats.regions && Object.keys(stats.regions).length > 0) {
    console.log(`  地区分布: ${Object.entries(stats.regions).map(([region, count]) => `${region}(${count})`).join(', ')}`);
  }
}

/**
 * 显示去重结果
 * @param {number} originalCount - 原始数量
 * @param {number} finalCount - 最终数量
 */
export function displayDeduplicationResult(originalCount, finalCount) {
  const removedCount = originalCount - finalCount;
  console.log(`✅ 去重完成: ${originalCount} → ${finalCount} (移除 ${removedCount} 个重复)`);
}

/**
 * 显示处理进度
 * @param {string} fileName - 文件名
 * @param {string} action - 操作类型
 */
export function displayProcessProgress(fileName, action = '处理') {
  console.log(`\n📁 ${action}: ${fileName}`);
  console.log('─'.repeat(50));
}

/**
 * 参数验证函数
 * @param {*} value - 要验证的值
 * @param {string} type - 期望的类型
 * @param {string} name - 参数名称
 * @throws {Error} 验证失败时抛出错误
 */
export function validateParameter(value, type, name) {
  if (type === 'array' && !Array.isArray(value)) {
    throw new Error(`参数 ${name} 必须是数组`);
  }
  if (type === 'string' && typeof value !== 'string') {
    throw new Error(`参数 ${name} 必须是字符串`);
  }
  if (type === 'object' && (typeof value !== 'object' || value === null)) {
    throw new Error(`参数 ${name} 必须是对象`);
  }
  if (type === 'number' && typeof value !== 'number') {
    throw new Error(`参数 ${name} 必须是数字`);
  }
}

/**
 * 验证节点数组
 * @param {Object[]} nodes - 节点数组
 * @throws {Error} 验证失败时抛出错误
 */
export function validateNodes(nodes) {
  validateParameter(nodes, 'array', 'nodes');

  if (nodes.length === 0) {
    throw new Error('节点数组不能为空');
  }

  // 验证节点结构
  for (let i = 0; i < Math.min(nodes.length, 5); i++) {
    const node = nodes[i];
    if (!node.server || !node.port || !node.type) {
      throw new Error(`节点 ${i + 1} 缺少必要字段 (server, port, type)`);
    }
  }
}

/**
 * 安全的文件名生成
 * @param {string} baseName - 基础文件名
 * @param {string} extension - 文件扩展名
 * @returns {string} 安全的文件名
 */
export function generateSafeFileName(baseName, extension) {
  // 移除或替换不安全的字符
  const safeName = baseName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return `${safeName}.${extension}`;
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化的文件大小
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// delay函数已移至 utils/index.js 中，避免重复定义

/**
 * 检查是否为IPv4地址
 * @param {string} ip - IP地址字符串
 * @returns {boolean} 是否为IPv4地址
 */
export function isIPv4(ip) {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
}

/**
 * 检查是否为IPv6地址
 * @param {string} ip - IP地址字符串
 * @returns {boolean} 是否为IPv6地址
 */
export function isIPv6(ip) {
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$|^(?:[0-9a-fA-F]{1,4}:)*::(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;
  return ipv6Regex.test(ip);
}
