/**
 * 统一传输层处理器
 * 提供标准化的传输层配置解析、生成和转换功能
 * 消除各协议解析器中的重复代码，提高维护性
 */

import { ParserErrorHandler, ErrorTypes, ErrorSeverity } from './error-handler.js';
import { SafeInputSanitizer } from '../../utils/security.js';

/**
 * 安全的数值解析工具
 */
class SafeNumberParser {
  /**
   * 安全地解析整数
   * @param {any} value - 要解析的值
   * @param {number} defaultValue - 默认值
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {number} 解析后的整数
   */
  static parseIntSafely(value, defaultValue, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
    if (value === null || value === undefined) {
      return defaultValue;
    }

    const parsed = parseInt(value, 10);

    if (isNaN(parsed)) {
      console.warn(`⚠️ 无效数值: ${value}, 使用默认值: ${defaultValue}`);
      return defaultValue;
    }

    if (parsed < min || parsed > max) {
      console.warn(`⚠️ 数值超出范围: ${parsed}, 范围: [${min}, ${max}], 使用默认值: ${defaultValue}`);
      return defaultValue;
    }

    return parsed;
  }

  /**
   * 安全地解析浮点数
   * @param {any} value - 要解析的值
   * @param {number} defaultValue - 默认值
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {number} 解析后的浮点数
   */
  static parseFloatSafely(value, defaultValue, min = -Number.MAX_VALUE, max = Number.MAX_VALUE) {
    if (value === null || value === undefined) {
      return defaultValue;
    }

    const parsed = parseFloat(value);

    if (isNaN(parsed)) {
      console.warn(`⚠️ 无效浮点数: ${value}, 使用默认值: ${defaultValue}`);
      return defaultValue;
    }

    if (parsed < min || parsed > max) {
      console.warn(`⚠️ 浮点数超出范围: ${parsed}, 范围: [${min}, ${max}], 使用默认值: ${defaultValue}`);
      return defaultValue;
    }

    return parsed;
  }

  /**
   * 安全地解析端口号
   * @param {any} value - 要解析的值
   * @param {number} defaultValue - 默认值
   * @returns {number} 解析后的端口号
   */
  static parsePortSafely(value, defaultValue = 443) {
    return this.parseIntSafely(value, defaultValue, 1, 65535);
  }

  /**
   * 安全地解析MTU值
   * @param {any} value - 要解析的值
   * @param {number} defaultValue - 默认值
   * @returns {number} 解析后的MTU值
   */
  static parseMTUSafely(value, defaultValue = 1350) {
    return this.parseIntSafely(value, defaultValue, 576, 1500);
  }

  /**
   * 安全地解析缓冲区大小
   * @param {any} value - 要解析的值
   * @param {number} defaultValue - 默认值
   * @returns {number} 解析后的缓冲区大小
   */
  static parseBufferSizeSafely(value, defaultValue = 2) {
    return this.parseIntSafely(value, defaultValue, 1, 64);
  }

  /**
   * 安全地解析容量值
   * @param {any} value - 要解析的值
   * @param {number} defaultValue - 默认值
   * @returns {number} 解析后的容量值
   */
  static parseCapacitySafely(value, defaultValue = 5) {
    return this.parseIntSafely(value, defaultValue, 1, 1000);
  }
}

/**
 * 支持的传输协议类型
 */
export const TransportTypes = {
  TCP: 'tcp',
  WS: 'ws',
  WEBSOCKET: 'websocket',
  H2: 'h2',
  HTTP: 'http',
  GRPC: 'grpc',
  QUIC: 'quic',
  KCP: 'kcp'
};

/**
 * 传输层配置处理器类
 */
export class TransportHandler {
  static processingStats = {
    total: 0,
    successful: 0,
    failed: 0,
    byType: {}
  };

  /**
   * 解析传输层参数（从URL参数或JSON配置）
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} network - 网络类型
   * @param {string} paramSource - 参数来源 ('url' | 'json' | 'clash')
   * @returns {Object} 传输层配置
   */
  static parseTransportParams(params, network, paramSource = 'url') {
    this.processingStats.total++;
    this.processingStats.byType[network] = (this.processingStats.byType[network] || 0) + 1;

    try {
      const transport = {};
      const normalizedNetwork = this.normalizeNetworkType(network);

      switch (normalizedNetwork) {
        case TransportTypes.WS:
          return this.parseWebSocketTransport(params, paramSource);
        case TransportTypes.H2:
          return this.parseHTTP2Transport(params, paramSource);
        case TransportTypes.GRPC:
          return this.parseGRPCTransport(params, paramSource);
        case TransportTypes.TCP:
          return this.parseTCPTransport(params, paramSource);
        case TransportTypes.QUIC:
          return this.parseQUICTransport(params, paramSource);
        case TransportTypes.KCP:
          return this.parseKCPTransport(params, paramSource);
        default:
          return transport;
      }
    } catch (error) {
      this.processingStats.failed++;
      ParserErrorHandler.logError(
        'TRANSPORT',
        'parse',
        error,
        { network, paramSource },
        ErrorTypes.PARSE_ERROR,
        ErrorSeverity.MEDIUM
      );
      return {};
    } finally {
      this.processingStats.successful = this.processingStats.total - this.processingStats.failed;
    }
  }

  /**
   * 解析WebSocket传输配置
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} source - 参数来源
   * @returns {Object} WebSocket配置
   */
  static parseWebSocketTransport(params, source) {
    const transport = {};

    if (source === 'url') {
      transport.path = SafeInputSanitizer.sanitizePath(params.get('path')) || '/';
      transport.host = params.get('host') || '';

      // 安全处理WebSocket headers
      const headers = {};
      for (const [key, value] of params.entries()) {
        if (key.startsWith('header-')) {
          const headerKey = SafeInputSanitizer.sanitizeHeaderKey(key.substring(7));
          if (headerKey) {
            headers[headerKey] = SafeInputSanitizer.sanitizeHeaderValue(value);
          }
        }
      }
      if (Object.keys(headers).length > 0) {
        transport.headers = headers;
      }

      // 处理早期数据
      const earlyData = params.get('ed') || params.get('earlyData');
      if (earlyData) {
        transport.earlyData = SafeNumberParser.parseIntSafely(earlyData, 0, 0, 2048);
      }

    } else if (source === 'json') {
      transport.path = params.path || '/';
      transport.host = params.host || '';
      if (params.headers && typeof params.headers === 'object') {
        transport.headers = { ...params.headers };
      }
      if (params.earlyData !== undefined) {
        transport.earlyData = params.earlyData;
      }

    } else if (source === 'clash') {
      transport.path = params.path || '/';
      if (params.headers && typeof params.headers === 'object') {
        transport.headers = { ...params.headers };
        // 从headers中提取host
        if (params.headers.Host) {
          transport.host = params.headers.Host;
        }
      }
      if (params['early-data-header-name']) {
        transport.earlyDataHeaderName = params['early-data-header-name'];
      }
    }

    return transport;
  }

  /**
   * 解析HTTP/2传输配置
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} source - 参数来源
   * @returns {Object} HTTP/2配置
   */
  static parseHTTP2Transport(params, source) {
    const transport = {};

    if (source === 'url') {
      transport.path = params.get('path') || '/';
      transport.host = params.get('host') || '';
      transport.method = params.get('method') || 'GET';

      // 安全处理HTTP headers
      const headers = {};
      for (const [key, value] of params.entries()) {
        if (key.startsWith('header-')) {
          const headerKey = SafeInputSanitizer.sanitizeHeaderKey(key.substring(7));
          if (headerKey) {
            headers[headerKey] = SafeInputSanitizer.sanitizeHeaderValue(value);
          }
        }
      }
      if (Object.keys(headers).length > 0) {
        transport.headers = headers;
      }

    } else if (source === 'json') {
      transport.path = params.path || '/';
      transport.host = params.host || '';
      transport.method = params.method || 'GET';
      if (params.headers && typeof params.headers === 'object') {
        transport.headers = { ...params.headers };
      }

    } else if (source === 'clash') {
      transport.path = params.path || '/';
      transport.method = params.method || 'GET';
      if (Array.isArray(params.host) && params.host.length > 0) {
        transport.host = params.host[0];
      } else if (typeof params.host === 'string') {
        transport.host = params.host;
      }
    }

    return transport;
  }

  /**
   * 解析gRPC传输配置
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} source - 参数来源
   * @returns {Object} gRPC配置
   */
  static parseGRPCTransport(params, source) {
    const transport = {};

    if (source === 'url') {
      transport.serviceName = params.get('serviceName') || params.get('servicename') || '';
      transport.mode = params.get('mode') || 'gun';
      transport.authority = params.get('authority') || '';
      transport.multiMode = params.get('multiMode') === 'true';

    } else if (source === 'json') {
      transport.serviceName = params.serviceName || params.servicename || '';
      transport.mode = params.mode || 'gun';
      transport.authority = params.authority || '';
      transport.multiMode = !!params.multiMode;

    } else if (source === 'clash') {
      transport.serviceName = params['grpc-service-name'] || '';
      transport.mode = params['grpc-mode'] || 'gun';
    }

    return transport;
  }

  /**
   * 解析TCP传输配置
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} source - 参数来源
   * @returns {Object} TCP配置
   */
  static parseTCPTransport(params, source) {
    const transport = {};

    if (source === 'url') {
      const headerType = params.get('headerType') || params.get('type');
      if (headerType === 'http') {
        transport.headerType = 'http';
        transport.host = params.get('host') || '';
        transport.path = params.get('path') || '/';
        transport.method = params.get('method') || 'GET';
      }

    } else if (source === 'json') {
      if (params.header && params.header.type === 'http') {
        transport.headerType = 'http';
        transport.host = params.header.request?.headers?.Host?.[0] || '';
        transport.path = params.header.request?.path?.[0] || '/';
        transport.method = params.header.request?.method || 'GET';
      }

    } else if (source === 'clash') {
      // Clash中TCP通常不需要额外配置
    }

    return transport;
  }

  /**
   * 解析QUIC传输配置
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} source - 参数来源
   * @returns {Object} QUIC配置
   */
  static parseQUICTransport(params, source) {
    const transport = {};

    if (source === 'url') {
      transport.security = params.get('security') || 'none';
      transport.key = params.get('key') || '';
      transport.headerType = params.get('headerType') || 'none';

    } else if (source === 'json') {
      transport.security = params.security || 'none';
      transport.key = params.key || '';
      transport.headerType = params.header?.type || 'none';
    }

    return transport;
  }

  /**
   * 解析KCP传输配置
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} source - 参数来源
   * @returns {Object} KCP配置
   */
  static parseKCPTransport(params, source) {
    const transport = {};

    if (source === 'url') {
      transport.mtu = SafeNumberParser.parseMTUSafely(params.get('mtu'), 1350);
      transport.tti = SafeNumberParser.parseIntSafely(params.get('tti'), 50, 10, 100);
      transport.uplinkCapacity = SafeNumberParser.parseCapacitySafely(params.get('uplinkCapacity'), 5);
      transport.downlinkCapacity = SafeNumberParser.parseCapacitySafely(params.get('downlinkCapacity'), 20);
      transport.congestion = params.get('congestion') === 'true';
      transport.readBufferSize = SafeNumberParser.parseBufferSizeSafely(params.get('readBufferSize'), 2);
      transport.writeBufferSize = SafeNumberParser.parseBufferSizeSafely(params.get('writeBufferSize'), 2);
      transport.headerType = params.get('headerType') || 'none';

    } else if (source === 'json') {
      transport.mtu = params.mtu || 1350;
      transport.tti = params.tti || 50;
      transport.uplinkCapacity = params.uplinkCapacity || 5;
      transport.downlinkCapacity = params.downlinkCapacity || 20;
      transport.congestion = !!params.congestion;
      transport.readBufferSize = params.readBufferSize || 2;
      transport.writeBufferSize = params.writeBufferSize || 2;
      transport.headerType = params.header?.type || 'none';
    }

    return transport;
  }

  /**
   * 添加传输层参数到URL
   * @param {URLSearchParams} params - URL参数对象
   * @param {Object} node - 节点对象
   */
  static addTransportParams(params, node) {
    if (!node.transport || !node.network) return;

    const normalizedNetwork = this.normalizeNetworkType(node.network);

    try {
      switch (normalizedNetwork) {
        case TransportTypes.WS:
          this.addWebSocketParams(params, node.transport);
          break;
        case TransportTypes.H2:
          this.addHTTP2Params(params, node.transport);
          break;
        case TransportTypes.GRPC:
          this.addGRPCParams(params, node.transport);
          break;
        case TransportTypes.TCP:
          this.addTCPParams(params, node.transport);
          break;
        case TransportTypes.QUIC:
          this.addQUICParams(params, node.transport);
          break;
        case TransportTypes.KCP:
          this.addKCPParams(params, node.transport);
          break;
      }
    } catch (error) {
      ParserErrorHandler.logError(
        'TRANSPORT',
        'addParams',
        error,
        { network: node.network },
        ErrorTypes.CONVERSION_ERROR,
        ErrorSeverity.MEDIUM
      );
    }
  }

  /**
   * 添加WebSocket参数
   * @param {URLSearchParams} params - URL参数
   * @param {Object} transport - 传输配置
   */
  static addWebSocketParams(params, transport) {
    if (transport.path) params.set('path', transport.path);
    if (transport.host) params.set('host', transport.host);

    // 添加headers
    if (transport.headers && typeof transport.headers === 'object') {
      for (const [key, value] of Object.entries(transport.headers)) {
        params.set(`header-${key}`, value);
      }
    }

    if (transport.earlyData !== undefined) {
      params.set('ed', transport.earlyData.toString());
    }
  }

  /**
   * 添加HTTP/2参数
   * @param {URLSearchParams} params - URL参数
   * @param {Object} transport - 传输配置
   */
  static addHTTP2Params(params, transport) {
    if (transport.path) params.set('path', transport.path);
    if (transport.host) params.set('host', transport.host);
    if (transport.method) params.set('method', transport.method);

    // 添加headers
    if (transport.headers && typeof transport.headers === 'object') {
      for (const [key, value] of Object.entries(transport.headers)) {
        params.set(`header-${key}`, value);
      }
    }
  }

  /**
   * 添加gRPC参数
   * @param {URLSearchParams} params - URL参数
   * @param {Object} transport - 传输配置
   */
  static addGRPCParams(params, transport) {
    if (transport.serviceName) params.set('servicename', transport.serviceName);
    if (transport.mode) params.set('mode', transport.mode);
    if (transport.authority) params.set('authority', transport.authority);
    if (transport.multiMode) params.set('multiMode', 'true');
  }

  /**
   * 添加TCP参数
   * @param {URLSearchParams} params - URL参数
   * @param {Object} transport - 传输配置
   */
  static addTCPParams(params, transport) {
    if (transport.headerType === 'http') {
      params.set('headerType', 'http');
      if (transport.host) params.set('host', transport.host);
      if (transport.path) params.set('path', transport.path);
      if (transport.method) params.set('method', transport.method);
    }
  }

  /**
   * 添加QUIC参数
   * @param {URLSearchParams} params - URL参数
   * @param {Object} transport - 传输配置
   */
  static addQUICParams(params, transport) {
    if (transport.security) params.set('security', transport.security);
    if (transport.key) params.set('key', transport.key);
    if (transport.headerType) params.set('headerType', transport.headerType);
  }

  /**
   * 添加KCP参数
   * @param {URLSearchParams} params - URL参数
   * @param {Object} transport - 传输配置
   */
  static addKCPParams(params, transport) {
    if (transport.mtu) params.set('mtu', transport.mtu.toString());
    if (transport.tti) params.set('tti', transport.tti.toString());
    if (transport.uplinkCapacity) params.set('uplinkCapacity', transport.uplinkCapacity.toString());
    if (transport.downlinkCapacity) params.set('downlinkCapacity', transport.downlinkCapacity.toString());
    if (transport.congestion) params.set('congestion', 'true');
    if (transport.readBufferSize) params.set('readBufferSize', transport.readBufferSize.toString());
    if (transport.writeBufferSize) params.set('writeBufferSize', transport.writeBufferSize.toString());
    if (transport.headerType) params.set('headerType', transport.headerType);
  }

  /**
   * 转换为Clash格式
   * @param {Object} node - 节点对象
   * @returns {Object} Clash传输配置
   */
  static toClashFormat(node) {
    if (!node.transport || !node.network) return {};

    const normalizedNetwork = this.normalizeNetworkType(node.network);

    try {
      switch (normalizedNetwork) {
        case TransportTypes.WS:
          return {
            'ws-opts': {
              path: node.transport.path || '/',
              headers: node.transport.headers || (node.transport.host ? { Host: node.transport.host } : {}),
              'early-data-header-name': node.transport.earlyDataHeaderName
            }
          };

        case TransportTypes.H2:
          return {
            'h2-opts': {
              host: node.transport.host ? [node.transport.host] : [],
              path: node.transport.path || '/',
              method: node.transport.method || 'GET'
            }
          };

        case TransportTypes.GRPC:
          return {
            'grpc-opts': {
              'grpc-service-name': node.transport.serviceName || '',
              'grpc-mode': node.transport.mode || 'gun'
            }
          };

        default:
          return {};
      }
    } catch (error) {
      ParserErrorHandler.logError(
        'TRANSPORT',
        'toClash',
        error,
        { network: node.network },
        ErrorTypes.CONVERSION_ERROR,
        ErrorSeverity.MEDIUM
      );
      return {};
    }
  }

  /**
   * 从Clash格式解析
   * @param {Object} clashNode - Clash节点配置
   * @param {string} network - 网络类型
   * @returns {Object} 标准传输配置
   */
  static fromClashFormat(clashNode, network) {
    const normalizedNetwork = this.normalizeNetworkType(network);

    try {
      switch (normalizedNetwork) {
        case TransportTypes.WS:
          if (clashNode['ws-opts']) {
            return {
              path: clashNode['ws-opts'].path || '/',
              headers: clashNode['ws-opts'].headers || {},
              host: clashNode['ws-opts'].headers?.Host || '',
              earlyDataHeaderName: clashNode['ws-opts']['early-data-header-name']
            };
          }
          break;

        case TransportTypes.H2:
          if (clashNode['h2-opts']) {
            return {
              host: clashNode['h2-opts'].host?.[0] || '',
              path: clashNode['h2-opts'].path || '/',
              method: clashNode['h2-opts'].method || 'GET'
            };
          }
          break;

        case TransportTypes.GRPC:
          if (clashNode['grpc-opts']) {
            return {
              serviceName: clashNode['grpc-opts']['grpc-service-name'] || '',
              mode: clashNode['grpc-opts']['grpc-mode'] || 'gun'
            };
          }
          break;
      }
    } catch (error) {
      ParserErrorHandler.logError(
        'TRANSPORT',
        'fromClash',
        error,
        { network },
        ErrorTypes.CONVERSION_ERROR,
        ErrorSeverity.MEDIUM
      );
    }

    return {};
  }

  /**
   * 标准化网络类型
   * @param {string} network - 网络类型
   * @returns {string} 标准化后的网络类型
   */
  static normalizeNetworkType(network) {
    if (!network || typeof network !== 'string') {
      return TransportTypes.TCP;
    }

    const normalized = network.toLowerCase().trim();

    switch (normalized) {
      case 'ws':
      case 'websocket':
        return TransportTypes.WS;
      case 'h2':
      case 'http':
        return TransportTypes.H2;
      case 'grpc':
        return TransportTypes.GRPC;
      case 'quic':
        return TransportTypes.QUIC;
      case 'kcp':
        return TransportTypes.KCP;
      case 'tcp':
      default:
        return TransportTypes.TCP;
    }
  }

  /**
   * 验证传输层配置
   * @param {Object} transport - 传输配置
   * @param {string} network - 网络类型
   * @returns {Object} 验证结果
   */
  static validateTransportConfig(transport, network) {
    const errors = [];
    const warnings = [];
    const normalizedNetwork = this.normalizeNetworkType(network);

    if (!transport || typeof transport !== 'object') {
      return {
        isValid: true, // 传输配置是可选的
        errors: [],
        warnings: ['No transport configuration provided, using defaults']
      };
    }

    switch (normalizedNetwork) {
      case TransportTypes.WS:
        if (transport.path && !transport.path.startsWith('/')) {
          warnings.push('WebSocket path should start with "/"');
        }
        if (transport.headers && typeof transport.headers !== 'object') {
          errors.push('WebSocket headers must be an object');
        }
        break;

      case TransportTypes.H2:
        if (transport.path && !transport.path.startsWith('/')) {
          warnings.push('HTTP/2 path should start with "/"');
        }
        if (transport.method && !['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].includes(transport.method.toUpperCase())) {
          warnings.push(`Unusual HTTP method: ${transport.method}`);
        }
        break;

      case TransportTypes.GRPC:
        if (!transport.serviceName) {
          warnings.push('gRPC service name is recommended');
        }
        if (transport.mode && !['gun', 'multi'].includes(transport.mode)) {
          warnings.push(`Unknown gRPC mode: ${transport.mode}`);
        }
        break;

      case TransportTypes.QUIC:
        if (transport.security && !['none', 'aes-128-gcm', 'chacha20-poly1305'].includes(transport.security)) {
          warnings.push(`Unknown QUIC security method: ${transport.security}`);
        }
        break;

      case TransportTypes.KCP:
        if (transport.mtu && (transport.mtu < 576 || transport.mtu > 1460)) {
          warnings.push('KCP MTU should be between 576 and 1460');
        }
        if (transport.tti && (transport.tti < 10 || transport.tti > 100)) {
          warnings.push('KCP TTI should be between 10 and 100');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 获取传输层处理统计信息（限制敏感信息）
   * @param {boolean} includeDetails - 是否包含详细信息（仅内部使用）
   * @returns {Object} 统计信息
   */
  static getProcessingStats(includeDetails = false) {
    const basicStats = {
      successRate: this.processingStats.total > 0 ?
        (this.processingStats.successful / this.processingStats.total * 100).toFixed(2) + '%' : '0%',
      timestamp: new Date().toISOString(),
      status: 'active'
    };

    // 只有内部调用才返回详细信息
    if (includeDetails && this.isInternalCall()) {
      return {
        ...basicStats,
        total: Math.min(this.processingStats.total, 10000), // 限制显示的数量
        successful: Math.min(this.processingStats.successful, 10000),
        failed: Math.min(this.processingStats.failed, 1000)
      };
    }

    return basicStats;
  }

  /**
   * 检查是否为内部调用
   * @returns {boolean} 是否为内部调用
   */
  static isInternalCall() {
    const stack = new Error().stack;
    return stack && (
      stack.includes('transport-handler.js') ||
      stack.includes('error-handler.js') ||
      stack.includes('cache.js')
    );
  }

  /**
   * 清除处理统计信息
   */
  static clearProcessingStats() {
    this.processingStats = {
      total: 0,
      successful: 0,
      failed: 0,
      byType: {}
    };
  }

  /**
   * 安全克隆传输配置（防止原型污染）
   * @param {Object} transport - 传输配置
   * @returns {Object} 克隆后的配置
   */
  static cloneTransportConfig(transport) {
    if (!transport || typeof transport !== 'object') {
      return {};
    }

    try {
      // 使用更安全的深拷贝方法
      return this.safeDeepClone(transport);
    } catch (error) {
      ParserErrorHandler.logError(
        'TRANSPORT',
        'clone',
        error,
        {},
        ErrorTypes.CONVERSION_ERROR,
        ErrorSeverity.LOW
      );
      return {};
    }
  }

  /**
   * 安全的深拷贝方法，防止原型污染
   * @param {any} obj - 要克隆的对象
   * @param {number} depth - 当前递归深度
   * @param {number} maxDepth - 最大递归深度
   * @returns {any} 克隆后的对象
   */
  static safeDeepClone(obj, depth = 0, maxDepth = 10) {
    if (depth > maxDepth) {
      throw new Error('Object too deeply nested');
    }

    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // 检查危险属性
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    for (const key of dangerousKeys) {
      if (key in obj) {
        throw new Error(`Dangerous property detected: ${key}`);
      }
    }

    if (Array.isArray(obj)) {
      // 限制数组大小
      if (obj.length > 1000) {
        throw new Error('Array too large');
      }
      return obj.map(item => this.safeDeepClone(item, depth + 1, maxDepth));
    }

    const cloned = Object.create(null); // 创建无原型对象
    for (const [key, value] of Object.entries(obj)) {
      if (typeof key !== 'string' || key.length > 100) {
        throw new Error(`Invalid property name: ${key}`);
      }

      // 检查属性名是否安全
      if (dangerousKeys.includes(key)) {
        continue; // 跳过危险属性
      }

      cloned[key] = this.safeDeepClone(value, depth + 1, maxDepth);
    }

    return cloned;
  }

  /**
   * 合并传输配置（用于配置继承）
   * @param {Object} baseConfig - 基础配置
   * @param {Object} overrideConfig - 覆盖配置
   * @returns {Object} 合并后的配置
   */
  static mergeTransportConfig(baseConfig, overrideConfig) {
    const base = this.cloneTransportConfig(baseConfig);
    const override = this.cloneTransportConfig(overrideConfig);

    return {
      ...base,
      ...override,
      // 特殊处理headers合并
      headers: {
        ...(base.headers || {}),
        ...(override.headers || {})
      }
    };
  }

  /**
   * 获取传输类型的默认配置
   * @param {string} network - 网络类型
   * @returns {Object} 默认配置
   */
  static getDefaultConfig(network) {
    const normalizedNetwork = this.normalizeNetworkType(network);

    switch (normalizedNetwork) {
      case TransportTypes.WS:
        return {
          path: '/',
          headers: {}
        };

      case TransportTypes.H2:
        return {
          path: '/',
          method: 'GET',
          headers: {}
        };

      case TransportTypes.GRPC:
        return {
          serviceName: '',
          mode: 'gun'
        };

      case TransportTypes.QUIC:
        return {
          security: 'none',
          headerType: 'none'
        };

      case TransportTypes.KCP:
        return {
          mtu: 1350,
          tti: 50,
          uplinkCapacity: 5,
          downlinkCapacity: 20,
          congestion: false,
          readBufferSize: 2,
          writeBufferSize: 2,
          headerType: 'none'
        };

      case TransportTypes.TCP:
      default:
        return {};
    }
  }

  /**
   * 检查传输配置是否为默认配置
   * @param {Object} transport - 传输配置
   * @param {string} network - 网络类型
   * @returns {boolean} 是否为默认配置
   */
  static isDefaultConfig(transport, network) {
    const defaultConfig = this.getDefaultConfig(network);

    try {
      // 使用安全的深度比较而不是JSON.stringify
      return this.deepEqual(transport, defaultConfig);
    } catch (error) {
      return false;
    }
  }

  /**
   * 安全的深度比较方法
   * @param {any} obj1 - 第一个对象
   * @param {any} obj2 - 第二个对象
   * @param {number} depth - 当前递归深度
   * @param {number} maxDepth - 最大递归深度
   * @returns {boolean} 是否相等
   */
  static deepEqual(obj1, obj2, depth = 0, maxDepth = 10) {
    if (depth > maxDepth) {
      return false; // 防止无限递归
    }

    // 基本类型比较
    if (obj1 === obj2) {
      return true;
    }

    // null和undefined处理
    if (obj1 == null || obj2 == null) {
      return obj1 === obj2;
    }

    // 类型检查
    if (typeof obj1 !== typeof obj2) {
      return false;
    }

    // 数组比较
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
      if (obj1.length !== obj2.length) {
        return false;
      }
      for (let i = 0; i < obj1.length; i++) {
        if (!this.deepEqual(obj1[i], obj2[i], depth + 1, maxDepth)) {
          return false;
        }
      }
      return true;
    }

    // 对象比较
    if (typeof obj1 === 'object' && typeof obj2 === 'object') {
      const keys1 = Object.keys(obj1);
      const keys2 = Object.keys(obj2);

      if (keys1.length !== keys2.length) {
        return false;
      }

      for (const key of keys1) {
        if (!keys2.includes(key)) {
          return false;
        }
        if (!this.deepEqual(obj1[key], obj2[key], depth + 1, maxDepth)) {
          return false;
        }
      }
      return true;
    }

    return false;
  }

  /**
   * 优化传输配置（移除默认值以减少配置大小）
   * @param {Object} transport - 传输配置
   * @param {string} network - 网络类型
   * @returns {Object} 优化后的配置
   */
  static optimizeConfig(transport, network) {
    if (!transport || typeof transport !== 'object') {
      return {};
    }

    const defaultConfig = this.getDefaultConfig(network);
    const optimized = {};

    for (const [key, value] of Object.entries(transport)) {
      // 只保留非默认值
      if (defaultConfig[key] !== value) {
        optimized[key] = value;
      }
    }

    return optimized;
  }
}

/**
 * 传输层配置构建器
 * 提供链式API来构建传输配置
 */
export class TransportConfigBuilder {
  constructor(network) {
    this.network = network;
    this.config = TransportHandler.getDefaultConfig(network);
  }

  /**
   * 设置路径
   * @param {string} path - 路径
   * @returns {TransportConfigBuilder} 构建器实例
   */
  setPath(path) {
    this.config.path = path;
    return this;
  }

  /**
   * 设置主机
   * @param {string} host - 主机
   * @returns {TransportConfigBuilder} 构建器实例
   */
  setHost(host) {
    this.config.host = host;
    return this;
  }

  /**
   * 设置服务名称（gRPC）
   * @param {string} serviceName - 服务名称
   * @returns {TransportConfigBuilder} 构建器实例
   */
  setServiceName(serviceName) {
    this.config.serviceName = serviceName;
    return this;
  }

  /**
   * 设置模式（gRPC）
   * @param {string} mode - 模式
   * @returns {TransportConfigBuilder} 构建器实例
   */
  setMode(mode) {
    this.config.mode = mode;
    return this;
  }

  /**
   * 添加头部
   * @param {string} key - 头部键
   * @param {string} value - 头部值
   * @returns {TransportConfigBuilder} 构建器实例
   */
  addHeader(key, value) {
    if (!this.config.headers) {
      this.config.headers = {};
    }
    this.config.headers[key] = value;
    return this;
  }

  /**
   * 设置头部对象
   * @param {Object} headers - 头部对象
   * @returns {TransportConfigBuilder} 构建器实例
   */
  setHeaders(headers) {
    this.config.headers = { ...headers };
    return this;
  }

  /**
   * 构建配置
   * @returns {Object} 传输配置
   */
  build() {
    return TransportHandler.cloneTransportConfig(this.config);
  }

  /**
   * 验证并构建配置
   * @returns {Object} 包含配置和验证结果的对象
   */
  buildWithValidation() {
    const config = this.build();
    const validation = TransportHandler.validateTransportConfig(config, this.network);

    return {
      config,
      validation,
      isValid: validation.isValid
    };
  }
}

// 导出便捷函数
export const parseTransport = (params, network, source) =>
  TransportHandler.parseTransportParams(params, network, source);

export const addTransportParams = (params, node) =>
  TransportHandler.addTransportParams(params, node);

export const toClashTransport = (node) =>
  TransportHandler.toClashFormat(node);

export const fromClashTransport = (clashNode, network) =>
  TransportHandler.fromClashFormat(clashNode, network);

export const validateTransport = (transport, network) =>
  TransportHandler.validateTransportConfig(transport, network);

export const createTransportBuilder = (network) =>
  new TransportConfigBuilder(network);