/**
 * Snell 协议解析器
 */

import { ProxyTypes } from '../types.js';
import { smartUrlDecode } from '../utils/index.js';

/**
 * 解析 Snell URL
 * 支持格式: snell://password@server:port?params#name
 * @param {string} url - Snell URL
 * @returns {Object|null} 解析后的节点信息
 */
export function parseSnellUrl(url) {
  try {
    if (!url.startsWith('snell://')) {
      return null;
    }

    const urlObj = new URL(url);
    const password = smartUrlDecode(urlObj.username);
    const server = urlObj.hostname;
    const port = parseInt(urlObj.port);
    const name = smartUrlDecode(urlObj.hash.slice(1)) || `${server}:${port}`;

    const params = new URLSearchParams(urlObj.search);

    return {
      type: ProxyTypes.SNELL,
      name: name,
      server: server,
      port: port,
      password: password,
      version: parseInt(params.get('version') || '4'),
      obfs: {
        type: params.get('obfs') || '',
        host: params.get('obfs-host') || ''
      },
      tls: {
        enabled: params.get('tls') === '1' || params.get('tls') === 'true',
        serverName: params.get('sni') || '',
        skipCertVerify: params.get('insecure') === '1'
      }
    };
  } catch (error) {
    console.error('解析 Snell URL 失败:', error);
    return null;
  }
}

/**
 * 生成 Snell URL
 * @param {Object} node - 节点信息
 * @returns {string} Snell URL
 */
export function generateSnellUrl(node) {
  try {
    const url = new URL(`snell://${encodeURIComponent(node.password)}@${node.server}:${node.port}`);

    const params = new URLSearchParams();

    // 版本
    if (node.version && node.version !== 4) {
      params.set('version', node.version.toString());
    }

    // 混淆配置
    if (node.obfs?.type) {
      params.set('obfs', node.obfs.type);
      if (node.obfs.host) {
        params.set('obfs-host', node.obfs.host);
      }
    }

    // TLS 配置
    if (node.tls?.enabled) {
      params.set('tls', '1');
      if (node.tls.serverName) {
        params.set('sni', node.tls.serverName);
      }
      if (node.tls.skipCertVerify) {
        params.set('insecure', '1');
      }
    }

    if (params.toString()) {
      url.search = params.toString();
    }
    url.hash = encodeURIComponent(node.name);

    return url.toString();
  } catch (error) {
    console.error('生成 Snell URL 失败:', error);
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
    type: 'snell',
    server: node.server,
    port: node.port,
    psk: node.password,
    version: node.version || 4
  };

  // 混淆配置
  if (node.obfs?.type) {
    clashNode['obfs-opts'] = {
      mode: node.obfs.type
    };
    if (node.obfs.host) {
      clashNode['obfs-opts'].host = node.obfs.host;
    }
  }

  return clashNode;
}

/**
 * 从 Clash 格式解析
 * @param {Object} clashNode - Clash 格式节点
 * @returns {Object} 标准节点格式
 */
export function fromClashFormat(clashNode) {
  const node = {
    type: ProxyTypes.SNELL,
    name: clashNode.name,
    server: clashNode.server,
    port: clashNode.port,
    password: clashNode.psk,
    version: clashNode.version || 4,
    obfs: {
      type: '',
      host: ''
    },
    tls: {
      enabled: false,
      serverName: '',
      skipCertVerify: false
    }
  };

  // 解析混淆配置
  if (clashNode['obfs-opts']) {
    node.obfs.type = clashNode['obfs-opts'].mode || '';
    node.obfs.host = clashNode['obfs-opts'].host || '';
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
    node.port < 65536 &&
    node.version &&
    [3, 4].includes(node.version)
  );
}
