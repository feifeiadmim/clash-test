/**
 * AnyTLS 协议解析器
 */

import { ProxyTypes } from '../types.js';

/**
 * 解析 AnyTLS URL
 * 支持 Sub-Store 风格的 AnyTLS URI 格式
 * @param {string} url - AnyTLS URL
 * @returns {Object|null} 解析后的节点信息
 */
export function parseAnyTLSUrl(url) {
  if (!url || !url.startsWith('anytls://')) {
    return null;
  }

  try {
    // 移除协议前缀
    const content = url.split('anytls://')[1];

    // 解析基本结构: password@server:port/?params#name
    const match = /^(.*?)@(.*?)(?::(\d+))?\/?(\\?(.*?))?(?:#(.*))?$/.exec(content);
    if (!match) {
      throw new Error('Invalid AnyTLS URI format');
    }

    const [, password, server, port, , addons = '', name] = match;

    const node = {
      type: ProxyTypes.ANYTLS,
      name: name ? decodeURIComponent(name) : `AnyTLS ${server}:${port || 443}`,
      server,
      port: parseInt(port || '443', 10),
      password: decodeURIComponent(password),
      // AnyTLS 默认配置
      tls: true,
      udp: true
    };

    // 解析参数
    if (addons) {
      parseAnyTLSParams(node, addons);
    }

    return node;
  } catch (error) {
    console.error('解析 AnyTLS URL 失败:', error.message);
    return null;
  }
}

/**
 * 解析 AnyTLS URL 参数
 * @param {Object} node - 节点对象
 * @param {string} params - 参数字符串
 */
function parseAnyTLSParams(node, params) {
  for (const param of params.split('&')) {
    const [key, value] = param.split('=').map(decodeURIComponent);

    if (!key || !value) continue;

    switch (key.toLowerCase().replace(/_/g, '-')) {
      case 'alpn':
        node.alpn = value.split(',').map(v => v.trim());
        break;

      case 'insecure':
        node['skip-cert-verify'] = /^(true|1|yes)$/i.test(value);
        break;

      case 'udp':
        node.udp = /^(true|1|yes)$/i.test(value);
        break;

      case 'sni':
        node.sni = value;
        break;

      case 'fingerprint':
      case 'client-fingerprint':
        node['client-fingerprint'] = value;
        break;

      case 'tls-fingerprint':
        node['tls-fingerprint'] = value;
        break;

      case 'tfo':
      case 'fast-open':
        node.tfo = /^(true|1|yes)$/i.test(value);
        break;

      case 'mptcp':
        node.mptcp = /^(true|1|yes)$/i.test(value);
        break;

      default:
        // 其他参数直接设置
        node[key.replace(/_/g, '-')] = value;
        break;
    }
  }
}

/**
 * 生成 AnyTLS URL
 * 支持 Sub-Store 风格的 AnyTLS URI 格式
 * @param {Object} node - 节点信息
 * @returns {string|null} AnyTLS URL
 */
export function generateAnyTLSUrl(node) {
  if (!node || node.type !== ProxyTypes.ANYTLS) {
    return null;
  }

  try {
    const password = encodeURIComponent(node.password);
    const server = node.server;
    const port = node.port || 443;
    const name = node.name ? encodeURIComponent(node.name) : '';

    let url = `anytls://${password}@${server}:${port}`;

    // 构建参数
    const params = [];

    if (node.alpn && node.alpn.length > 0) {
      params.push(`alpn=${encodeURIComponent(node.alpn.join(','))}`);
    }

    if (node['skip-cert-verify']) {
      params.push('insecure=true');
    }

    if (node.udp === false) {
      params.push('udp=false');
    }

    if (node.sni) {
      params.push(`sni=${encodeURIComponent(node.sni)}`);
    }

    if (node['client-fingerprint']) {
      params.push(`fingerprint=${encodeURIComponent(node['client-fingerprint'])}`);
    }

    if (node['tls-fingerprint']) {
      params.push(`tls-fingerprint=${encodeURIComponent(node['tls-fingerprint'])}`);
    }

    if (node.tfo) {
      params.push('tfo=true');
    }

    if (node.mptcp) {
      params.push('mptcp=true');
    }

    // 添加参数
    if (params.length > 0) {
      url += '?' + params.join('&');
    }

    // 添加名称
    if (name) {
      url += '#' + name;
    }

    return url;
  } catch (error) {
    console.error('生成 AnyTLS URL 失败:', error.message);
    return null;
  }
}

/**
 * 转换为 Clash 格式
 * @param {Object} node - 节点信息
 * @returns {Object} Clash 格式节点
 */
export function toClashFormat(node) {
  const clashNode = {
    name: node.name,
    type: 'anytls',
    server: node.server,
    port: node.port,
    password: node.password,
    udp: node.udp !== false
  };

  // TLS 配置
  if (node.alpn && node.alpn.length > 0) {
    clashNode.alpn = node.alpn;
  }

  if (node.sni) {
    clashNode.sni = node.sni;
  }

  if (node['skip-cert-verify']) {
    clashNode['skip-cert-verify'] = node['skip-cert-verify'];
  }

  if (node['client-fingerprint']) {
    clashNode['client-fingerprint'] = node['client-fingerprint'];
  }

  if (node['tls-fingerprint']) {
    clashNode['tls-fingerprint'] = node['tls-fingerprint'];
  }

  if (node.tfo) {
    clashNode.tfo = node.tfo;
  }

  if (node.mptcp) {
    clashNode.mptcp = node.mptcp;
  }

  // 会话管理配置
  if (node.idleSessionCheckInterval) {
    clashNode['idle-session-check-interval'] = node.idleSessionCheckInterval;
  }

  if (node.idleSessionTimeout) {
    clashNode['idle-session-timeout'] = node.idleSessionTimeout;
  }

  if (node.minIdleSession !== undefined) {
    clashNode['min-idle-session'] = node.minIdleSession;
  }

  // 其他可能的配置
  if (node.paddingScheme) {
    clashNode['padding-scheme'] = node.paddingScheme;
  }

  return clashNode;
}

/**
 * 从 Clash 格式解析
 * @param {Object} clashNode - Clash 格式节点
 * @returns {Object} 标准节点格式
 */
export function fromClashFormat(clashNode) {
  // 验证必需字段
  if (!clashNode.server || clashNode.server === null || clashNode.server === undefined) {
    throw new Error(`AnyTLS node "${clashNode.name}" missing required server field`);
  }

  const node = {
    type: ProxyTypes.ANYTLS,
    name: clashNode.name,
    server: clashNode.server,
    port: clashNode.port,
    password: clashNode.password,
    tls: true,
    udp: clashNode.udp !== false
  };

  // TLS 配置
  if (clashNode.alpn) {
    node.alpn = Array.isArray(clashNode.alpn) ? clashNode.alpn : [clashNode.alpn];
  }

  if (clashNode.sni) {
    node.sni = clashNode.sni;
  }

  if (clashNode['skip-cert-verify'] !== undefined) {
    node['skip-cert-verify'] = clashNode['skip-cert-verify'];
  }

  if (clashNode['client-fingerprint']) {
    node['client-fingerprint'] = clashNode['client-fingerprint'];
  }

  if (clashNode['tls-fingerprint']) {
    node['tls-fingerprint'] = clashNode['tls-fingerprint'];
  }

  if (clashNode.tfo !== undefined) {
    node.tfo = clashNode.tfo;
  }

  if (clashNode.mptcp !== undefined) {
    node.mptcp = clashNode.mptcp;
  }

  // 会话管理配置
  if (clashNode['idle-session-check-interval']) {
    node.idleSessionCheckInterval = clashNode['idle-session-check-interval'];
  }

  if (clashNode['idle-session-timeout']) {
    node.idleSessionTimeout = clashNode['idle-session-timeout'];
  }

  if (clashNode['min-idle-session'] !== undefined) {
    node.minIdleSession = clashNode['min-idle-session'];
  }

  // 其他可能的配置
  if (clashNode['padding-scheme']) {
    node.paddingScheme = clashNode['padding-scheme'];
  }

  return node;
}

/**
 * 验证节点配置
 * @param {Object} node - 节点信息
 * @returns {boolean} 是否有效
 */
export function validateNode(node) {
  return !!(
    node.server &&
    node.port &&
    node.password &&
    node.port > 0 &&
    node.port < 65536
  );
}
