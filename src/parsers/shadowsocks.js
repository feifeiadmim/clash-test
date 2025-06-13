/**
 * Shadowsocks 协议解析器
 * 已优化：统一错误处理、验证机制、缓存支持
 */

import { ProxyTypes } from '../types.js';
import { smartUrlDecode, safeBtoa, safeAtob } from '../utils/index.js';
import { ParserErrorHandler } from './common/error-handler.js';
import { NodeValidator } from './common/validator.js';
import { wrapWithCache } from './common/cache.js';
import { SafeRegexTester, SafeIPValidator, SafeInputSanitizer } from '../utils/security.js';

/**
 * 解析 Shadowsocks URL（内部实现）
 * 支持格式: ss://base64(method:password)@server:port#name
 * 或: ss://method:password@server:port#name
 * @param {string} url - SS URL
 * @returns {Object|null} 解析后的节点信息
 */
function _parseShadowsocksUrl(url) {
  // 严格输入验证
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid input: URL must be a non-empty string');
  }

  // 长度限制防止DoS攻击
  if (url.length > 2048) {
    throw new Error(`URL too long: ${url.length} > 2048`);
  }

  // 协议验证
  if (!url.startsWith('ss://')) {
    throw new Error('Invalid protocol: URL must start with ss://');
  }

  // 使用安全的输入清理器
  const sanitizedUrl = SafeInputSanitizer.sanitizeInput(url, {
    maxLength: 2048,
    removeControlChars: true,
    removeScriptTags: true
  });

  // 基本URL格式验证（使用简单检查）
  if (!sanitizedUrl.startsWith('ss://')) {
    throw new Error('Invalid URL format');
  }

  // 检查URL长度和基本字符
  if (sanitizedUrl.length < 10 || sanitizedUrl.length > 2048) {
    throw new Error('Invalid URL length');
  }

    // 移除协议前缀
    const content = sanitizedUrl.slice(5);

    // 分离名称部分
    const [mainPart, name] = content.split('#');

    let server, port, method, password;

    // 检查是否为base64编码格式
    if (mainPart.includes('@')) {
      // 格式: method:password@server:port 或 base64@server:port
      const [authPart, serverPart] = mainPart.split('@');
      [server, port] = serverPart.split(':');

      // 尝试base64解码
      let decoded = null;
      try {
        decoded = safeAtob(authPart);
      } catch (e) {
        // 解码失败，按普通格式处理
        decoded = null;
      }

      if (decoded && decoded.includes(':')) {
        // 使用正则表达式精确分割，避免密码中包含冒号的问题
        const match = decoded.match(/^([^:]+):(.+)$/);
        if (match) {
          [, method, password] = match;
          // 对密码进行URL解码
          password = smartUrlDecode(password);
        } else {
          return null;
        }
      } else {
        // 非base64格式或解码失败，直接分割原始authPart
        const colonIndex = authPart.indexOf(':');
        if (colonIndex === -1) {
          return null;
        }
        method = authPart.substring(0, colonIndex);
        password = smartUrlDecode(authPart.substring(colonIndex + 1));
      }
    } else {
      // 完全base64编码格式
      let decoded = null;
      try {
        decoded = safeAtob(mainPart);
      } catch (e) {
        return null;
      }

      if (decoded) {
        // 使用更精确的正则表达式，避免密码中特殊字符的问题
        const match = decoded.match(/^([^:]+):(.+)@([^:]+):(\d+)$/);
        if (match) {
          [, method, password, server, port] = match;
          // 对密码进行URL解码
          password = smartUrlDecode(password);
        } else {
          return null;
        }
      } else {
        return null;
      }
    }

  // 严格验证解析结果
  if (!server || !port || !method || (password === undefined || password === null || (typeof password === 'string' && password.trim() === ''))) {
    throw new Error(`Missing required fields: server=${!!server}, port=${!!port}, method=${!!method}, password=${password !== undefined && password !== null && (typeof password !== 'string' || password.trim() !== '')}`);
  }

  // 服务器地址验证
  server = server.trim();
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
  const portNum = parseInt(port);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    throw new Error(`Invalid port number: ${port}`);
  }

  // 加密方法验证
  const validMethods = [
    'aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm',
    'aes-128-cfb', 'aes-192-cfb', 'aes-256-cfb',
    'aes-128-ctr', 'aes-192-ctr', 'aes-256-ctr',
    'chacha20-ietf-poly1305', 'xchacha20-ietf-poly1305',
    'chacha20-ietf', 'chacha20', 'salsa20', 'rc4-md5'
  ];

  method = method.trim().toLowerCase();
  if (!validMethods.includes(method)) {
    throw new Error(`Unsupported encryption method: ${method}`);
  }

  // 密码强度验证
  if (typeof password === 'string') {
    if (password.length < 6) {
      throw new Error('Password too short (minimum 6 characters)');
    }
    if (password.length > 256) {
      throw new Error('Password too long (maximum 256 characters)');
    }
  }

  // 构建节点对象
  let nodeName = name ? smartUrlDecode(name) : `${server}:${portNum}`;

  // 节点名称验证和清理
  if (nodeName.length > 100) {
    nodeName = nodeName.substring(0, 100);
  }

  // 移除危险字符
  nodeName = nodeName.replace(/[<>:"'&]/g, '');

  const node = {
    type: ProxyTypes.SHADOWSOCKS,
    name: nodeName,
    server: server,
    port: portNum,
    password: password,
    method: method,
    plugin: null,
    pluginOpts: null
  };

  // 使用统一验证器验证节点
  const validation = NodeValidator.validateNode(node, 'SHADOWSOCKS');
  if (!validation.isValid) {
    throw new Error(`Node validation failed: ${validation.errors.join(', ')}`);
  }

  return node;
}

/**
 * 解析 Shadowsocks URL（带缓存和错误处理）
 * @param {string} url - SS URL
 * @returns {Object|null} 解析后的节点信息
 */
export const parseShadowsocksUrl = wrapWithCache(
  (url) => {
    try {
      return _parseShadowsocksUrl(url);
    } catch (error) {
      return ParserErrorHandler.handleParseError('SHADOWSOCKS', url, error);
    }
  },
  'shadowsocks',
  { maxSize: 500, ttl: 300000 } // 5分钟缓存
);

/**
 * 生成 Shadowsocks URL
 * @param {Object} node - 节点信息
 * @returns {string|null} SS URL
 */
export function generateShadowsocksUrl(node) {
  try {
    // 验证节点
    const validation = NodeValidator.validateNode(node, 'SHADOWSOCKS');
    if (!validation.isValid) {
      throw new Error(`Invalid node: ${validation.errors.join(', ')}`);
    }

    const auth = `${node.method}:${node.password}`;

    // 安全的base64编码
    const authBase64 = safeBtoa(auth);

    const name = encodeURIComponent(node.name || `${node.server}:${node.port}`);

    return `ss://${authBase64}@${node.server}:${node.port}#${name}`;
  } catch (error) {
    return ParserErrorHandler.handleConversionError('SHADOWSOCKS', 'generate', node, error);
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
    const validation = NodeValidator.validateNode(node, 'SHADOWSOCKS');
    if (!validation.isValid) {
      throw new Error(`Invalid node: ${validation.errors.join(', ')}`);
    }

    const clashNode = {
      name: node.name || `${node.server}:${node.port}`,
      type: 'ss',
      server: node.server,
      port: node.port,
      cipher: node.method,
      password: node.password
    };

    // 添加插件支持
    if (node.plugin) {
      clashNode.plugin = node.plugin;
      if (node.pluginOpts) {
        clashNode['plugin-opts'] = parsePluginOpts(node.pluginOpts);
      }
    }

    return clashNode;
  } catch (error) {
    return ParserErrorHandler.handleConversionError('SHADOWSOCKS', 'toClash', node, error);
  }
}

/**
 * 从 Clash 格式解析
 * @param {Object} clashNode - Clash 格式节点
 * @returns {Object} 标准节点格式
 */
export function fromClashFormat(clashNode) {
  const node = {
    type: ProxyTypes.SHADOWSOCKS,
    name: clashNode.name,
    server: clashNode.server,
    port: clashNode.port,
    password: clashNode.password,
    method: clashNode.cipher,
    plugin: clashNode.plugin || null,
    pluginOpts: null
  };

  if (clashNode['plugin-opts']) {
    node.pluginOpts = stringifyPluginOpts(clashNode['plugin-opts']);
  }

  return node;
}

/**
 * 解析插件选项
 * @param {string} optsString - 插件选项字符串
 * @returns {Object} 插件选项对象
 */
function parsePluginOpts(optsString) {
  const opts = {};
  if (!optsString) return opts;

  const pairs = optsString.split(';');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      opts[key] = value;
    }
  }
  return opts;
}

/**
 * 序列化插件选项
 * @param {Object} opts - 插件选项对象
 * @returns {string} 插件选项字符串
 */
function stringifyPluginOpts(opts) {
  return Object.entries(opts)
    .map(([key, value]) => `${key}=${value}`)
    .join(';');
}

/**
 * 验证节点配置（使用统一验证器）
 * @param {Object} node - 节点信息
 * @returns {boolean} 是否有效
 */
export function validateNode(node) {
  try {
    const validation = NodeValidator.validateNode(node, 'SHADOWSOCKS');
    return validation.isValid;
  } catch (error) {
    ParserErrorHandler.handleValidationError('SHADOWSOCKS', node, error.message);
    return false;
  }
}
