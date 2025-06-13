/**
 * Hysteria v1 协议解析器
 * 已加强：严格输入验证、错误处理、安全检查
 */

import { ProxyTypes } from '../types.js';
import { smartUrlDecode } from '../utils/index.js';
import { ParserErrorHandler } from './common/error-handler.js';
import { NodeValidator } from './common/validator.js';
import { wrapWithCache } from './common/cache.js';

/**
 * Hysteria输入安全校验函数
 * @param {string} url - Hysteria URL
 * @returns {Object} 校验结果 {isValid: boolean, error?: string}
 */
function validateHysteriaInput(url) {
  try {
    // 基础类型检查
    if (!url || typeof url !== 'string') {
      return { isValid: false, error: 'Invalid input: URL must be a non-empty string' };
    }

    // 长度限制防止DoS攻击
    if (url.length > 2048) {
      return { isValid: false, error: `URL too long: ${url.length} > 2048` };
    }

    // 协议前缀检查
    if (!url.startsWith('hysteria://')) {
      return { isValid: false, error: 'Invalid protocol: URL must start with hysteria://' };
    }

    // 检查危险字符
    const dangerousPatterns = [
      /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, // 控制字符
      /<script[^>]*>.*?<\/script>/gi,        // 脚本标签
      /javascript:/gi,                       // JavaScript协议
      /vbscript:/gi,                         // VBScript协议
      /on\w+\s*=/gi                          // 事件处理器
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(url)) {
        return { isValid: false, error: 'URL contains dangerous characters' };
      }
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: `Validation error: ${error.message}` };
  }
}

/**
 * 解析 Hysteria URL（内部实现）
 * @param {string} url - Hysteria URL
 * @returns {Object|null} 解析后的节点信息
 */
function _parseHysteriaUrl(url) {
  // 使用安全校验函数
  const validation = validateHysteriaInput(url);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const urlObj = new URL(url);

  if (urlObj.protocol !== 'hysteria:') {
    throw new Error('Invalid protocol: expected hysteria://');
  }

  const server = urlObj.hostname;
  const port = parseInt(urlObj.port) || 443;
  const password = smartUrlDecode(urlObj.username) || '';
  const name = smartUrlDecode(urlObj.hash.slice(1)) || `${server}:${port}`;

  // 严格验证必需字段
  if (!server || !port) {
    throw new Error('Missing required fields: server or port');
  }

  // 服务器地址验证
  if (server.length === 0 || server.length > 253) {
    throw new Error(`Invalid server address length: ${server.length}`);
  }

  // IP地址或域名格式验证
  const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Pattern = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
  const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!ipv4Pattern.test(server) && !ipv6Pattern.test(server) && !domainPattern.test(server)) {
    throw new Error(`Invalid server address format: ${server}`);
  }

  // 端口验证
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${port}`);
  }

  // 密码验证
  if (password.length > 256) {
    throw new Error('Password too long (maximum 256 characters)');
  }

  const params = new URLSearchParams(urlObj.search);

  const node = {
    type: ProxyTypes.HYSTERIA,
    name: name,
    server: server,
    port: port,
    password: password,
    auth: password,
    protocol: params.get('protocol') || 'udp',
    obfs: params.get('obfs') || '',
    tls: {
      enabled: true, // Hysteria v1 默认使用 TLS
      serverName: params.get('peer') || params.get('sni') || server,
      alpn: params.get('alpn') ? params.get('alpn').split(',') : ['h3'],
      skipCertVerify: params.get('insecure') === '1'
    },
    bandwidth: {
      up: params.get('upmbps') || params.get('up') || '',
      down: params.get('downmbps') || params.get('down') || ''
    },
    fastOpen: params.get('fastopen') === '1',
    lazy: params.get('lazy') === '1'
  };

  // 使用统一验证器验证节点
  const nodeValidation = NodeValidator.validateNode(node, 'HYSTERIA');
  if (!nodeValidation.isValid) {
    throw new Error(`Node validation failed: ${nodeValidation.errors.join(', ')}`);
  }

  return node;
}

/**
 * 解析 Hysteria URL（带缓存和错误处理）
 * @param {string} url - Hysteria URL
 * @returns {Object|null} 解析后的节点信息
 */
export const parseHysteriaUrl = wrapWithCache(
  (url) => {
    try {
      return _parseHysteriaUrl(url);
    } catch (error) {
      return ParserErrorHandler.handleParseError('HYSTERIA', url, error);
    }
  },
  'hysteria',
  { maxSize: 500, ttl: 300000 } // 5分钟缓存
);

/**
 * 生成 Hysteria URL
 * @param {Object} node - 节点信息
 * @returns {string|null} Hysteria URL
 */
export function generateHysteriaUrl(node) {
  try {
    const params = new URLSearchParams();
    
    if (node.protocol && node.protocol !== 'udp') {
      params.set('protocol', node.protocol);
    }
    
    if (node.obfs) {
      params.set('obfs', node.obfs);
    }
    
    if (node.tls?.serverName && node.tls.serverName !== node.server) {
      params.set('peer', node.tls.serverName);
    }
    
    if (node.tls?.skipCertVerify) {
      params.set('insecure', '1');
    }
    
    if (node.tls?.alpn && node.tls.alpn.length > 0 && node.tls.alpn.join(',') !== 'h3') {
      params.set('alpn', node.tls.alpn.join(','));
    }
    
    if (node.bandwidth?.up) {
      params.set('upmbps', node.bandwidth.up);
    }
    
    if (node.bandwidth?.down) {
      params.set('downmbps', node.bandwidth.down);
    }
    
    if (node.fastOpen) {
      params.set('fastopen', '1');
    }
    
    if (node.lazy) {
      params.set('lazy', '1');
    }

    const queryString = params.toString();
    const auth = encodeURIComponent(node.password || node.auth || '');
    const name = encodeURIComponent(node.name);
    
    return `hysteria://${auth}@${node.server}:${node.port}${queryString ? '?' + queryString : ''}#${name}`;
  } catch (error) {
    console.error('生成 Hysteria URL 失败:', error);
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
    type: 'hysteria',
    server: node.server,
    port: node.port,
    password: node.password || node.auth,
    protocol: node.protocol || 'udp'
  };

  if (node.obfs) {
    clashNode.obfs = node.obfs;
  }

  if (node.tls?.serverName && node.tls.serverName !== node.server) {
    clashNode.sni = node.tls.serverName;
  }

  if (node.tls?.skipCertVerify) {
    clashNode['skip-cert-verify'] = true;
  }

  if (node.tls?.alpn && node.tls.alpn.length > 0) {
    clashNode.alpn = node.tls.alpn;
  }

  if (node.bandwidth?.up) {
    clashNode.up = node.bandwidth.up;
  }

  if (node.bandwidth?.down) {
    clashNode.down = node.bandwidth.down;
  }

  if (node.fastOpen) {
    clashNode['fast-open'] = true;
  }

  if (node.lazy) {
    clashNode.lazy = true;
  }

  return clashNode;
}

/**
 * 从 Clash 格式解析
 * @param {Object} clashNode - Clash 格式节点
 * @returns {Object} 标准节点格式
 */
export function fromClashFormat(clashNode) {
  return {
    type: ProxyTypes.HYSTERIA,
    name: clashNode.name,
    server: clashNode.server,
    port: clashNode.port,
    password: clashNode.password,
    auth: clashNode.password,
    protocol: clashNode.protocol || 'udp',
    obfs: clashNode.obfs || '',
    tls: {
      enabled: true,
      serverName: clashNode.sni || clashNode.server,
      alpn: clashNode.alpn || ['h3'],
      skipCertVerify: !!clashNode['skip-cert-verify']
    },
    bandwidth: {
      up: clashNode.up || '',
      down: clashNode.down || ''
    },
    fastOpen: !!clashNode['fast-open'],
    lazy: !!clashNode.lazy
  };
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
    (node.password || node.auth) &&
    node.port > 0 &&
    node.port < 65536
  );
}
