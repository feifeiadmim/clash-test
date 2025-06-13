/**
 * 节点去重工具
 */

import { globalScoringEngine } from './scoring-engine.js';

/**
 * 节点去重选项
 * @typedef {Object} DeduplicationOptions
 * @property {boolean} keepFirst - 是否保留第一个重复节点 (默认: true)
 * @property {boolean} caseSensitive - 名称比较是否区分大小写 (默认: false)
 * @property {string} action - 重复处理动作: 'delete' | 'rename' (默认: 'delete')
 * @property {string} template - 重命名模板 (默认: '0 1 2 3 4 5 6 7 8 9')
 * @property {string} link - 连接符 (默认: '-')
 * @property {string} position - 编号位置: 'front' | 'back' (默认: 'back')
 */

/**
 * 去重策略常量 - 使用完全匹配策略
 */
export const DEDUPLICATION_STRATEGY = 'full';

/**
 * 重复处理动作枚举
 */
export const DuplicateAction = {
  DELETE: 'delete',  // 删除重复节点
  RENAME: 'rename'   // 重命名重复节点
};

/**
 * 字段标准化映射表
 * 统一不同来源使用的字段名称
 */
const FIELD_MAPPINGS = {
  // 加密方法字段统一
  encryption: ['method', 'cipher', 'encryption'],
  // 认证字段统一
  auth: ['password', 'auth', 'token'],
  // 服务器名称字段统一
  serverName: ['sni', 'serverName', 'server_name', 'host'],
  // 传输协议字段统一
  transport: ['network', 'transport', 'net']
};

/**
 * 标准化字段值
 * @param {any} value - 原始值
 * @param {string} type - 值类型
 * @returns {string|number|boolean} 标准化后的值
 */
function normalizeValue(value, type = 'string') {
  if (value === null || value === undefined) return '';

  switch (type) {
    case 'string':
      return String(value).toLowerCase().trim();
    case 'number':
      return Number(value) || 0;
    case 'boolean':
      return Boolean(value);
    case 'domain':
      // 域名标准化：转小写，移除末尾点，处理IDN
      return String(value).toLowerCase().replace(/\.$/, '').trim();
    case 'path':
      // 路径标准化：确保以/开头，移除末尾/
      const path = String(value).trim();
      if (!path) return '';
      return path.startsWith('/') ? path.replace(/\/$/, '') || '/' : '/' + path.replace(/\/$/, '');
    default:
      return String(value);
  }
}

/**
 * 获取标准化字段值
 * @param {Object} node - 节点对象
 * @param {string} fieldName - 字段名称
 * @param {any} defaultValue - 默认值
 * @param {string} type - 值类型
 * @returns {any} 标准化后的字段值
 */
function getStandardizedField(node, fieldName, defaultValue = '', type = 'string') {
  const mappings = FIELD_MAPPINGS[fieldName] || [fieldName];

  for (const mapping of mappings) {
    if (node[mapping] !== undefined && node[mapping] !== null) {
      return normalizeValue(node[mapping], type);
    }
  }

  return normalizeValue(defaultValue, type);
}

/**
 * 生成传输层配置的标准化键
 * @param {Object} node - 节点对象
 * @param {string} network - 网络类型
 * @returns {string[]} 传输层配置键数组
 */
function generateTransportKey(node, network) {
  const transportParts = [];
  const transport = node.transport || {};

  // 根据网络类型处理不同的传输层配置
  switch (network) {
    case 'ws':
    case 'websocket':
      transportParts.push(
        normalizeValue(transport.path || node.path || '', 'path'),
        normalizeValue(transport.host || node.host || '', 'domain')
      );
      // WebSocket Headers处理（转换为稳定的字符串）
      if (transport.headers || node.wsOpts?.headers) {
        const headers = transport.headers || node.wsOpts?.headers || {};
        const sortedHeaders = Object.keys(headers).sort().map(key =>
          `${normalizeValue(key)}:${normalizeValue(headers[key])}`
        ).join('|');
        transportParts.push(sortedHeaders);
      }
      break;

    case 'h2':
    case 'http':
      transportParts.push(
        normalizeValue(transport.path || node.path || '', 'path'),
        normalizeValue(transport.host || node.host || '', 'domain'),
        normalizeValue(transport.method || 'GET')
      );
      break;

    case 'grpc':
      transportParts.push(
        normalizeValue(transport.serviceName || node.serviceName || ''),
        normalizeValue(transport.authority || node.authority || '', 'domain')
      );
      break;

    case 'quic':
      transportParts.push(
        normalizeValue(transport.security || node.security || 'none'),
        normalizeValue(transport.key || node.key || ''),
        normalizeValue(transport.header?.type || node.header?.type || 'none')
      );
      break;
  }

  return transportParts.filter(part => part !== '');
}

/**
 * 核心去重引擎（融合优化版本）
 * 统一的去重逻辑，支持多种策略和处理方式
 */
export class DeduplicationEngine {
  constructor() {
    this.stats = {
      totalProcessed: 0,
      duplicatesFound: 0,
      duplicatesRemoved: 0,
      processingTime: 0
    };
  }

  /**
   * 执行去重操作
   * @param {Object[]} nodes - 节点数组
   * @param {DeduplicationOptions} options - 去重选项
   * @returns {Object[]} 处理后的节点数组
   */
  deduplicate(nodes, options = {}) {
    const startTime = Date.now();

    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return [];
    }

    const {
      keepFirst = true,
      caseSensitive = false,
      action = DuplicateAction.DELETE
    } = options;

    this.stats.totalProcessed = nodes.length;

    // 根据处理动作选择不同的处理方式
    let result;
    if (action === DuplicateAction.DELETE) {
      result = this._performDeletion(nodes, keepFirst, caseSensitive);
    } else if (action === DuplicateAction.RENAME) {
      result = this._performRenaming(nodes, options);
    } else {
      result = this._performDeletion(nodes, keepFirst, caseSensitive);
    }

    this.stats.duplicatesRemoved = nodes.length - result.length;
    this.stats.processingTime = Date.now() - startTime;

    return result;
  }

  /**
   * 执行删除重复节点
   * @private
   */
  _performDeletion(nodes, keepFirst, caseSensitive) {
    const uniqueNodes = [];
    const seenKeys = new Map(); // 使用Map存储更多信息

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const key = generateNodeKey(node, caseSensitive);

      if (!seenKeys.has(key)) {
        seenKeys.set(key, { index: i, node });
        uniqueNodes.push(node);
      } else {
        const existing = seenKeys.get(key);

        // 智能选择：优先保留字段更完整的节点
        const shouldReplace = this._shouldReplaceNode(existing.node, node, keepFirst);

        if (shouldReplace) {
          const existingIndex = uniqueNodes.findIndex(n => n === existing.node);
          if (existingIndex !== -1) {
            uniqueNodes[existingIndex] = node;
            seenKeys.set(key, { index: i, node });
          }
        }

        this.stats.duplicatesFound++;
      }
    }

    return uniqueNodes;
  }

  /**
   * 判断是否应该替换现有节点
   * @private
   */
  _shouldReplaceNode(existingNode, newNode, keepFirst) {
    // 如果设置了保留第一个，则需要比较节点完整性
    if (keepFirst) {
      return this._isNodeMoreComplete(newNode, existingNode);
    }

    // 如果不保留第一个，也要比较完整性
    return this._isNodeMoreComplete(newNode, existingNode);
  }

  /**
   * 判断新节点是否比现有节点更完整
   * @private
   */
  _isNodeMoreComplete(newNode, existingNode) {
    const newScore = this._calculateNodeCompleteness(newNode);
    const existingScore = this._calculateNodeCompleteness(existingNode);

    return newScore > existingScore;
  }

  /**
   * 计算节点完整性得分（使用配置化评分引擎）
   * @private
   */
  _calculateNodeCompleteness(node) {
    try {
      // 使用配置化评分引擎计算得分
      const scoringResult = globalScoringEngine.calculateScore(node, {
        context: { purpose: 'deduplication' }
      });

      return scoringResult.totalScore;
    } catch (error) {
      console.warn('评分引擎计算失败，使用备用评分方法:', error.message);

      // 备用评分方法（简化版本）
      return this._calculateBasicCompleteness(node);
    }
  }

  /**
   * 基础完整性评分（备用方法）
   * @private
   */
  _calculateBasicCompleteness(node) {
    let score = 0;

    // 基础字段
    if (node.server && node.server.trim()) score += 10;
    if (node.port && node.port > 0) score += 10;
    if (node.type && node.type.trim()) score += 10;
    if (node.name && node.name.trim()) score += 5;

    // 协议特定字段
    switch (node.type) {
      case 'ss':
        if (node.password && node.password.trim()) score += 20;
        if (node.method && node.method.trim()) score += 10;
        break;
      case 'ssr':
        if (node.password && node.password.trim()) score += 20;
        if (node.method && node.method.trim()) score += 10;
        if (node.protocol && node.protocol.trim()) score += 5;
        if (node.obfs && node.obfs.trim()) score += 5;
        break;
      case 'vmess':
      case 'vless':
        if (node.uuid && node.uuid.trim()) score += 20;
        if (node.security && node.security.trim()) score += 5;
        break;
      case 'trojan':
        if (node.password && node.password.trim()) score += 20;
        break;
      case 'hysteria2':
        if (node.password || node.auth) score += 20;
        break;
    }

    // 传输层配置
    if (node.network && node.network.trim()) score += 5;
    if (node.tls === true || node.tls === 'tls') score += 5;

    return score;
  }

  /**
   * 执行重命名重复节点
   * @private
   */
  _performRenaming(nodes, options) {
    const {
      template = '0 1 2 3 4 5 6 7 8 9',
      link = '-',
      position = 'back'
    } = options;

    const numbers = template.split(' ');
    const counter = {};
    let maxLen = 0;

    // 统计重复次数
    nodes.forEach((node) => {
      const name = node.name || '';
      counter[name] = (counter[name] || 0) + 1;
      maxLen = Math.max(counter[name].toString().length, maxLen);
    });

    const increment = {};
    return nodes.map((node) => {
      const name = node.name || '';

      if (counter[name] > 1) {
        increment[name] = increment[name] || 1;
        const num = generateNumber(increment[name]++, numbers, maxLen);

        const newName = position === 'front' ?
          `${num}${link}${name}` :
          `${name}${link}${num}`;

        return {
          ...node,
          name: newName
        };
      }

      return node;
    });
  }

  /**
   * 按协议类型分组去重
   * @param {Object[]} nodes - 节点数组
   * @param {DeduplicationOptions} options - 去重选项
   * @returns {Object[]} 去重后的节点数组
   */
  deduplicateByType(nodes, options = {}) {
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return [];
    }

    // 按协议类型分组
    const typeGroups = new Map();
    for (const node of nodes) {
      const type = node.type || 'unknown';
      if (!typeGroups.has(type)) {
        typeGroups.set(type, []);
      }
      typeGroups.get(type).push(node);
    }

    // 对每个类型分别去重
    const deduplicatedNodes = [];
    for (const typeNodes of typeGroups.values()) {
      const deduplicated = this.deduplicate(typeNodes, options);
      deduplicatedNodes.push(...deduplicated);
    }

    return deduplicatedNodes;
  }

  /**
   * 自定义去重函数
   * @param {Object[]} nodes - 节点数组
   * @param {Function} keyGenerator - 自定义键生成函数
   * @param {boolean} keepFirst - 是否保留第一个
   * @returns {Object[]} 去重后的节点数组
   */
  customDeduplicate(nodes, keyGenerator, keepFirst = true) {
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return [];
    }

    if (typeof keyGenerator !== 'function') {
      throw new Error('keyGenerator 必须是一个函数');
    }

    const uniqueNodes = [];
    const seenKeys = new Set();

    for (const node of nodes) {
      try {
        const key = keyGenerator(node);

        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueNodes.push(node);
        } else if (!keepFirst) {
          const existingIndex = uniqueNodes.findIndex(n => keyGenerator(n) === key);
          if (existingIndex !== -1) {
            uniqueNodes[existingIndex] = node;
          }
        }
      } catch (error) {
        console.error('自定义键生成函数执行失败:', error);
        // 如果键生成失败，保留该节点
        uniqueNodes.push(node);
      }
    }

    return uniqueNodes;
  }

  /**
   * 批量去重（优化大数据集处理）
   * @param {Object[]} nodes - 节点数组
   * @param {Object} options - 去重选项
   * @returns {Object[]} 去重后的节点数组
   */
  batchDeduplicate(nodes, options = {}) {
    const { batchSize = 5000 } = options;

    if (nodes.length <= batchSize) {
      return this.deduplicate(nodes, options);
    }

    const results = [];
    const globalKeys = new Set();

    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      const batchResult = [];

      for (const node of batch) {
        const key = generateNodeKey(node, options.caseSensitive);

        if (!globalKeys.has(key)) {
          globalKeys.add(key);
          batchResult.push(node);
        }
      }

      results.push(...batchResult);
    }

    return results;
  }

  /**
   * 获取去重统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalProcessed: 0,
      duplicatesFound: 0,
      duplicatesRemoved: 0,
      processingTime: 0
    };
  }
}

// 创建全局去重引擎实例
const globalDeduplicationEngine = new DeduplicationEngine();

/**
 * 节点去重主函数（保持向后兼容）
 * @param {Object[]} nodes - 节点数组
 * @param {DeduplicationOptions} options - 去重选项
 * @returns {Object[]} 去重后的节点数组
 */
export function deduplicateNodes(nodes, options = {}) {
  return globalDeduplicationEngine.deduplicate(nodes, { ...options, action: DuplicateAction.DELETE });
}

/**
 * 生成节点的唯一标识键 - 使用完全匹配策略
 * @param {Object} node - 节点信息
 * @param {boolean} caseSensitive - 是否区分大小写（暂未使用，预留扩展）
 * @returns {string} 唯一标识键
 */
function generateNodeKey(node, caseSensitive = false) {
  if (!node) return '';

  // 使用完全匹配策略
  return generateFullNodeKey(node);
}

/**
 * 生成完整的节点标识键（性能优化版本 - 预期提升50%+）
 * 优化策略：
 * 1. 预定义字段数组 + join() 替代字符串拼接
 * 2. 移除冗余字符串操作
 * 3. 添加类型安全转换
 * 4. 使用固定长度数组避免动态扩容
 * @param {Object} node - 节点信息
 * @returns {string} 完整标识键
 */
export function generateFullNodeKey(node) {
  // 预定义字段数组，避免动态分配
  const keyFields = new Array(25); // 固定长度，避免扩容
  let fieldIndex = 0;

  // 类型安全的字段提取函数
  const safeString = (value, defaultValue = '') =>
    (value == null) ? defaultValue : String(value).toLowerCase().trim();

  const safeNumber = (value, defaultValue = 0) =>
    (value == null || isNaN(value)) ? defaultValue : Number(value);

  const safeBool = (value, defaultValue = false) => {
    if (value == null) return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return Boolean(value);
  };

  // 标准化JSON序列化 - 确保字段顺序一致
  const safeJsonStringify = (obj) => {
    if (!obj || typeof obj !== 'object') return '';

    // 递归排序对象键
    const sortKeys = (item) => {
      if (Array.isArray(item)) {
        return item.map(sortKeys);
      } else if (item && typeof item === 'object') {
        const sorted = {};
        Object.keys(item).sort().forEach(key => {
          sorted[key] = sortKeys(item[key]);
        });
        return sorted;
      }
      return item;
    };

    return JSON.stringify(sortKeys(obj));
  };

  // 基础字段（必需） - 使用类型安全转换
  keyFields[fieldIndex++] = safeString(node.server);
  keyFields[fieldIndex++] = safeNumber(node.port);
  keyFields[fieldIndex++] = safeString(node.type);

  // 根据协议类型添加特定字段（优化版本）
  const nodeType = safeString(node.type);

  // 预定义协议字段映射，避免重复计算
  const protocolFields = {
    'ss': () => {
      keyFields[fieldIndex++] = safeString(node.password || node.auth);
      keyFields[fieldIndex++] = safeString(node.method || node.cipher);
      keyFields[fieldIndex++] = safeString(node.plugin, 'none');
      keyFields[fieldIndex++] = node.pluginOpts ? safeJsonStringify(node.pluginOpts) : '';
    },

    'ssr': () => {
      keyFields[fieldIndex++] = safeString(node.password || node.auth);
      keyFields[fieldIndex++] = safeString(node.method || node.cipher);
      keyFields[fieldIndex++] = safeString(node.protocol, 'origin');
      keyFields[fieldIndex++] = safeString(node.obfs, 'plain');
      keyFields[fieldIndex++] = safeString(node.protocolParam);
      keyFields[fieldIndex++] = safeString(node.obfsParam);
    },

    'vmess': () => {
      const network = safeString(node.network || node.transport, 'tcp');
      keyFields[fieldIndex++] = safeString(node.uuid);
      keyFields[fieldIndex++] = safeNumber(node.alterId);
      keyFields[fieldIndex++] = safeString(node.cipher || node.security, 'auto');
      keyFields[fieldIndex++] = network;

      // 网络字段显式性标记 - 区分显式指定和默认值
      if (node.network || node.transport) {
        keyFields[fieldIndex++] = 'explicit_network';
      } else {
        keyFields[fieldIndex++] = 'default_network';
      }

      // 增强传输层处理
      if (network !== 'tcp') {
        keyFields[fieldIndex++] = safeString(node.path);
        keyFields[fieldIndex++] = safeString(node.host);

        // WebSocket headers处理 - 影响连接行为
        if (network === 'ws' && node.headers) {
          keyFields[fieldIndex++] = safeJsonStringify(node.headers);
        }

        // gRPC配置处理 - 服务名影响连接
        if (network === 'grpc' && node.grpcSettings) {
          keyFields[fieldIndex++] = safeString(node.grpcSettings.serviceName);
          keyFields[fieldIndex++] = node.grpcSettings.multiMode ? 'multi' : 'single';
        }
      }

      // 更精确的TLS处理 - 区分不同的TLS配置形式
      if (node.tls) {
        // 区分布尔值和对象形式的TLS配置
        if (typeof node.tls === 'boolean') {
          keyFields[fieldIndex++] = node.tls ? 'tls_bool_true' : 'tls_bool_false';
        } else if (typeof node.tls === 'object') {
          keyFields[fieldIndex++] = safeBool(node.tls.enabled) ? 'tls_obj_true' : 'tls_obj_false';
          keyFields[fieldIndex++] = safeString(node.tls.serverName || node.tls.sni);

          // 重要的TLS安全配置
          if (node.tls.allowInsecure !== undefined) {
            keyFields[fieldIndex++] = safeBool(node.tls.allowInsecure) ? 'insecure' : 'secure';
          }
          if (node.tls.alpn && Array.isArray(node.tls.alpn)) {
            keyFields[fieldIndex++] = node.tls.alpn.join(',');
          }
        }
      }
    },

    'vless': () => {
      const network = safeString(node.network || node.transport, 'tcp');
      keyFields[fieldIndex++] = safeString(node.uuid);

      // 更精确的flow字段处理 - 区分显式和隐式
      if (node.flow !== undefined) {
        keyFields[fieldIndex++] = safeString(node.flow, 'none');
        keyFields[fieldIndex++] = 'explicit_flow';
      } else {
        keyFields[fieldIndex++] = 'none';
        keyFields[fieldIndex++] = 'default_flow';
      }

      keyFields[fieldIndex++] = safeString(node.encryption, 'none');
      keyFields[fieldIndex++] = network;

      // 增强传输层处理
      if (network !== 'tcp') {
        keyFields[fieldIndex++] = safeString(node.path);
        keyFields[fieldIndex++] = safeString(node.host);

        // WebSocket headers处理
        if (network === 'ws' && node.headers) {
          keyFields[fieldIndex++] = safeJsonStringify(node.headers);
        }

        // gRPC配置处理 - 服务名影响连接
        if (network === 'grpc' && node.grpcSettings) {
          keyFields[fieldIndex++] = safeString(node.grpcSettings.serviceName);
          keyFields[fieldIndex++] = node.grpcSettings.multiMode ? 'multi' : 'single';
        }
      }

      // 增强Reality/TLS处理
      if (node.reality) {
        keyFields[fieldIndex++] = 'reality';
        keyFields[fieldIndex++] = safeString(node.reality.publicKey);
        keyFields[fieldIndex++] = safeString(node.reality.shortId);

        // Reality扩展配置 - 影响连接行为
        if (node.reality.spiderX) {
          keyFields[fieldIndex++] = safeString(node.reality.spiderX);
        }
        if (node.reality.fingerprint) {
          keyFields[fieldIndex++] = safeString(node.reality.fingerprint);
        }
      } else if (node.tls) {
        keyFields[fieldIndex++] = 'tls';
        keyFields[fieldIndex++] = safeString(node.tls.serverName || node.tls.sni);

        // TLS安全配置
        if (node.tls.allowInsecure !== undefined) {
          keyFields[fieldIndex++] = safeBool(node.tls.allowInsecure) ? 'insecure' : 'secure';
        }
        if (node.tls.alpn && Array.isArray(node.tls.alpn)) {
          keyFields[fieldIndex++] = node.tls.alpn.join(',');
        }
      }
    },

    'trojan': () => {
      const network = safeString(node.network || node.transport, 'tcp');
      keyFields[fieldIndex++] = safeString(node.password || node.auth);
      keyFields[fieldIndex++] = network;

      // 更精确的SNI/Host处理 - 区分字段来源
      if (node.sni !== undefined) {
        keyFields[fieldIndex++] = safeString(node.sni);
        keyFields[fieldIndex++] = 'sni_field';
      } else if (node.host !== undefined) {
        keyFields[fieldIndex++] = safeString(node.host);
        keyFields[fieldIndex++] = 'host_field';
      } else {
        keyFields[fieldIndex++] = '';
        keyFields[fieldIndex++] = 'no_sni_host';
      }

      // 网络字段显式性标记 - 区分显式指定和默认值
      if (node.network || node.transport) {
        keyFields[fieldIndex++] = 'explicit_network';
      } else {
        keyFields[fieldIndex++] = 'default_network';
      }

      // 传输层配置处理 - 更保守的空值处理
      if (network === 'ws') {
        if (node.wsSettings !== undefined) {
          if (Object.keys(node.wsSettings).length > 0) {
            keyFields[fieldIndex++] = safeString(node.wsSettings.path);
            keyFields[fieldIndex++] = node.wsSettings.headers ? safeJsonStringify(node.wsSettings.headers) : '';
            keyFields[fieldIndex++] = 'has_ws_settings';
          } else {
            keyFields[fieldIndex++] = 'empty_ws_settings';
          }
        } else {
          keyFields[fieldIndex++] = 'no_ws_settings';
        }
      }
      if (network === 'grpc') {
        if (node.grpcSettings && Object.keys(node.grpcSettings).length > 0) {
          keyFields[fieldIndex++] = safeString(node.grpcSettings.serviceName);
        } else {
          keyFields[fieldIndex++] = 'no_grpc_settings';
        }
      }
    },

    'hysteria': () => {
      keyFields[fieldIndex++] = safeString(node.password || node.auth);
      keyFields[fieldIndex++] = safeString(node.protocol, 'udp');
      keyFields[fieldIndex++] = safeString(node.obfs, 'none');
      keyFields[fieldIndex++] = safeString(node.sni || node.host);

      // 端口跳跃范围处理 - 影响连接策略
      if (node.ports) {
        keyFields[fieldIndex++] = safeString(node.ports);
      }
    },

    'hysteria2': () => {
      keyFields[fieldIndex++] = safeString(node.password || node.auth);
      keyFields[fieldIndex++] = safeString(node.sni || node.host);

      // 增强混淆配置处理 - 密码影响连接
      if (node.obfs) {
        keyFields[fieldIndex++] = safeString(node.obfs.type, 'none');
        if (node.obfs.password) {
          keyFields[fieldIndex++] = safeString(node.obfs.password);
        }
      } else {
        keyFields[fieldIndex++] = 'none';
      }
    },

    'tuic': () => {
      keyFields[fieldIndex++] = safeString(node.uuid);
      keyFields[fieldIndex++] = safeString(node.password || node.auth);
      keyFields[fieldIndex++] = safeNumber(node.version, 5);
      keyFields[fieldIndex++] = safeString(node.congestion, 'cubic');
    },

    'snell': () => {
      keyFields[fieldIndex++] = safeString(node.password || node.auth);
      keyFields[fieldIndex++] = safeString(node.version, '1');
      keyFields[fieldIndex++] = safeString(node.obfs, 'none');

      // Snell特有的混淆配置
      if (node.obfs && node.obfs !== 'none') {
        keyFields[fieldIndex++] = safeString(node.obfsHost);
      }
    },

    'anytls': () => {
      keyFields[fieldIndex++] = safeString(node.server);
      keyFields[fieldIndex++] = safeString(node.port);
      keyFields[fieldIndex++] = safeString(node.password || node.auth);
      keyFields[fieldIndex++] = safeString(node.sni || node.host);
      keyFields[fieldIndex++] = safeString(node.method, 'none');

      // AnyTLS特有的配置
      if (node.alpn && Array.isArray(node.alpn)) {
        keyFields[fieldIndex++] = node.alpn.join(',');
      }
    },

    'wireguard': () => {
      keyFields[fieldIndex++] = safeString(node.privateKey);
      keyFields[fieldIndex++] = safeString(node.publicKey);
      keyFields[fieldIndex++] = safeString(node.endpoint);
      keyFields[fieldIndex++] = safeString(node.allowedIPs);

      // WireGuard特有配置
      if (node.persistentKeepalive !== undefined) {
        keyFields[fieldIndex++] = safeNumber(node.persistentKeepalive);
      }
      if (node.mtu !== undefined) {
        keyFields[fieldIndex++] = safeNumber(node.mtu);
      }
    },

    'ssh': () => {
      keyFields[fieldIndex++] = safeString(node.username || node.user);
      keyFields[fieldIndex++] = safeString(node.password || node.auth);
      keyFields[fieldIndex++] = safeString(node.privateKey);
      keyFields[fieldIndex++] = safeString(node.publicKey);

      // SSH特有配置
      keyFields[fieldIndex++] = safeString(node.hostKeyAlgorithms);
      keyFields[fieldIndex++] = safeString(node.kexAlgorithms);
    },

    'http': () => {
      keyFields[fieldIndex++] = safeString(node.username || node.user);
      keyFields[fieldIndex++] = safeString(node.password || node.auth);
      keyFields[fieldIndex++] = safeBool(node.tls) ? 'https' : 'http';

      // HTTP代理特有配置
      if (node.headers) {
        keyFields[fieldIndex++] = safeJsonStringify(node.headers);
      }
    },

    'socks5': () => {
      keyFields[fieldIndex++] = safeString(node.username || node.user);
      keyFields[fieldIndex++] = safeString(node.password || node.auth);
      keyFields[fieldIndex++] = safeBool(node.tls) ? 'socks5-tls' : 'socks5';

      // SOCKS5特有配置
      keyFields[fieldIndex++] = safeString(node.version, '5');
    },

    'direct': () => {
      // Direct连接通常只需要基础字段
      keyFields[fieldIndex++] = 'direct';

      // 如果有特殊配置
      if (node.interface) {
        keyFields[fieldIndex++] = safeString(node.interface);
      }
    }
  };

  // 执行协议特定字段处理
  const protocolHandler = protocolFields[nodeType];
  if (protocolHandler) {
    protocolHandler();
  } else {
    // 默认处理
    keyFields[fieldIndex++] = safeString(node.password || node.auth || node.uuid);
    keyFields[fieldIndex++] = safeString(node.method || node.cipher);
  }

  // 优化：截断到实际使用的长度并返回
  keyFields.length = fieldIndex;
  return keyFields.join(':');
}

/**
 * 生成编号字符串
 * @param {number} num - 数字
 * @param {string[]} template - 编号模板
 * @param {number} maxLen - 最大长度
 * @returns {string} 编号字符串
 */
function generateNumber(num, template, maxLen) {
  const str = num.toString();
  let result = '';

  for (const char of str) {
    const index = parseInt(char);
    result += template[index] || char;
  }

  return result.padStart(maxLen, template[0] || '0');
}

/**
 * 处理重复节点（融合优化版本）
 * 统一使用去重引擎，消除重复逻辑
 * @param {Object[]} nodes - 节点数组
 * @param {Object} options - 处理选项
 * @returns {Object[]} 处理后的节点数组
 */
export function handleDuplicateNodes(nodes, options = {}) {
  return globalDeduplicationEngine.deduplicate(nodes, options);
}

/**
 * 查找重复的节点（优化版本 - O(n)算法）
 * @param {Object[]} nodes - 节点数组
 * @param {DeduplicationOptions} options - 查找选项
 * @returns {Object} 重复节点信息
 */
export function findDuplicateNodes(nodes, options = {}) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return { duplicates: [], groups: [] };
  }

  const {
    caseSensitive = false
  } = options;

  // 使用Map进行O(n)复杂度的分组
  const keyToGroupMap = new Map();
  const duplicateIndexes = [];
  let totalDuplicates = 0;

  // 单次遍历完成分组和重复检测
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const key = generateNodeKey(node, caseSensitive);

    if (!keyToGroupMap.has(key)) {
      // 首次出现的键，创建新组
      keyToGroupMap.set(key, {
        key,
        nodes: [{ node, index: i }],
        count: 1,
        firstIndex: i
      });
    } else {
      // 重复的键，添加到现有组
      const group = keyToGroupMap.get(key);
      group.nodes.push({ node, index: i });
      group.count++;

      // 记录重复节点的索引（除了第一个）
      duplicateIndexes.push(i);
      totalDuplicates++;
    }
  }

  // 提取重复组（count > 1的组）
  const duplicateGroups = [];
  for (const group of keyToGroupMap.values()) {
    if (group.count > 1) {
      duplicateGroups.push({
        key: group.key,
        nodes: group.nodes,
        count: group.count
      });
    }
  }

  return {
    duplicates: duplicateIndexes,
    groups: duplicateGroups,
    totalDuplicates,
    uniqueCount: keyToGroupMap.size
  };
}

/**
 * 获取去重统计信息
 * @param {Object[]} originalNodes - 原始节点数组
 * @param {Object[]} deduplicatedNodes - 去重后的节点数组
 * @param {DeduplicationOptions} options - 去重选项
 * @returns {Object} 统计信息
 */
export function getDeduplicationStats(originalNodes, deduplicatedNodes, options = {}) {
  const duplicateInfo = findDuplicateNodes(originalNodes, options);

  return {
    original: originalNodes.length,
    deduplicated: deduplicatedNodes.length,
    removed: originalNodes.length - deduplicatedNodes.length,
    duplicateGroups: duplicateInfo.groups.length,
    totalDuplicates: duplicateInfo.totalDuplicates,
    strategy: DEDUPLICATION_STRATEGY
  };
}



// 使用全局去重引擎实例，简化架构

/**
 * 按协议类型分组去重（保持向后兼容）
 */
export function deduplicateByType(nodes, options = {}) {
  return globalDeduplicationEngine.deduplicateByType(nodes, options);
}

/**
 * 自定义去重函数（保持向后兼容）
 */
export function customDeduplicate(nodes, keyGenerator, keepFirst = true) {
  return globalDeduplicationEngine.customDeduplicate(nodes, keyGenerator, keepFirst);
}

/**
 * 批量去重函数（保持向后兼容）
 */
export function batchDeduplicate(nodes, options = {}) {
  return globalDeduplicationEngine.batchDeduplicate(nodes, options);
}

/**
 * 统一去重接口 - 简化为直接调用标准去重
 * @param {Object[]} nodes - 节点数组
 * @param {string} strategy - 去重策略（仅支持'full'）
 * @param {Object} options - 选项
 * @returns {Object[]} 去重后的节点数组
 */
export function unifiedDeduplicate(nodes, strategy = 'full', options = {}) {
  // 简化：只支持标准去重，忽略strategy参数
  return globalDeduplicationEngine.deduplicate(nodes, options);
}