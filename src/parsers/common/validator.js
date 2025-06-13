/**
 * 统一节点验证器
 * 提供标准化的节点验证功能，确保数据完整性和一致性
 * 支持基础验证和协议特定验证
 */

import { ProxyTypes } from '../../types.js';
import { ParserErrorHandler, ErrorTypes, ErrorSeverity } from './error-handler.js';
import { SafeIPValidator, SafeInputSanitizer } from '../../utils/security.js';

/**
 * 验证结果类型
 */
export const ValidationResult = {
  VALID: 'valid',
  INVALID: 'invalid',
  WARNING: 'warning'
};

/**
 * 统一节点验证器类
 */
export class NodeValidator {
  static validationStats = {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    byProtocol: {}
  };

  /**
   * 验证基础节点信息
   * @param {Object} node - 节点对象
   * @param {string} protocol - 协议名称
   * @returns {Object} 验证结果
   */
  static validateBasicNode(node, protocol) {
    const errors = [];
    const warnings = [];

    // 更新统计
    this.validationStats.total++;
    this.validationStats.byProtocol[protocol] = (this.validationStats.byProtocol[protocol] || 0) + 1;

    // 基础字段验证
    if (!node || typeof node !== 'object') {
      errors.push('Node must be a valid object');
      this.validationStats.failed++;
      return this.createValidationResult(false, errors, warnings, protocol);
    }

    // 服务器验证
    const serverValidation = this.validateServer(node.server);
    if (!serverValidation.isValid) {
      errors.push(`Invalid server: ${serverValidation.error}`);
    }

    // 端口验证
    const portValidation = this.validatePort(node.port);
    if (!portValidation.isValid) {
      errors.push(`Invalid port: ${portValidation.error}`);
    }

    // 名称验证
    if (!node.name || typeof node.name !== 'string' || node.name.trim().length === 0) {
      warnings.push('Node name is missing or empty, will use default');
    }

    // 协议类型验证
    if (node.type && !Object.values(ProxyTypes).includes(node.type)) {
      warnings.push(`Unknown protocol type: ${node.type}`);
    }

    const isValid = errors.length === 0;
    if (isValid) {
      this.validationStats.passed++;
    } else {
      this.validationStats.failed++;
    }

    if (warnings.length > 0) {
      this.validationStats.warnings++;
    }

    return this.createValidationResult(isValid, errors, warnings, protocol);
  }

  /**
   * 验证服务器地址 - 使用安全的验证方法
   * @param {string} server - 服务器地址
   * @returns {Object} 验证结果
   */
  static validateServer(server) {
    if (!server || typeof server !== 'string') {
      return { isValid: false, error: 'Server address is required and must be a string' };
    }

    const trimmedServer = server.trim();
    if (trimmedServer.length === 0) {
      return { isValid: false, error: 'Server address cannot be empty' };
    }

    // 长度限制
    if (trimmedServer.length > 253) {
      return { isValid: false, error: 'Server address too long' };
    }

    try {
      // 检查IPv4映射的IPv6地址
      const ipv4Mapped = SafeIPValidator.parseIPv4MappedIPv6(trimmedServer);
      if (ipv4Mapped) {
        return SafeIPValidator.validateIPv4(ipv4Mapped);
      }

      // 尝试IPv4验证
      const ipv4Result = SafeIPValidator.validateIPv4(trimmedServer);
      if (ipv4Result.isValid) {
        return ipv4Result;
      }

      // 尝试IPv6验证
      const ipv6Result = SafeIPValidator.validateIPv6(trimmedServer);
      if (ipv6Result.isValid) {
        return ipv6Result;
      }

      // 尝试域名验证
      const domainResult = this.validateDomain(trimmedServer);
      if (domainResult.isValid) {
        return { isValid: true, normalizedServer: domainResult.normalizedDomain };
      }

      return { isValid: false, error: 'Invalid server address format' };
    } catch (error) {
      return { isValid: false, error: 'Server validation failed' };
    }
  }

  /**
   * 验证域名
   * @param {string} domain - 域名
   * @returns {Object} 验证结果
   */
  static validateDomain(domain) {
    if (!domain || typeof domain !== 'string') {
      return { isValid: false, error: 'Invalid domain input' };
    }

    const trimmed = domain.trim().toLowerCase();

    // 长度检查
    if (trimmed.length === 0) {
      return { isValid: false, error: 'Domain cannot be empty' };
    }

    if (trimmed.length > 253) {
      return { isValid: false, error: 'Domain too long' };
    }

    // 分割标签
    const labels = trimmed.split('.');

    if (labels.length < 2) {
      return { isValid: false, error: 'Domain must have at least two labels' };
    }

    // 验证每个标签
    for (const label of labels) {
      const labelValidation = this.validateDomainLabel(label);
      if (!labelValidation.isValid) {
        return labelValidation;
      }
    }

    return { isValid: true, normalizedDomain: trimmed };
  }

  /**
   * 验证域名标签
   * @param {string} label - 域名标签
   * @returns {Object} 验证结果
   */
  static validateDomainLabel(label) {
    if (!label || typeof label !== 'string') {
      return { isValid: false, error: 'Invalid domain label' };
    }

    // 长度检查
    if (label.length === 0 || label.length > 63) {
      return { isValid: false, error: 'Domain label length invalid' };
    }

    // 不能以连字符开始或结束
    if (label.startsWith('-') || label.endsWith('-')) {
      return { isValid: false, error: 'Domain label cannot start or end with hyphen' };
    }

    // 字符检查（允许字母、数字、连字符、下划线）
    if (!/^[a-z0-9_-]+$/.test(label)) {
      return { isValid: false, error: 'Domain label contains invalid characters' };
    }

    return { isValid: true };
  }

  /**
   * 验证端口号
   * @param {string|number} port - 端口号
   * @returns {Object} 验证结果
   */
  static validatePort(port) {
    if (port === undefined || port === null) {
      return { isValid: false, error: 'Port is required' };
    }

    const portNum = parseInt(port);
    if (isNaN(portNum)) {
      return { isValid: false, error: 'Port must be a valid number' };
    }

    if (portNum < 1 || portNum > 65535) {
      return { isValid: false, error: 'Port must be between 1 and 65535' };
    }

    return { isValid: true, port: portNum };
  }

  /**
   * 验证UUID格式 - 使用安全的验证方法
   * @param {string} uuid - UUID字符串
   * @returns {boolean} 是否有效
   */
  static validateUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') {
      return false;
    }

    // 长度检查
    if (uuid.length !== 36) {
      return false;
    }

    // 格式检查：8-4-4-4-12
    if (uuid[8] !== '-' || uuid[13] !== '-' || uuid[18] !== '-' || uuid[23] !== '-') {
      return false;
    }

    // 检查每个部分是否为有效的十六进制
    const parts = [
      uuid.slice(0, 8),
      uuid.slice(9, 13),
      uuid.slice(14, 18),
      uuid.slice(19, 23),
      uuid.slice(24, 36)
    ];

    return parts.every(part => /^[0-9a-fA-F]+$/.test(part));
  }

  /**
   * 安全的密码验证，不泄露密码内容
   * @param {*} password - 密码
   * @param {string} protocol - 协议名称
   * @returns {Object} 验证结果
   */
  static validatePassword(password, protocol) {
    if (password === null || password === undefined) {
      return { isValid: false, error: `Password is required for ${protocol}` };
    }

    if (typeof password === 'string') {
      if (password.trim() === '') {
        return { isValid: false, error: `Password cannot be empty for ${protocol}` };
      }

      // 密码强度检查（可选）
      if (password.length < 6) {
        return {
          isValid: true,
          warning: `Weak password detected for ${protocol} (length: ${password.length})`
        };
      }
    } else if (typeof password === 'number') {
      if (password === 0) {
        return { isValid: false, error: `Password cannot be zero for ${protocol}` };
      }
    } else {
      return { isValid: false, error: `Invalid password type for ${protocol}` };
    }

    return { isValid: true };
  }

  /**
   * 验证协议特定字段
   * @param {Object} node - 节点对象
   * @returns {Object} 验证结果
   */
  static validateProtocolSpecific(node) {
    const errors = [];
    const warnings = [];

    switch (node.type) {
      case ProxyTypes.VLESS:
      case ProxyTypes.VMESS:
        if (!this.validateUUID(node.uuid)) {
          errors.push('Invalid or missing UUID');
        }
        break;

      case ProxyTypes.SHADOWSOCKS:
        // 安全的密码验证，不泄露密码内容
        const passwordValidation = this.validatePassword(node.password, 'Shadowsocks');
        if (!passwordValidation.isValid) {
          errors.push(passwordValidation.error);
        } else if (passwordValidation.warning) {
          warnings.push(passwordValidation.warning);
        }
        if (!node.method || typeof node.method !== 'string') {
          errors.push('Encryption method is required for Shadowsocks');
        }
        break;

      case ProxyTypes.TROJAN:
        const trojanPasswordValidation = this.validatePassword(node.password, 'Trojan');
        if (!trojanPasswordValidation.isValid) {
          errors.push(trojanPasswordValidation.error);
        } else if (trojanPasswordValidation.warning) {
          warnings.push(trojanPasswordValidation.warning);
        }
        break;

      case ProxyTypes.HYSTERIA2:
        if (!node.password && !node.auth) {
          errors.push('Password or auth is required for Hysteria2');
        }
        break;

      case ProxyTypes.SHADOWSOCKSR:
        const ssrPasswordValidation = this.validatePassword(node.password, 'ShadowsocksR');
        if (!ssrPasswordValidation.isValid) {
          errors.push(ssrPasswordValidation.error);
        } else if (ssrPasswordValidation.warning) {
          warnings.push(ssrPasswordValidation.warning);
        }
        if (!node.method || typeof node.method !== 'string') {
          errors.push('Encryption method is required for ShadowsocksR');
        }
        if (!node.protocol || typeof node.protocol !== 'string') {
          errors.push('Protocol is required for ShadowsocksR');
        }
        if (!node.obfs || typeof node.obfs !== 'string') {
          errors.push('Obfuscation method is required for ShadowsocksR');
        }
        break;

      default:
        warnings.push(`Unknown protocol type: ${node.type}, skipping protocol-specific validation`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 完整节点验证
   * @param {Object} node - 节点对象
   * @param {string} protocol - 协议名称
   * @returns {Object} 完整验证结果
   */
  static validateNode(node, protocol) {
    // 基础验证
    const basicValidation = this.validateBasicNode(node, protocol);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    // 协议特定验证
    const protocolValidation = this.validateProtocolSpecific(node);
    
    // 合并结果
    const allErrors = [...basicValidation.errors, ...protocolValidation.errors];
    const allWarnings = [...basicValidation.warnings, ...protocolValidation.warnings];

    const isValid = allErrors.length === 0;
    return this.createValidationResult(isValid, allErrors, allWarnings, protocol);
  }

  /**
   * 创建验证结果对象
   * @param {boolean} isValid - 是否有效
   * @param {Array} errors - 错误列表
   * @param {Array} warnings - 警告列表
   * @param {string} protocol - 协议名称
   * @returns {Object} 验证结果
   */
  static createValidationResult(isValid, errors, warnings, protocol) {
    const result = {
      isValid,
      errors,
      warnings,
      protocol,
      timestamp: new Date().toISOString()
    };

    // 如果有错误，记录到错误处理器
    if (!isValid && errors.length > 0) {
      ParserErrorHandler.logError(
        protocol,
        'validate',
        `Validation failed: ${errors.join(', ')}`,
        { errors, warnings },
        ErrorTypes.VALIDATION_ERROR,
        ErrorSeverity.LOW
      );
    }

    return result;
  }

  /**
   * 获取验证统计信息（限制敏感信息）
   * @param {boolean} includeDetails - 是否包含详细信息（仅内部使用）
   * @returns {Object} 统计信息
   */
  static getValidationStats(includeDetails = false) {
    const basicStats = {
      successRate: this.validationStats.total > 0 ?
        (this.validationStats.passed / this.validationStats.total * 100).toFixed(2) + '%' : '0%',
      timestamp: new Date().toISOString(),
      status: 'active'
    };

    // 只有内部调用才返回详细信息
    if (includeDetails && this.isInternalCall()) {
      return {
        ...basicStats,
        total: this.validationStats.total,
        passed: this.validationStats.passed,
        failed: this.validationStats.failed,
        errors: this.validationStats.errors.slice(-5) // 只返回最近5个错误
      };
    }

    return basicStats;
  }

  /**
   * 检查是否为内部调用
   * @returns {boolean} 是否为内部调用
   */
  static isInternalCall() {
    // 简单的内部调用检查
    const stack = new Error().stack;
    return stack && (
      stack.includes('validator.js') ||
      stack.includes('error-handler.js') ||
      stack.includes('cache.js')
    );
  }

  /**
   * 清除验证统计信息
   */
  static clearValidationStats() {
    this.validationStats = {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      byProtocol: {}
    };
  }

  /**
   * 批量验证节点（带资源限制）
   * @param {Array} nodes - 节点数组
   * @param {string} protocol - 协议名称
   * @param {Object} options - 验证选项
   * @returns {Object} 批量验证结果
   */
  static async validateNodes(nodes, protocol, options = {}) {
    const { maxNodes = 10000, batchSize = 1000, timeoutMs = 30000 } = options;

    if (!Array.isArray(nodes)) {
      return {
        isValid: false,
        errors: ['Input must be an array of nodes'],
        validNodes: [],
        invalidNodes: [],
        totalCount: 0,
        validCount: 0,
        invalidCount: 0
      };
    }

    // 限制节点数量
    if (nodes.length > maxNodes) {
      return {
        isValid: false,
        errors: [`Too many nodes: ${nodes.length} > ${maxNodes}`],
        validNodes: [],
        invalidNodes: [],
        totalCount: nodes.length,
        validCount: 0,
        invalidCount: 0
      };
    }

    const validNodes = [];
    const invalidNodes = [];
    const startTime = Date.now();

    // 分批处理
    for (let i = 0; i < nodes.length; i += batchSize) {
      // 检查超时
      if (Date.now() - startTime > timeoutMs) {
        console.warn('⚠️ 批量验证超时，停止处理');
        break;
      }

      const batch = nodes.slice(i, i + batchSize);

      for (const node of batch) {
        try {
          const validation = this.validateNode(node, protocol);
          if (validation.isValid) {
            validNodes.push(node);
          } else {
            invalidNodes.push({
              node,
              validation
            });
          }
        } catch (error) {
          invalidNodes.push({
            node,
            validation: {
              isValid: false,
              errors: [`Validation error: ${error.message}`]
            }
          });
        }
      }

      // 内存检查（如果可用）
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const memUsage = process.memoryUsage();
        if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB限制
          console.warn('⚠️ 内存使用过高，停止批量验证');
          break;
        }
      }

      // 让出控制权，避免阻塞
      if (i + batchSize < nodes.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    return {
      isValid: invalidNodes.length === 0,
      validNodes,
      invalidNodes,
      totalCount: nodes.length,
      validCount: validNodes.length,
      invalidCount: invalidNodes.length,
      successRate: nodes.length > 0 ? (validNodes.length / nodes.length * 100).toFixed(2) + '%' : '0%',
      processingTime: Date.now() - startTime
    };
  }
}

// 导出便捷验证函数
export const validateNode = (node, protocol) => NodeValidator.validateNode(node, protocol);
export const validateNodes = async (nodes, protocol, options) => await NodeValidator.validateNodes(nodes, protocol, options);
export const isValidServer = (server) => NodeValidator.validateServer(server).isValid;
export const isValidPort = (port) => NodeValidator.validatePort(port).isValid;
export const isValidUUID = (uuid) => NodeValidator.validateUUID(uuid);
