/**
 * 协议解析器统一入口
 */

import * as shadowsocks from './shadowsocks.js';
import * as shadowsocksr from './shadowsocksr.js';
import * as vmess from './vmess.js';
import * as vless from './vless.js';
import * as trojan from './trojan.js';
import * as hysteria from './hysteria.js';
import * as hysteria2 from './hysteria2.js';
import * as tuic from './tuic.js';
import * as snell from './snell.js';
import * as anytls from './anytls.js';
import * as http from './http.js';
import { wireGuardParsers } from './wireguard.js';
import { sshParsers } from './ssh.js';
import { httpSocksParsers } from './http-socks.js';
import { directParsers } from './direct.js';
import { ProxyTypes } from '../types.js';

/**
 * 协议解析器映射
 */
const parsers = {
  [ProxyTypes.SHADOWSOCKS]: shadowsocks,
  [ProxyTypes.SHADOWSOCKSR]: shadowsocksr,
  [ProxyTypes.VMESS]: vmess,
  [ProxyTypes.VLESS]: vless,
  [ProxyTypes.TROJAN]: trojan,
  [ProxyTypes.HYSTERIA]: hysteria,
  [ProxyTypes.HYSTERIA2]: hysteria2,
  [ProxyTypes.TUIC]: tuic,
  [ProxyTypes.SNELL]: snell,
  [ProxyTypes.ANYTLS]: anytls,
  [ProxyTypes.HTTP]: http
};

/**
 * 解析单个代理URL
 * @param {string} url - 代理URL
 * @returns {Object|null} 解析后的节点信息
 */
export function parseProxyUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // 去除首尾空白字符
  url = url.trim();

  // 根据协议前缀选择对应的解析器
  if (url.startsWith('ss://')) {
    return shadowsocks.parseShadowsocksUrl(url);
  } else if (url.startsWith('ssr://')) {
    return shadowsocksr.parseShadowsocksRUrl(url);
  } else if (url.startsWith('vmess://')) {
    return vmess.parseVMessUrl(url);
  } else if (url.startsWith('vless://')) {
    return vless.parseVLESSUrl(url);
  } else if (url.startsWith('trojan://')) {
    return trojan.parseTrojanUrl(url);
  } else if (url.startsWith('hysteria://')) {
    return hysteria.parseHysteriaUrl(url);
  } else if (url.startsWith('hysteria2://') || url.startsWith('hy2://')) {
    return hysteria2.parseHysteria2Url(url);
  } else if (url.startsWith('tuic://')) {
    return tuic.parseTuicUrl(url);
  } else if (url.startsWith('snell://')) {
    return snell.parseSnellUrl(url);
  } else if (url.startsWith('anytls://')) {
    return anytls.parseAnyTLSUrl(url);
  }

  // 尝试新增的解析器
  for (const parser of [...wireGuardParsers, ...sshParsers, ...httpSocksParsers, ...directParsers]) {
    try {
      if (parser.test(url)) {
        return parser.parse(url);
      }
    } catch (error) {
      console.warn(`解析器 ${parser.name} 解析失败:`, error.message);
      continue;
    }
  }

  return null;
}

/**
 * 解析多个代理URL
 * @param {string|string[]} input - 代理URL或URL数组
 * @param {string} sourceFormat - 源格式标记
 * @returns {Object[]} 解析后的节点数组
 */
export function parseProxyUrls(input, sourceFormat = 'url') {
  const nodes = [];

  let urls = [];
  if (typeof input === 'string') {
    // 按行分割字符串
    urls = input.split(/\r?\n/).map(line => line.trim()).filter(line => line);
  } else if (Array.isArray(input)) {
    urls = input;
  } else {
    return nodes;
  }

  for (const url of urls) {
    const node = parseProxyUrl(url);
    if (node) {
      // 添加源格式标记
      node._sourceFormat = sourceFormat;
      nodes.push(node);
    }
  }

  return nodes;
}

/**
 * 解析Base64编码的订阅
 * @param {string} base64Content - Base64编码的内容
 * @returns {Object[]} 解析后的节点数组
 */
export function parseBase64Subscription(base64Content) {
  try {
    // 使用安全的解码函数
    let decodedContent;
    try {
      decodedContent = atob(base64Content);
    } catch (e) {
      // 如果失败，使用 Buffer 方式
      decodedContent = Buffer.from(base64Content, 'base64').toString('utf8');
    }

    // 按行分割并解析每个URL，标记为base64格式
    return parseProxyUrls(decodedContent, 'base64');
  } catch (error) {
    console.error('解析Base64订阅失败:', error);
    return [];
  }
}

/**
 * 生成代理URL
 * @param {Object} node - 节点信息
 * @returns {string|null} 代理URL
 */
export function generateProxyUrl(node) {
  if (!node || !node.type) {
    return null;
  }

  const parser = parsers[node.type];
  if (!parser) {
    console.error(`不支持的协议类型: ${node.type}`);
    return null;
  }

  // 根据协议类型调用对应的生成函数
  switch (node.type) {
    case ProxyTypes.SHADOWSOCKS:
      return parser.generateShadowsocksUrl(node);
    case ProxyTypes.SHADOWSOCKSR:
      return parser.generateShadowsocksRUrl(node);
    case ProxyTypes.VMESS:
      return parser.generateVMessUrl(node);
    case ProxyTypes.VLESS:
      return parser.generateVLESSUrl(node);
    case ProxyTypes.TROJAN:
      return parser.generateTrojanUrl(node);
    case ProxyTypes.HYSTERIA:
      return parser.generateHysteriaUrl(node);
    case ProxyTypes.HYSTERIA2:
      return parser.generateHysteria2Url(node);
    case ProxyTypes.TUIC:
      return parser.generateTuicUrl(node);
    case ProxyTypes.SNELL:
      return parser.generateSnellUrl(node);
    case ProxyTypes.ANYTLS:
      return parser.generateAnyTLSUrl(node);
    default:
      return null;
  }
}

/**
 * 生成多个代理URL
 * @param {Object[]} nodes - 节点数组
 * @returns {string[]} 代理URL数组
 */
export function generateProxyUrls(nodes) {
  const urls = [];

  for (const node of nodes) {
    const url = generateProxyUrl(node);
    if (url) {
      urls.push(url);
    }
  }

  return urls;
}

/**
 * 转换为Clash格式
 * @param {Object} node - 节点信息
 * @returns {Object|null} Clash格式节点
 */
export function toClashFormat(node) {
  if (!node || !node.type) {
    return null;
  }

  const parser = parsers[node.type];
  if (!parser || !parser.toClashFormat) {
    console.error(`不支持转换为Clash格式的协议: ${node.type}`);
    return null;
  }

  return parser.toClashFormat(node);
}

/**
 * 从Clash格式解析
 * @param {Object} clashNode - Clash格式节点
 * @returns {Object|null} 标准节点格式
 */
export function fromClashFormat(clashNode) {
  if (!clashNode || !clashNode.type) {
    return null;
  }

  // 映射Clash类型到内部类型
  const typeMap = {
    'ss': ProxyTypes.SHADOWSOCKS,
    'ssr': ProxyTypes.SHADOWSOCKSR,
    'vmess': ProxyTypes.VMESS,
    'vless': ProxyTypes.VLESS,
    'trojan': ProxyTypes.TROJAN,
    'hysteria': ProxyTypes.HYSTERIA,
    'hysteria2': ProxyTypes.HYSTERIA2,
    'tuic': ProxyTypes.TUIC,
    'snell': ProxyTypes.SNELL,
    'anytls': ProxyTypes.ANYTLS,
    'http': ProxyTypes.HTTP
  };

  const nodeType = typeMap[clashNode.type];
  if (!nodeType) {
    console.error(`不支持的Clash节点类型: ${clashNode.type}`);
    return null;
  }

  const parser = parsers[nodeType];
  if (!parser || !parser.fromClashFormat) {
    console.error(`不支持从Clash格式解析的协议: ${nodeType}`);
    return null;
  }

  return parser.fromClashFormat(clashNode);
}

/**
 * 验证节点配置
 * @param {Object} node - 节点信息
 * @returns {boolean} 是否有效
 */
export function validateNode(node) {
  if (!node || !node.type) {
    return false;
  }

  const parser = parsers[node.type];
  if (!parser || !parser.validateNode) {
    return false;
  }

  return parser.validateNode(node);
}

/**
 * 获取支持的协议类型
 * @returns {string[]} 支持的协议类型数组
 */
export function getSupportedTypes() {
  return Object.keys(parsers);
}

/**
 * 检查是否支持指定协议
 * @param {string} type - 协议类型
 * @returns {boolean} 是否支持
 */
export function isTypeSupported(type) {
  return type in parsers;
}

// 导出通用解析器
export { UniversalParser, universalParser } from './universal.js';

/**
 * 智能解析内容
 * 使用通用解析器自动检测格式并解析
 * @param {string} content - 输入内容
 * @returns {Object} 解析结果
 */
export async function smartParseContent(content) {
  const { universalParser } = await import('./universal.js');
  return universalParser.smartParse(content);
}

/**
 * 获取扩展格式支持统计
 * @returns {Object} 支持的格式统计
 */
export function getExtendedFormatSupport() {
  return {
    protocols: {
      traditional: ['ss', 'ssr', 'vmess', 'vless', 'trojan'],
      modern: ['hysteria', 'hysteria2', 'tuic', 'snell', 'anytls'],
      extended: ['wireguard', 'ssh', 'http', 'socks5']
    },
    formats: {
      uri: ['ss://', 'ssr://', 'vmess://', 'vless://', 'trojan://', 'hysteria://', 'hy2://', 'tuic://', 'snell://', 'wireguard://', 'ssh://', 'http://', 'https://', 'socks5://'],
      config: ['clash-yaml', 'v2ray-json', 'wireguard-conf', 'openssh-config'],
      subscription: ['base64-encoded', 'plain-text']
    },
    total: getSupportedTypes().length + wireGuardParsers.length + sshParsers.length + httpSocksParsers.length
  };
}
