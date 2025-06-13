/**
 * Base64 格式转换器
 */

import { generateProxyUrls, parseBase64Subscription } from '../parsers/index.js';
import { safeBtoa, safeAtob } from '../utils/index.js';

/**
 * 将节点数组转换为 Base64 编码的订阅
 * @param {Object[]} nodes - 节点数组
 * @param {Object} options - 转换选项
 * @returns {string} Base64 编码的订阅字符串
 */
export function toBase64Subscription(nodes, options = {}) {
  try {
    // 生成代理 URL 列表
    const urls = generateProxyUrls(nodes);

    if (urls.length === 0) {
      return '';
    }

    // 将 URL 列表连接成字符串
    const content = urls.join('\n');

    // Base64 编码
    return safeBtoa(content);
  } catch (error) {
    console.error('转换为 Base64 订阅失败:', error);
    return '';
  }
}

/**
 * 从 Base64 编码的订阅解析节点
 * @param {string} base64Content - Base64 编码的内容
 * @returns {Object[]} 节点数组
 */
export function fromBase64Subscription(base64Content) {
  try {
    if (!base64Content || typeof base64Content !== 'string') {
      return [];
    }

    // 清理 Base64 字符串
    const cleanBase64 = base64Content.trim().replace(/\s/g, '');

    return parseBase64Subscription(cleanBase64);
  } catch (error) {
    console.error('从 Base64 订阅解析失败:', error);
    return [];
  }
}

/**
 * 检测字符串是否为有效的 Base64 编码
 * @param {string} str - 要检测的字符串
 * @returns {boolean} 是否为有效的 Base64
 */
export function isValidBase64(str) {
  if (!str || typeof str !== 'string') {
    return false;
  }

  try {
    // 清理字符串
    const cleanStr = str.trim().replace(/\s/g, '');

    // 检查 Base64 格式
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(cleanStr)) {
      return false;
    }

    // 尝试解码
    const decoded = safeAtob(cleanStr);

    // 检查解码后的内容是否包含代理 URL
    const lines = decoded.split(/\r?\n/).filter(line => line.trim());

    // 至少包含一个有效的代理协议前缀
    const proxyPrefixes = ['ss://', 'ssr://', 'vmess://', 'vless://', 'trojan://', 'hysteria://', 'tuic://'];
    return lines.some(line =>
      proxyPrefixes.some(prefix => line.trim().startsWith(prefix))
    );
  } catch (error) {
    return false;
  }
}

/**
 * 将多个 Base64 订阅合并
 * @param {string[]} base64Subscriptions - Base64 订阅数组
 * @returns {string} 合并后的 Base64 订阅
 */
export function mergeBase64Subscriptions(base64Subscriptions) {
  try {
    const allNodes = [];

    for (const base64Content of base64Subscriptions) {
      const nodes = fromBase64Subscription(base64Content);
      allNodes.push(...nodes);
    }

    return toBase64Subscription(allNodes);
  } catch (error) {
    console.error('合并 Base64 订阅失败:', error);
    return '';
  }
}

/**
 * 分割 Base64 订阅
 * @param {string} base64Content - Base64 编码的内容
 * @param {number} chunkSize - 每个分片的节点数量
 * @returns {string[]} 分割后的 Base64 订阅数组
 */
export function splitBase64Subscription(base64Content, chunkSize = 100) {
  try {
    const nodes = fromBase64Subscription(base64Content);
    const chunks = [];

    for (let i = 0; i < nodes.length; i += chunkSize) {
      const chunk = nodes.slice(i, i + chunkSize);
      const chunkBase64 = toBase64Subscription(chunk);
      if (chunkBase64) {
        chunks.push(chunkBase64);
      }
    }

    return chunks;
  } catch (error) {
    console.error('分割 Base64 订阅失败:', error);
    return [];
  }
}

/**
 * 获取 Base64 订阅的统计信息
 * @param {string} base64Content - Base64 编码的内容
 * @returns {Object} 统计信息
 */
export function getBase64SubscriptionStats(base64Content) {
  try {
    const nodes = fromBase64Subscription(base64Content);

    const stats = {
      total: nodes.length,
      types: {},
      regions: {},
      valid: 0,
      invalid: 0
    };

    for (const node of nodes) {
      // 统计协议类型
      if (node.type) {
        stats.types[node.type] = (stats.types[node.type] || 0) + 1;
      }

      // 统计地区（从节点名称中提取）
      const region = extractRegionFromName(node.name);
      if (region) {
        stats.regions[region] = (stats.regions[region] || 0) + 1;
      }

      // 统计有效性
      if (isValidNode(node)) {
        stats.valid++;
      } else {
        stats.invalid++;
      }
    }

    return stats;
  } catch (error) {
    console.error('获取 Base64 订阅统计信息失败:', error);
    return {
      total: 0,
      types: {},
      regions: {},
      valid: 0,
      invalid: 0
    };
  }
}

/**
 * 从节点名称中提取地区信息
 * @param {string} name - 节点名称
 * @returns {string|null} 地区代码
 */
function extractRegionFromName(name) {
  if (!name) return null;

  const regionPatterns = {
    'HK': /香港|HK|Hong\s*Kong/i,
    'TW': /台湾|TW|Taiwan/i,
    'SG': /新加坡|SG|Singapore/i,
    'JP': /日本|JP|Japan/i,
    'KR': /韩国|KR|Korea/i,
    'US': /美国|US|United\s*States|America/i,
    'UK': /英国|UK|United\s*Kingdom|Britain/i,
    'DE': /德国|DE|Germany/i,
    'FR': /法国|FR|France/i,
    'CA': /加拿大|CA|Canada/i,
    'AU': /澳大利亚|AU|Australia/i,
    'RU': /俄罗斯|RU|Russia/i
  };

  for (const [code, pattern] of Object.entries(regionPatterns)) {
    if (pattern.test(name)) {
      return code;
    }
  }

  return 'OTHER';
}

/**
 * 简单的节点有效性检查
 * @param {Object} node - 节点信息
 * @returns {boolean} 是否有效
 */
function isValidNode(node) {
  return !!(
    node &&
    node.type &&
    node.server &&
    node.port &&
    node.port > 0 &&
    node.port < 65536
  );
}

/**
 * 压缩 Base64 订阅（移除重复节点）
 * @param {string} base64Content - Base64 编码的内容
 * @returns {string} 压缩后的 Base64 订阅
 */
export function compressBase64Subscription(base64Content) {
  try {
    const nodes = fromBase64Subscription(base64Content);

    // 去重逻辑（基于服务器地址和端口）
    const uniqueNodes = [];
    const seen = new Set();

    for (const node of nodes) {
      const key = `${node.server}:${node.port}:${node.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueNodes.push(node);
      }
    }

    return toBase64Subscription(uniqueNodes);
  } catch (error) {
    console.error('压缩 Base64 订阅失败:', error);
    return base64Content;
  }
}
