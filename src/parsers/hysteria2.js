/**
 * Hysteria2 协议解析器
 * 已优化：统一错误处理、验证机制、缓存支持
 */

import { ProxyTypes } from '../types.js';
import { smartUrlDecode } from '../utils/index.js';
import { ParserErrorHandler } from './common/error-handler.js';
import { NodeValidator } from './common/validator.js';
import { wrapWithCache } from './common/cache.js';
import { SafeIPValidator, SafeInputSanitizer } from '../utils/security.js';

// Hysteria2 协议默认配置常量
const HYSTERIA2_DEFAULTS = {
  ALPN: ['h3'],
  CONGESTION: 'bbr',
  TLS_ENABLED: true,
  MIN_PORT: 1,
  MAX_PORT: 65535
};

// 缓存正则表达式以提高性能
const PORT_RANGE_REGEX = /@([^:/?#]+):(\d+)(?:,[\d,-]+)/;

/**
 * 验证端口号是否有效
 * @param {string|number} portStr - 端口字符串或数字
 * @returns {number|null} 有效的端口号或null
 */
function validatePort(portStr) {
  const port = parseInt(portStr);
  return !isNaN(port) && port >= HYSTERIA2_DEFAULTS.MIN_PORT && port <= HYSTERIA2_DEFAULTS.MAX_PORT ? port : null;
}

/**
 * 处理端口范围格式的URL
 * 支持格式：port,port-port 或 port,port,port
 * @param {string} url - 原始URL
 * @returns {string} 处理后的URL
 */
function processPortRange(url) {
  const match = url.match(PORT_RANGE_REGEX);

  if (match) {
    const [fullMatch, host, mainPort] = match;
    // 验证主端口是否有效
    if (validatePort(mainPort)) {
      return url.replace(fullMatch, `@${host}:${mainPort}`);
    }
  }

  return url;
}

/**
 * 解析 Hysteria2 URL（内部实现）
 * 支持格式: hysteria2://password@server:port?params#name
 * @param {string} url - Hysteria2 URL
 * @returns {Object|null} 解析后的节点信息
 */
function _parseHysteria2Url(url) {
  // 严格输入验证
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid input: URL must be a non-empty string');
  }

  // 长度限制防止DoS攻击
  if (url.length > 2048) {
    throw new Error(`URL too long: ${url.length} > 2048`);
  }

  if (!url.startsWith('hysteria2://') && !url.startsWith('hy2://')) {
    throw new Error('Invalid protocol: URL must start with hysteria2:// or hy2://');
  }

  // 使用安全的输入清理器
  const sanitizedUrl = SafeInputSanitizer.sanitizeInput(url, {
    maxLength: 2048,
    removeControlChars: true,
    removeScriptTags: true
  });

  // 处理端口范围格式，如 32000,32000-33000
  const processedUrl = processPortRange(sanitizedUrl);

  let urlObj;
  try {
    urlObj = new URL(processedUrl);
  } catch (error) {
    throw new Error(`Invalid URL format: ${error.message}`);
  }

  // 提取基本信息
  const password = smartUrlDecode(urlObj.username);
  const server = urlObj.hostname;
  const port = validatePort(urlObj.port);

  // 严格验证必要字段
  if (!password || !server || !port) {
    throw new Error('Missing required fields: password, server, or port');
  }

  // 服务器地址验证
  if (server.length === 0 || server.length > 253) {
    throw new Error(`Invalid server address length: ${server.length}`);
  }

  // 使用安全的服务器地址验证
  const serverValidation = SafeIPValidator.validateIPv4(server);
  if (!serverValidation.isValid) {
    const ipv6Validation = SafeIPValidator.validateIPv6(server);
    if (!ipv6Validation.isValid) {
      // 尝试域名验证
      const domainValidation = NodeValidator.validateDomain(server);
      if (!domainValidation.isValid) {
        throw new Error(`Invalid server address format: ${server}`);
      }
    }
  }

  // 密码验证
  if (password.length < 1) {
    throw new Error('Password cannot be empty');
  }
  if (password.length > 256) {
    throw new Error('Password too long (maximum 256 characters)');
  }

  const name = urlObj.hash ? smartUrlDecode(urlObj.hash.slice(1)) : `${server}:${port}`;
  const params = new URLSearchParams(urlObj.search);

  // 构建节点对象
  const node = {
    type: ProxyTypes.HYSTERIA2,
    name,
    server: server.trim(),
    port,
    password,
    auth: password, // Hysteria2 使用 auth 字段
    obfs: {
      type: params.get('obfs') || '',
      password: params.get('obfs-password') || ''
    },
    tls: {
      enabled: HYSTERIA2_DEFAULTS.TLS_ENABLED,
      serverName: params.get('sni') || params.get('peer') || server,
      alpn: params.get('alpn') ? params.get('alpn').split(',').map(s => s.trim()) : [...HYSTERIA2_DEFAULTS.ALPN],
      skipCertVerify: params.get('insecure') === '1'
    },
    bandwidth: {
      up: params.get('up') || '',
      down: params.get('down') || ''
    },
    congestion: params.get('congestion') || HYSTERIA2_DEFAULTS.CONGESTION,
    fastOpen: params.get('fastopen') === '1',
    lazy: params.get('lazy') === '1'
  };

  // 使用统一验证器验证节点
  const validation = NodeValidator.validateNode(node, 'HYSTERIA2');
  if (!validation.isValid) {
    throw new Error(`Node validation failed: ${validation.errors.join(', ')}`);
  }

  return node;
}

/**
 * 解析 Hysteria2 URL（带缓存和错误处理）
 * @param {string} url - Hysteria2 URL
 * @returns {Object|null} 解析后的节点信息
 */
export const parseHysteria2Url = wrapWithCache(
  (url) => {
    try {
      return _parseHysteria2Url(url);
    } catch (error) {
      return ParserErrorHandler.handleParseError('HYSTERIA2', url, error);
    }
  },
  'hysteria2',
  { maxSize: 500, ttl: 300000 } // 5分钟缓存
);

/**
 * 生成 Hysteria2 URL
 * @param {Object} node - 节点信息
 * @returns {string|null} Hysteria2 URL
 */
export function generateHysteria2Url(node) {
  try {
    // 验证节点
    const validation = NodeValidator.validateNode(node, 'HYSTERIA2');
    if (!validation.isValid) {
      throw new Error(`Invalid node: ${validation.errors.join(', ')}`);
    }

    const password = node.password || node.auth;
    const url = new URL(`hysteria2://${encodeURIComponent(password)}@${node.server}:${node.port}`);
    const params = new URLSearchParams();

    // 混淆配置
    if (node.obfs?.type) {
      params.set('obfs', node.obfs.type);
      if (node.obfs.password) {
        params.set('obfs-password', node.obfs.password);
      }
    }

    // TLS 配置
    if (node.tls) {
      if (node.tls.serverName && node.tls.serverName !== node.server) {
        params.set('sni', node.tls.serverName);
      }
      if (node.tls.alpn?.length && node.tls.alpn.join(',') !== HYSTERIA2_DEFAULTS.ALPN.join(',')) {
        params.set('alpn', node.tls.alpn.join(','));
      }
      if (node.tls.skipCertVerify) {
        params.set('insecure', '1');
      }
    }

    // 带宽配置
    if (node.bandwidth?.up) params.set('up', node.bandwidth.up);
    if (node.bandwidth?.down) params.set('down', node.bandwidth.down);

    // 其他配置
    if (node.congestion && node.congestion !== HYSTERIA2_DEFAULTS.CONGESTION) {
      params.set('congestion', node.congestion);
    }
    if (node.fastOpen) params.set('fastopen', '1');
    if (node.lazy) params.set('lazy', '1');

    if (params.toString()) {
      url.search = params.toString();
    }
    url.hash = encodeURIComponent(node.name || `${node.server}:${node.port}`);

    return url.toString();
  } catch (error) {
    return ParserErrorHandler.handleConversionError('HYSTERIA2', 'generate', node, error);
  }
}

/**
 * 转换为 Clash 格式
 * @param {Object} node - 节点信息
 * @returns {Object|null} Clash 格式节点
 */
export function toClashFormat(node) {
  try {
    // 验证节点
    const validation = NodeValidator.validateNode(node, 'HYSTERIA2');
    if (!validation.isValid) {
      throw new Error(`Invalid node: ${validation.errors.join(', ')}`);
    }

    const clashNode = {
      name: node.name || `${node.server}:${node.port}`,
      type: 'hysteria2',
      server: node.server,
      port: node.port,
      password: node.password || node.auth
    };

    // 混淆配置
    if (node.obfs?.type) {
      clashNode.obfs = node.obfs.type;
      if (node.obfs.password) {
        clashNode['obfs-password'] = node.obfs.password;
      }
    }

    // TLS 配置
    if (node.tls) {
      if (node.tls.serverName) {
        clashNode.sni = node.tls.serverName;
      }
      if (node.tls.alpn?.length) {
        clashNode.alpn = [...node.tls.alpn]; // 创建副本避免引用问题
      }
      if (node.tls.skipCertVerify) {
        clashNode['skip-cert-verify'] = true;
      }
    }

    // 带宽配置
    if (node.bandwidth?.up) clashNode.up = node.bandwidth.up;
    if (node.bandwidth?.down) clashNode.down = node.bandwidth.down;

    // 其他配置
    if (node.congestion) clashNode.congestion = node.congestion;
    if (node.fastOpen) clashNode['fast-open'] = true;
    if (node.lazy) clashNode.lazy = true;

    return clashNode;
  } catch (error) {
    return ParserErrorHandler.handleConversionError('HYSTERIA2', 'toClash', node, error);
  }
}

/**
 * 从 Clash 格式解析
 * @param {Object} clashNode - Clash 格式节点
 * @returns {Object|null} 标准节点格式
 */
export function fromClashFormat(clashNode) {
  try {
    if (!clashNode || typeof clashNode !== 'object') {
      throw new Error('Invalid Clash node: must be an object');
    }

    const node = {
      type: ProxyTypes.HYSTERIA2,
      name: clashNode.name || `${clashNode.server}:${clashNode.port}`,
      server: clashNode.server,
      port: clashNode.port,
      password: clashNode.password,
      auth: clashNode.password,
      obfs: {
        type: clashNode.obfs || '',
        password: clashNode['obfs-password'] || ''
      },
      tls: {
        enabled: HYSTERIA2_DEFAULTS.TLS_ENABLED,
        serverName: clashNode.sni || clashNode.server,
        alpn: clashNode.alpn ? [...clashNode.alpn] : [...HYSTERIA2_DEFAULTS.ALPN],
        skipCertVerify: !!clashNode['skip-cert-verify']
      },
      bandwidth: {
        up: clashNode.up || '',
        down: clashNode.down || ''
      },
      congestion: clashNode.congestion || HYSTERIA2_DEFAULTS.CONGESTION,
      fastOpen: !!clashNode['fast-open'],
      lazy: !!clashNode.lazy
    };

    // 验证解析结果
    const validation = NodeValidator.validateNode(node, 'HYSTERIA2');
    if (!validation.isValid) {
      throw new Error(`Node validation failed: ${validation.errors.join(', ')}`);
    }

    return node;
  } catch (error) {
    return ParserErrorHandler.handleConversionError('HYSTERIA2', 'fromClash', clashNode, error);
  }
}

/**
 * 验证节点配置（使用统一验证器）
 * @param {Object} node - 节点信息
 * @returns {boolean} 是否有效
 */
export function validateNode(node) {
  try {
    const validation = NodeValidator.validateNode(node, 'HYSTERIA2');
    return validation.isValid;
  } catch (error) {
    ParserErrorHandler.handleValidationError('HYSTERIA2', node, error.message);
    return false;
  }
}
