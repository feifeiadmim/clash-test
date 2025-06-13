/**
 * VLESS 协议解析器
 * 已优化：统一错误处理、验证机制、缓存支持、传输层处理统一化
 */

import { ProxyTypes } from '../types.js';
import { ParserErrorHandler } from './common/error-handler.js';
import { NodeValidator } from './common/validator.js';
import { wrapWithCache } from './common/cache.js';
import { TransportHandler } from './common/transport-handler.js';
import { SafeIPValidator, SafeInputSanitizer, SafeUUIDGenerator } from '../utils/security.js';

/**
 * 解析 VLESS URL（内部实现）
 * 支持格式: vless://uuid@server:port?params#name
 * @param {string} url - VLESS URL
 * @returns {Object|null} 解析后的节点信息
 */
function _parseVLESSUrl(url) {
  // 严格输入验证
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid input: URL must be a non-empty string');
  }

  // 长度限制防止DoS攻击
  if (url.length > 2048) {
    throw new Error(`URL too long: ${url.length} > 2048`);
  }

  if (!url.startsWith('vless://')) {
    throw new Error('Invalid protocol: URL must start with vless://');
  }

  // 使用安全的输入清理器
  const sanitizedUrl = SafeInputSanitizer.sanitizeInput(url, {
    maxLength: 2048,
    removeControlChars: true,
    removeScriptTags: true
  });

  let urlObj;
  try {
    urlObj = new URL(sanitizedUrl);
  } catch (error) {
    throw new Error(`Invalid URL format: ${error.message}`);
  }

  const uuid = urlObj.username;
  const server = urlObj.hostname;
  const port = parseInt(urlObj.port);
  const name = urlObj.hash ? decodeURIComponent(urlObj.hash.slice(1)) : `${server}:${port}`;

  // 严格验证必需字段
  if (!uuid || !server || !port) {
    throw new Error('Missing required fields: uuid, server, or port');
  }

  // 安全的UUID格式验证
  if (!SafeUUIDGenerator.validateUUID(uuid.trim())) {
    throw new Error(`Invalid UUID format: ${uuid}`);
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

  const params = new URLSearchParams(urlObj.search);

  // 构建节点对象
  const node = {
    type: ProxyTypes.VLESS,
    name: name,
    server: server.trim(),
    port: port,
    uuid: uuid.trim(),
    flow: params.get('flow') || '',
    encryption: params.get('encryption') || 'none',
    network: params.get('type') || 'tcp',
    tls: {
      enabled: params.get('security') === 'tls' || params.get('security') === 'reality',
      serverName: params.get('sni') || '',
      alpn: params.get('alpn') ? params.get('alpn').split(',').map(s => s.trim()) : [],
      fingerprint: params.get('fp') || ''
    }
  };

  // 使用统一传输层处理器
  const transport = TransportHandler.parseTransportParams(params, node.network, 'url');
  if (Object.keys(transport).length > 0) {
    node.transport = transport;
  }

  // 解析Reality配置
  node.reality = {
    enabled: params.get('security') === 'reality',
    publicKey: params.get('pbk') || '',
    shortId: params.get('sid') || '',
    spiderX: params.get('spx') || ''
  };

  // 使用统一验证器验证节点
  const validation = NodeValidator.validateNode(node, 'VLESS');
  if (!validation.isValid) {
    throw new Error(`Node validation failed: ${validation.errors.join(', ')}`);
  }

  return node;
}

/**
 * 解析 VLESS URL（带缓存和错误处理）
 * @param {string} url - VLESS URL
 * @returns {Object|null} 解析后的节点信息
 */
export const parseVLESSUrl = wrapWithCache(
  (url) => {
    try {
      return _parseVLESSUrl(url);
    } catch (error) {
      return ParserErrorHandler.handleParseError('VLESS', url, error);
    }
  },
  'vless',
  { maxSize: 500, ttl: 300000 } // 5分钟缓存
);

/**
 * 生成 VLESS URL
 * @param {Object} node - 节点信息
 * @returns {string|null} VLESS URL
 */
export function generateVLESSUrl(node) {
  try {
    // 验证节点
    const validation = NodeValidator.validateNode(node, 'VLESS');
    if (!validation.isValid) {
      throw new Error(`Invalid node: ${validation.errors.join(', ')}`);
    }

    const url = new URL(`vless://${node.uuid}@${node.server}:${node.port}`);
    const params = new URLSearchParams();

    if (node.flow) params.set('flow', node.flow);
    if (node.encryption && node.encryption !== 'none') params.set('encryption', node.encryption);
    if (node.network && node.network !== 'tcp') params.set('type', node.network);

    // TLS 配置
    if (node.tls?.enabled) {
      if (node.reality?.enabled) {
        params.set('security', 'reality');
        if (node.reality.publicKey) params.set('pbk', node.reality.publicKey);
        if (node.reality.shortId) params.set('sid', node.reality.shortId);
        if (node.reality.spiderX) params.set('spx', node.reality.spiderX);
      } else {
        params.set('security', 'tls');
      }

      if (node.tls.serverName) params.set('sni', node.tls.serverName);
      if (node.tls.alpn?.length) params.set('alpn', node.tls.alpn.join(','));
      if (node.tls.fingerprint) params.set('fp', node.tls.fingerprint);
    }

    // 使用统一传输层处理器添加传输参数
    TransportHandler.addTransportParams(params, node);

    url.search = params.toString();
    url.hash = encodeURIComponent(node.name || `${node.server}:${node.port}`);

    return url.toString();
  } catch (error) {
    return ParserErrorHandler.handleConversionError('VLESS', 'generate', node, error);
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
    const validation = NodeValidator.validateNode(node, 'VLESS');
    if (!validation.isValid) {
      throw new Error(`Invalid node: ${validation.errors.join(', ')}`);
    }

    const clashNode = {
      name: node.name || `${node.server}:${node.port}`,
      type: 'vless',
      server: node.server,
      port: node.port,
      uuid: node.uuid,
      network: node.network || 'tcp',
      flow: node.flow || ''
    };

    // TLS 配置
    if (node.tls?.enabled) {
      clashNode.tls = true;
      if (node.tls.serverName) {
        clashNode.servername = node.tls.serverName;
      }
      if (node.tls.alpn?.length) {
        clashNode.alpn = node.tls.alpn;
      }
      if (node.tls.fingerprint) {
        clashNode['client-fingerprint'] = node.tls.fingerprint;
      }
    }

    // Reality 配置
    if (node.reality?.enabled) {
      clashNode.reality = {
        enabled: true,
        'public-key': node.reality.publicKey,
        'short-id': node.reality.shortId
      };
    }

    // 使用统一传输层处理器生成Clash配置
    if (node.transport && node.network !== 'tcp') {
      const clashTransport = TransportHandler.toClashFormat(node);
      Object.assign(clashNode, clashTransport);
    }

    return clashNode;
  } catch (error) {
    return ParserErrorHandler.handleConversionError('VLESS', 'toClash', node, error);
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

    // 验证并处理UUID
    let uuid = clashNode.uuid;
    if (!uuid || uuid === null || uuid === undefined) {
      throw new Error(`VLESS node "${clashNode.name}" missing required uuid field`);
    }

    // 检查UUID格式，如果不是标准UUID格式，尝试生成一个有效的UUID
    if (!SafeUUIDGenerator.validateUUID(uuid)) {
      // 对于非标准UUID（如"TELEGRAM-NUFiLTER"），生成一个基于原值的确定性UUID
      const hash = uuid.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);

      // 生成一个确定性的UUID
      const hashStr = Math.abs(hash).toString(16).padStart(8, '0');
      uuid = `${hashStr.slice(0, 8)}-${hashStr.slice(0, 4)}-4${hashStr.slice(1, 4)}-8${hashStr.slice(2, 5)}-${hashStr.slice(0, 12).padEnd(12, '0')}`;

      console.warn(`⚠️ 非标准UUID "${clashNode.uuid}" 已转换为标准格式: ${uuid}`);
    }

    const node = {
      type: ProxyTypes.VLESS,
      name: clashNode.name || `${clashNode.server}:${clashNode.port}`,
      server: clashNode.server,
      port: clashNode.port,
      uuid: uuid,
      flow: clashNode.flow || '',
      encryption: 'none',
      network: clashNode.network || 'tcp',
      tls: {
        enabled: !!clashNode.tls,
        serverName: clashNode.servername || '',
        alpn: clashNode.alpn || [],
        fingerprint: clashNode['client-fingerprint'] || ''
      },
      reality: {
        enabled: !!clashNode.reality?.enabled,
        publicKey: clashNode.reality?.['public-key'] || '',
        shortId: clashNode.reality?.['short-id'] || ''
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
    const validation = NodeValidator.validateNode(node, 'VLESS');
    if (!validation.isValid) {
      throw new Error(`Node validation failed: ${validation.errors.join(', ')}`);
    }

    return node;
  } catch (error) {
    return ParserErrorHandler.handleConversionError('VLESS', 'fromClash', clashNode, error);
  }
}

/**
 * 验证节点配置（使用统一验证器）
 * @param {Object} node - 节点信息
 * @returns {boolean} 是否有效
 */
export function validateNode(node) {
  try {
    const validation = NodeValidator.validateNode(node, 'VLESS');
    return validation.isValid;
  } catch (error) {
    ParserErrorHandler.handleValidationError('VLESS', node, error.message);
    return false;
  }
}
