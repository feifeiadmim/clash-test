/**
 * 解析器包装器
 * 将现有解析器的输出转换为标准化节点结构
 * 确保全链路数据完整性和一致性
 */

import { StandardNodeStructure, NodeProcessingStatus } from './standard-node-structure.js';
import { ParserErrorHandler } from '../parsers/common/error-handler.js';
import { BaseParser } from './parser-registry.js';

/**
 * 解析器包装器类
 */
export class ParserWrapper extends BaseParser {
  constructor(originalParser, options = {}) {
    super(originalParser.name || 'Unknown', originalParser.type || 'unknown');
    this.originalParser = originalParser;
    this.parserName = originalParser.name || 'Unknown';
    this.options = {
      enableStandardization: true,
      enableValidation: true,
      enablePerformanceTracking: true,
      preserveOriginalFields: true,
      ...options
    };

    this.stats = {
      totalParsed: 0,
      successfulParsed: 0,
      failedParsed: 0,
      standardizationErrors: 0,
      averageParseTime: 0
    };
  }

  /**
   * 测试解析器是否能处理输入内容
   * @param {string} input - 输入内容
   * @returns {boolean} 是否能处理
   */
  test(input) {
    try {
      if (this.originalParser.test) {
        return this.originalParser.test(input);
      }

      // 如果原始解析器没有test方法，尝试基于类型判断
      if (this.originalParser.type) {
        const protocolPrefix = `${this.originalParser.type}://`;
        return input.includes(protocolPrefix);
      }

      // 默认返回false
      return false;
    } catch (error) {
      console.warn(`⚠️ 解析器测试失败 [${this.parserName}]:`, error.message);
      return false;
    }
  }

  /**
   * 包装解析方法
   * @param {string} input - 输入字符串
   * @returns {Promise<Object|null>} 标准化节点对象或null
   */
  async parse(input) {
    const startTime = Date.now();
    this.stats.totalParsed++;

    try {
      // 调用原始解析器
      const originalResult = await this.originalParser.parse(input);
      
      if (!originalResult) {
        return null;
      }

      // 转换为标准化结构
      const standardNode = this.convertToStandardNode(originalResult, input);
      
      // 更新统计
      const parseTime = Date.now() - startTime;
      this.updateStats(parseTime, true);
      
      // 添加性能记录
      if (this.options.enablePerformanceTracking) {
        StandardNodeStructure.addProcessorRecord(standardNode, this.parserName, {
          duration: parseTime,
          success: true,
          metadata: {
            inputLength: input.length,
            outputSize: JSON.stringify(standardNode).length
          }
        });
      }

      return standardNode;

    } catch (error) {
      const parseTime = Date.now() - startTime;
      this.updateStats(parseTime, false);
      
      // 记录错误
      ParserErrorHandler.logError(
        this.parserName,
        'parse',
        error,
        {
          inputLength: input.length,
          inputPreview: input.substring(0, 100)
        }
      );

      return null;
    }
  }

  /**
   * 转换为标准化节点结构
   * @private
   */
  convertToStandardNode(originalResult, originalInput) {
    try {
      // 提取基础信息
      const type = originalResult.type || 'unknown';
      const coreParams = this.extractCoreParams(originalResult);
      
      // 提取元数据
      const metaData = this.extractMetaData(originalResult);
      
      // 提取安全信息
      const securityData = this.extractSecurityData(originalResult);
      
      // 创建标准化节点
      const standardNode = StandardNodeStructure.createStandardNode(
        type,
        coreParams,
        originalInput,
        {
          meta: metaData,
          security: securityData,
          processing: {
            parseTime: Date.now(),
            version: '1.0.0',
            processorVersion: this.parserName
          }
        }
      );

      // 保留原始字段（如果启用）
      if (this.options.preserveOriginalFields) {
        standardNode._original = originalResult;
      }

      // 验证标准化结构
      if (this.options.enableValidation) {
        const validation = StandardNodeStructure.validateStandardNode(standardNode);
        if (!validation.isValid) {
          console.warn(`标准化验证警告 [${this.parserName}]:`, validation.errors);
          this.stats.standardizationErrors++;
        }
      }

      return standardNode;

    } catch (error) {
      this.stats.standardizationErrors++;
      throw new Error(`标准化转换失败: ${error.message}`);
    }
  }

  /**
   * 提取核心连接参数
   * @private
   */
  extractCoreParams(result) {
    const core = {
      server: result.server,
      port: result.port,
      type: result.type
    };

    // 根据协议类型提取特定字段
    switch (result.type?.toLowerCase()) {
      case 'vmess':
        Object.assign(core, {
          uuid: result.uuid || result.id,
          alterId: result.alterId || result.aid || 0,
          cipher: result.cipher || result.scy || 'auto',
          network: result.network || result.net || 'tcp',
          name: result.name || result.ps
        });
        break;

      case 'trojan':
        Object.assign(core, {
          password: result.password,
          network: result.network || 'tcp',
          name: result.name
        });
        break;

      case 'shadowsocks':
      case 'ss':
        Object.assign(core, {
          method: result.method || result.cipher,
          password: result.password,
          name: result.name
        });
        break;

      case 'vless':
        Object.assign(core, {
          uuid: result.uuid || result.id,
          flow: result.flow,
          network: result.network || 'tcp',
          name: result.name
        });
        break;

      case 'hysteria':
        Object.assign(core, {
          auth: result.auth || result.password,
          protocol: result.protocol || 'udp',
          name: result.name
        });
        break;

      case 'tuic':
        Object.assign(core, {
          uuid: result.uuid,
          password: result.password || result.auth,
          version: result.version || 5,
          congestion: result.congestion || 'cubic',
          name: result.name
        });
        break;

      default:
        // 对于未知协议，复制所有非元数据字段
        Object.assign(core, this.extractUnknownProtocolCore(result));
    }

    return core;
  }

  /**
   * 提取元数据
   * @private
   */
  extractMetaData(result) {
    const meta = {};

    // 传输层配置
    if (result.network || result.net) {
      meta.transport = {
        type: result.network || result.net,
        path: result.path,
        host: result.host,
        headers: result.headers
      };
    }

    // TLS配置
    if (result.tls || result.security) {
      meta.tls = {
        enabled: result.tls === 'tls' || result.security === 'tls',
        sni: result.sni,
        alpn: result.alpn,
        fingerprint: result.fp
      };
    }

    // WebSocket配置
    if (result.network === 'ws' || result.net === 'ws') {
      meta.websocket = {
        path: result.path || '/',
        headers: result.headers || {}
      };
    }

    // HTTP/2配置
    if (result.network === 'h2' || result.net === 'h2') {
      meta.http2 = {
        path: result.path,
        host: result.host
      };
    }

    // gRPC配置
    if (result.network === 'grpc' || result.net === 'grpc') {
      meta.grpc = {
        serviceName: result.serviceName || result.path,
        multiMode: result.multiMode || false
      };
    }

    // 地理位置信息
    if (result.geo || result.country || result.region) {
      meta.geo = {
        country: result.country,
        region: result.region,
        city: result.city,
        coordinates: result.coordinates
      };
    }

    // 性能指标
    if (result.performance) {
      meta.performance = result.performance;
    }

    // 标签
    if (result.tags) {
      meta.tags = Array.isArray(result.tags) ? result.tags : [result.tags];
    }

    // 备注
    if (result.remarks || result.remark) {
      meta.remarks = result.remarks || result.remark;
    }

    return meta;
  }

  /**
   * 提取安全信息
   * @private
   */
  extractSecurityData(result) {
    const security = {
      validated: true,
      securityLevel: 'standard'
    };

    // 检查是否有安全相关字段
    if (result.tls || result.security) {
      security.securityLevel = 'high';
      security.flags = ['tls_enabled'];
    }

    // 检查加密方法
    if (result.cipher || result.method) {
      const cipher = result.cipher || result.method;
      if (this.isStrongCipher(cipher)) {
        security.securityLevel = 'high';
      } else if (this.isWeakCipher(cipher)) {
        security.securityLevel = 'low';
        security.flags = security.flags || [];
        security.flags.push('weak_cipher');
      }
    }

    return security;
  }

  /**
   * 提取未知协议的核心字段
   * @private
   */
  extractUnknownProtocolCore(result) {
    const metaFields = ['geo', 'performance', 'tags', 'remarks', 'remark'];
    const core = {};

    for (const [key, value] of Object.entries(result)) {
      if (!metaFields.includes(key)) {
        core[key] = value;
      }
    }

    return core;
  }

  /**
   * 检查是否为强加密
   * @private
   */
  isStrongCipher(cipher) {
    const strongCiphers = [
      'aes-256-gcm',
      'aes-256-cfb',
      'chacha20-poly1305',
      'chacha20-ietf-poly1305'
    ];
    return strongCiphers.includes(cipher.toLowerCase());
  }

  /**
   * 检查是否为弱加密
   * @private
   */
  isWeakCipher(cipher) {
    const weakCiphers = [
      'rc4',
      'rc4-md5',
      'des',
      'des-cfb'
    ];
    return weakCiphers.includes(cipher.toLowerCase());
  }

  /**
   * 更新统计信息
   * @private
   */
  updateStats(parseTime, success) {
    if (success) {
      this.stats.successfulParsed++;
    } else {
      this.stats.failedParsed++;
    }

    // 更新平均解析时间
    const alpha = 0.1;
    this.stats.averageParseTime = this.stats.averageParseTime * (1 - alpha) + parseTime * alpha;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalParsed > 0 ?
        (this.stats.successfulParsed / this.stats.totalParsed * 100).toFixed(2) + '%' : '0%',
      standardizationErrorRate: this.stats.totalParsed > 0 ?
        (this.stats.standardizationErrors / this.stats.totalParsed * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalParsed: 0,
      successfulParsed: 0,
      failedParsed: 0,
      standardizationErrors: 0,
      averageParseTime: 0
    };
  }
}

/**
 * 包装解析器函数
 * @param {Object} parser - 原始解析器
 * @param {Object} options - 包装选项
 * @returns {ParserWrapper} 包装后的解析器
 */
export function wrapParser(parser, options = {}) {
  return new ParserWrapper(parser, options);
}

/**
 * 批量包装解析器
 * @param {Array} parsers - 解析器数组
 * @param {Object} options - 包装选项
 * @returns {Array} 包装后的解析器数组
 */
export function wrapParsers(parsers, options = {}) {
  return parsers.map(parser => wrapParser(parser, options));
}
