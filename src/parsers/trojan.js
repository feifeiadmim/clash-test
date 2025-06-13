/**
 * Trojan 协议解析器
 * 已优化：统一错误处理、验证机制、缓存支持、传输层处理统一化
 */

import { ProxyTypes } from '../types.js';
import { smartUrlDecode } from '../utils/index.js';
import { ParserErrorHandler } from './common/error-handler.js';
import { NodeValidator } from './common/validator.js';
import { wrapWithCache } from './common/cache.js';
import { TransportHandler } from './common/transport-handler.js';
import { SafeRegexTester, SafeIPValidator, SafeInputSanitizer } from '../utils/security.js';

/**
 * 解析 Trojan URL（内部实现）
 * 支持格式: trojan://password@server:port?params#name
 * @param {string} url - Trojan URL
 * @returns {Object|null} 解析后的节点信息
 */
function _parseTrojanUrl(url) {
  // 严格输入验证
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid input: URL must be a non-empty string');
  }

  // 长度限制防止DoS攻击
  if (url.length > 2048) {
    throw new Error(`URL too long: ${url.length} > 2048`);
  }

  if (!url.startsWith('trojan://')) {
    throw new Error('Invalid protocol: URL must start with trojan://');
  }

  // 使用安全的输入清理器
  const sanitizedUrl = SafeInputSanitizer.sanitizeInput(url, {
    maxLength: 2048,
    removeControlChars: true,
    removeScriptTags: true
  });

  // 基本URL格式验证（使用简单检查）
  if (!sanitizedUrl.startsWith('trojan://')) {
    throw new Error('Invalid URL format');
  }

  let urlObj;
  try {
    urlObj = new URL(sanitizedUrl);
  } catch (error) {
    throw new Error(`Invalid URL format: ${error.message}`);
  }

  const password = smartUrlDecode(urlObj.username);
  const server = urlObj.hostname;
  const port = parseInt(urlObj.port);
  const name = urlObj.hash ? smartUrlDecode(urlObj.hash.slice(1)) : `${server}:${port}`;

  // 严格验证必需字段
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

  // 端口验证
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${port}`);
  }

  // 密码强度验证
  if (password.length < 6) {
    throw new Error('Password too short (minimum 6 characters)');
  }
  if (password.length > 256) {
    throw new Error('Password too long (maximum 256 characters)');
  }

  const params = new URLSearchParams(urlObj.search);

  // 构建节点对象
  const node = {
    type: ProxyTypes.TROJAN,
    name: name,
    server: server.trim(),
    port: port,
    password: password,
    network: params.get('type') || 'tcp',
    tls: {
      enabled: true, // Trojan 默认使用 TLS
      serverName: params.get('sni') || server,
      alpn: params.get('alpn') ? params.get('alpn').split(',').map(s => s.trim()) : [],
      fingerprint: params.get('fp') || '',
      skipCertVerify: params.get('allowInsecure') === '1'
    }
  };

  // 使用统一传输层处理器
  const transport = TransportHandler.parseTransportParams(params, node.network, 'url');
  if (Object.keys(transport).length > 0) {
    node.transport = transport;
  }

  // 使用统一验证器验证节点
  const validation = NodeValidator.validateNode(node, 'TROJAN');
  if (!validation.isValid) {
    throw new Error(`Node validation failed: ${validation.errors.join(', ')}`);
  }

  return node;
}

/**
 * 解析 Trojan URL（带缓存和错误处理）
 * @param {string} url - Trojan URL
 * @returns {Object|null} 解析后的节点信息
 */
export const parseTrojanUrl = wrapWithCache(
  (url) => {
    try {
      return _parseTrojanUrl(url);
    } catch (error) {
      return ParserErrorHandler.handleParseError('TROJAN', url, error);
    }
  },
  'trojan',
  { maxSize: 500, ttl: 300000 } // 5分钟缓存
);

/**
 * 生成 Trojan URL
 * @param {Object} node - 节点信息
 * @returns {string|null} Trojan URL
 */
export function generateTrojanUrl(node) {
  try {
    // 验证节点
    const validation = NodeValidator.validateNode(node, 'TROJAN');
    if (!validation.isValid) {
      throw new Error(`Invalid node: ${validation.errors.join(', ')}`);
    }

    const url = new URL(`trojan://${encodeURIComponent(node.password)}@${node.server}:${node.port}`);
    const params = new URLSearchParams();

    if (node.network && node.network !== 'tcp') {
      params.set('type', node.network);
    }

    // TLS 配置
    if (node.tls) {
      if (node.tls.serverName && node.tls.serverName !== node.server) {
        params.set('sni', node.tls.serverName);
      }
      if (node.tls.alpn?.length) {
        params.set('alpn', node.tls.alpn.join(','));
      }
      if (node.tls.fingerprint) {
        params.set('fp', node.tls.fingerprint);
      }
      if (node.tls.skipCertVerify) {
        params.set('allowInsecure', '1');
      }
    }

    // 使用统一传输层处理器添加传输参数
    TransportHandler.addTransportParams(params, node);

    if (params.toString()) {
      url.search = params.toString();
    }
    url.hash = encodeURIComponent(node.name || `${node.server}:${node.port}`);

    return url.toString();
  } catch (error) {
    return ParserErrorHandler.handleConversionError('TROJAN', 'generate', node, error);
  }
}

/**
 * 转换为 Clash 格式
 * @param {Object} node - 节点信息
 * @returns {Object} Clash 格式节点
 */
export function toClashFormat(node) {
  try {
    // 验证节点
    const validation = NodeValidator.validateNode(node, 'TROJAN');
    if (!validation.isValid) {
      throw new Error(`Invalid node: ${validation.errors.join(', ')}`);
    }

    const clashNode = {
      name: node.name || `${node.server}:${node.port}`,
      type: 'trojan',
      server: node.server,
      port: node.port,
      password: node.password,
      network: node.network || 'tcp'
    };

    // TLS 配置
    if (node.tls) {
      if (node.tls.serverName) {
        clashNode.sni = node.tls.serverName;
      }
      if (node.tls.alpn?.length) {
        clashNode.alpn = node.tls.alpn;
      }
      if (node.tls.fingerprint) {
        clashNode['client-fingerprint'] = node.tls.fingerprint;
      }
      if (node.tls.skipCertVerify) {
        clashNode['skip-cert-verify'] = true;
      }
    }

    // 使用统一传输层处理器生成Clash配置
    if (node.transport && node.network !== 'tcp') {
      const clashTransport = TransportHandler.toClashFormat(node);
      Object.assign(clashNode, clashTransport);
    }

    return clashNode;
  } catch (error) {
    return ParserErrorHandler.handleConversionError('TROJAN', 'toClash', node, error);
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
      type: ProxyTypes.TROJAN,
      name: clashNode.name || `${clashNode.server}:${clashNode.port}`,
      server: clashNode.server,
      port: clashNode.port,
      password: clashNode.password,
      network: clashNode.network || 'tcp',
      tls: {
        enabled: true,
        serverName: clashNode.sni || clashNode.server,
        alpn: clashNode.alpn || [],
        fingerprint: clashNode['client-fingerprint'] || '',
        skipCertVerify: !!clashNode['skip-cert-verify']
      }
    };

    // 使用统一传输层处理器解析传输配置
    if (node.network !== 'tcp') {
      const transport = TransportHandler.fromClashFormat(clashNode, node.network);
      if (Object.keys(transport).length > 0) {
        node.transport = transport;
      }
    }

    // 验证解析结果
    const validation = NodeValidator.validateNode(node, 'TROJAN');
    if (!validation.isValid) {
      throw new Error(`Node validation failed: ${validation.errors.join(', ')}`);
    }

    return node;
  } catch (error) {
    return ParserErrorHandler.handleConversionError('TROJAN', 'fromClash', clashNode, error);
  }
}

/**
 * 验证节点配置（使用统一验证器）
 * @param {Object} node - 节点信息
 * @returns {boolean} 是否有效
 */
export function validateNode(node) {
  try {
    const validation = NodeValidator.validateNode(node, 'TROJAN');
    return validation.isValid;
  } catch (error) {
    ParserErrorHandler.handleValidationError('TROJAN', node, error.message);
    return false;
  }
}
