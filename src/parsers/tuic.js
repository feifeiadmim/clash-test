/**
 * TUIC 协议解析器
 * 已加强：严格输入验证、错误处理、安全检查
 */

import { ProxyTypes } from '../types.js';
import { smartUrlDecode } from '../utils/index.js';
import { ParserErrorHandler } from './common/error-handler.js';
import { NodeValidator } from './common/validator.js';
import { wrapWithCache } from './common/cache.js';
import { SafeIPValidator, SafeInputSanitizer, SafeUUIDGenerator } from '../utils/security.js';

/**
 * TUIC输入安全校验函数
 * @param {string} url - TUIC URL
 * @returns {Object} 校验结果 {isValid: boolean, error?: string}
 */
function validateTuicInput(url) {
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
    if (!url.startsWith('tuic://')) {
      return { isValid: false, error: 'Invalid protocol: URL must start with tuic://' };
    }

    // 使用安全的输入清理器检查危险字符
    const sanitizedUrl = SafeInputSanitizer.sanitizeInput(url, {
      maxLength: 2048,
      removeControlChars: true,
      removeScriptTags: true
    });

    if (sanitizedUrl !== url) {
      return { isValid: false, error: 'URL contains dangerous characters' };
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: `Validation error: ${error.message}` };
  }
}

/**
 * 解析 TUIC URL（内部实现）
 * @param {string} url - TUIC URL
 * @returns {Object|null} 解析后的节点信息
 */
function _parseTuicUrl(url) {
  // 使用安全校验函数
  const validation = validateTuicInput(url);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const urlObj = new URL(url);

  if (urlObj.protocol !== 'tuic:') {
    throw new Error('Invalid protocol: expected tuic://');
  }

  const server = urlObj.hostname;
  const port = parseInt(urlObj.port) || 443;
  const uuid = smartUrlDecode(urlObj.username) || '';
  const password = smartUrlDecode(urlObj.password) || '';
  const name = smartUrlDecode(urlObj.hash.slice(1)) || `${server}:${port}`;

  // 严格验证必需字段
  if (!server || !port || !uuid || !password) {
    throw new Error('Missing required fields: server, port, uuid, or password');
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

  // 安全的UUID格式验证
  if (!SafeUUIDGenerator.validateUUID(uuid.trim())) {
    throw new Error(`Invalid UUID format: ${uuid}`);
  }

  // 密码验证
  if (password.length < 1) {
    throw new Error('Password cannot be empty');
  }
  if (password.length > 256) {
    throw new Error('Password too long (maximum 256 characters)');
  }

  const params = new URLSearchParams(urlObj.search);

  const node = {
    type: ProxyTypes.TUIC,
    name: name,
    server: server,
    port: port,
    uuid: uuid,
    password: password,
    version: parseInt(params.get('version')) || 5,
    congestion: params.get('congestion_control') || params.get('congestion') || 'cubic',
    udpRelayMode: params.get('udp_relay_mode') || 'native',
    alpn: params.get('alpn') ? params.get('alpn').split(',') : ['h3'],
    tls: {
      enabled: true, // TUIC 默认使用 TLS
      serverName: params.get('sni') || params.get('peer') || server,
      skipCertVerify: params.get('allow_insecure') === '1' || params.get('insecure') === '1',
      disableSni: params.get('disable_sni') === '1'
    },
    heartbeat: params.get('heartbeat_interval') || '',
    reduceRtt: params.get('reduce_rtt') === '1'
  };

  // 使用统一验证器验证节点
  const nodeValidation = NodeValidator.validateNode(node, 'TUIC');
  if (!nodeValidation.isValid) {
    throw new Error(`Node validation failed: ${nodeValidation.errors.join(', ')}`);
  }

  return node;
}

/**
 * 解析 TUIC URL（带缓存和错误处理）
 * @param {string} url - TUIC URL
 * @returns {Object|null} 解析后的节点信息
 */
export const parseTuicUrl = wrapWithCache(
  (url) => {
    try {
      return _parseTuicUrl(url);
    } catch (error) {
      return ParserErrorHandler.handleParseError('TUIC', url, error);
    }
  },
  'tuic',
  { maxSize: 500, ttl: 300000 } // 5分钟缓存
);

/**
 * 生成 TUIC URL
 * @param {Object} node - 节点信息
 * @returns {string|null} TUIC URL
 */
export function generateTuicUrl(node) {
  try {
    const params = new URLSearchParams();
    
    if (node.version && node.version !== 5) {
      params.set('version', node.version.toString());
    }
    
    if (node.congestion && node.congestion !== 'cubic') {
      params.set('congestion_control', node.congestion);
    }
    
    if (node.udpRelayMode && node.udpRelayMode !== 'native') {
      params.set('udp_relay_mode', node.udpRelayMode);
    }
    
    if (node.alpn && node.alpn.length > 0 && node.alpn.join(',') !== 'h3') {
      params.set('alpn', node.alpn.join(','));
    }
    
    if (node.tls?.serverName && node.tls.serverName !== node.server) {
      params.set('sni', node.tls.serverName);
    }
    
    if (node.tls?.skipCertVerify) {
      params.set('allow_insecure', '1');
    }
    
    if (node.tls?.disableSni) {
      params.set('disable_sni', '1');
    }
    
    if (node.heartbeat) {
      params.set('heartbeat_interval', node.heartbeat);
    }
    
    if (node.reduceRtt) {
      params.set('reduce_rtt', '1');
    }

    const queryString = params.toString();
    const auth = `${encodeURIComponent(node.uuid)}:${encodeURIComponent(node.password)}`;
    const name = encodeURIComponent(node.name);
    
    return `tuic://${auth}@${node.server}:${node.port}${queryString ? '?' + queryString : ''}#${name}`;
  } catch (error) {
    console.error('生成 TUIC URL 失败:', error);
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
    type: 'tuic',
    server: node.server,
    port: node.port,
    uuid: node.uuid,
    password: node.password,
    version: node.version || 5
  };

  if (node.congestion && node.congestion !== 'cubic') {
    clashNode['congestion-controller'] = node.congestion;
  }

  if (node.udpRelayMode && node.udpRelayMode !== 'native') {
    clashNode['udp-relay-mode'] = node.udpRelayMode;
  }

  if (node.alpn && node.alpn.length > 0) {
    clashNode.alpn = node.alpn;
  }

  if (node.tls?.serverName && node.tls.serverName !== node.server) {
    clashNode.sni = node.tls.serverName;
  }

  if (node.tls?.skipCertVerify) {
    clashNode['skip-cert-verify'] = true;
  }

  if (node.tls?.disableSni) {
    clashNode['disable-sni'] = true;
  }

  if (node.heartbeat) {
    clashNode['heartbeat-interval'] = node.heartbeat;
  }

  if (node.reduceRtt) {
    clashNode['reduce-rtt'] = true;
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
    type: ProxyTypes.TUIC,
    name: clashNode.name,
    server: clashNode.server,
    port: clashNode.port,
    uuid: clashNode.uuid,
    password: clashNode.password,
    version: clashNode.version || 5,
    congestion: clashNode['congestion-controller'] || 'cubic',
    udpRelayMode: clashNode['udp-relay-mode'] || 'native',
    alpn: clashNode.alpn || ['h3'],
    tls: {
      enabled: true,
      serverName: clashNode.sni || clashNode.server,
      skipCertVerify: !!clashNode['skip-cert-verify'],
      disableSni: !!clashNode['disable-sni']
    },
    heartbeat: clashNode['heartbeat-interval'] || '',
    reduceRtt: !!clashNode['reduce-rtt']
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
    node.uuid &&
    node.password &&
    node.port > 0 &&
    node.port < 65536
  );
}
