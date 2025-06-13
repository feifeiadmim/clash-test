/**
 * HTTP 代理解析器
 * 支持 HTTP/HTTPS 代理协议
 */

import { ProxyTypes } from '../types.js';

/**
 * 从 Clash 格式解析 HTTP 节点
 * @param {Object} clashNode - Clash 格式节点
 * @returns {Object} 标准节点格式
 */
export function fromClashFormat(clashNode) {
  // 验证必需字段
  if (!clashNode.server || clashNode.server === null || clashNode.server === undefined) {
    throw new Error(`HTTP node "${clashNode.name}" missing required server field`);
  }

  const node = {
    type: ProxyTypes.HTTP,
    name: clashNode.name,
    server: clashNode.server,
    port: clashNode.port || (clashNode.tls ? 443 : 80),
    tls: clashNode.tls || false,
    udp: clashNode.udp !== false
  };

  // 认证信息
  if (clashNode.username) {
    node.username = clashNode.username;
  }
  if (clashNode.password) {
    node.password = clashNode.password;
  }

  // TLS 相关配置
  if (clashNode.tls) {
    node.tls = true;
    if (clashNode['skip-cert-verify'] !== undefined) {
      node.skipCertVerify = clashNode['skip-cert-verify'];
    }
    if (clashNode.sni) {
      node.sni = clashNode.sni;
    }
  }

  // 客户端指纹
  if (clashNode['client-fingerprint']) {
    node.clientFingerprint = clashNode['client-fingerprint'];
  }

  return node;
}

/**
 * 转换为 Clash 格式
 * @param {Object} node - 标准节点格式
 * @returns {Object} Clash 格式节点
 */
export function toClashFormat(node) {
  const clashNode = {
    name: node.name,
    type: 'http',
    server: node.server,
    port: node.port
  };

  // 认证信息
  if (node.username) {
    clashNode.username = node.username;
  }
  if (node.password) {
    clashNode.password = node.password;
  }

  // TLS 配置
  if (node.tls) {
    clashNode.tls = true;
    if (node.skipCertVerify !== undefined) {
      clashNode['skip-cert-verify'] = node.skipCertVerify;
    }
    if (node.sni) {
      clashNode.sni = node.sni;
    }
  }

  // UDP 支持
  if (node.udp !== undefined) {
    clashNode.udp = node.udp;
  }

  // 客户端指纹
  if (node.clientFingerprint) {
    clashNode['client-fingerprint'] = node.clientFingerprint;
  }

  return clashNode;
}

/**
 * 解析 HTTP URL
 * @param {string} url - HTTP URL
 * @returns {Object} 解析后的节点信息
 */
export function parseHTTPUrl(url) {
  if (!url || !url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error('Invalid HTTP URL');
  }

  try {
    const urlObj = new URL(url);
    
    const node = {
      type: ProxyTypes.HTTP,
      name: `HTTP ${urlObj.hostname}:${urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80)}`,
      server: urlObj.hostname,
      port: parseInt(urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80'), 10),
      tls: urlObj.protocol === 'https:'
    };

    // 认证信息
    if (urlObj.username) {
      node.username = decodeURIComponent(urlObj.username);
    }
    if (urlObj.password) {
      node.password = decodeURIComponent(urlObj.password);
    }

    // 从 hash 中提取名称
    if (urlObj.hash) {
      node.name = decodeURIComponent(urlObj.hash.substring(1));
    }

    return node;
  } catch (error) {
    throw new Error(`Failed to parse HTTP URL: ${error.message}`);
  }
}

/**
 * 生成 HTTP URL
 * @param {Object} node - 节点信息
 * @returns {string} HTTP URL
 */
export function generateHTTPUrl(node) {
  const protocol = node.tls ? 'https' : 'http';
  const port = node.port || (node.tls ? 443 : 80);
  
  let url = `${protocol}://`;
  
  // 认证信息
  if (node.username || node.password) {
    if (node.username) {
      url += encodeURIComponent(node.username);
    }
    if (node.password) {
      url += ':' + encodeURIComponent(node.password);
    }
    url += '@';
  }
  
  url += node.server;
  
  // 端口（如果不是默认端口）
  const defaultPort = node.tls ? 443 : 80;
  if (port !== defaultPort) {
    url += ':' + port;
  }
  
  // 名称作为 hash
  if (node.name && node.name !== `HTTP ${node.server}:${port}`) {
    url += '#' + encodeURIComponent(node.name);
  }
  
  return url;
}

/**
 * 验证节点配置
 * @param {Object} node - 节点信息
 * @returns {boolean} 是否有效
 */
export function validateNode(node) {
  if (!node || node.type !== ProxyTypes.HTTP) {
    return false;
  }

  // 必需字段检查
  if (!node.server || !node.port) {
    return false;
  }

  // 端口范围检查
  if (node.port < 1 || node.port > 65535) {
    return false;
  }

  return true;
}

/**
 * 获取节点信息摘要
 * @param {Object} node - 节点信息
 * @returns {string} 节点摘要
 */
export function getNodeSummary(node) {
  const protocol = node.tls ? 'HTTPS' : 'HTTP';
  const auth = node.username ? ' (Auth)' : '';
  return `${protocol} ${node.server}:${node.port}${auth}`;
}
