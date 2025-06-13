/**
 * 增强的输入验证器
 * 提供更严格和全面的输入验证功能
 */

import { SafeInputSanitizer, SafeIPValidator } from './security.js';
import { RegexSecurityAnalyzer } from './regex-security.js';

/**
 * 增强的输入验证器类
 */
export class EnhancedValidator {
  // 验证规则缓存
  static validationCache = new Map();
  
  // 验证统计
  static stats = {
    totalValidations: 0,
    passedValidations: 0,
    failedValidations: 0,
    cacheHits: 0,
    lastReset: Date.now()
  };

  /**
   * 验证URL格式（增强版）
   * @param {string} url - URL字符串
   * @param {Object} options - 验证选项
   * @returns {Object} 验证结果
   */
  static validateURL(url, options = {}) {
    const {
      allowedProtocols = ['http', 'https', 'ws', 'wss'],
      maxLength = 2048,
      allowLocalhost = true,
      allowPrivateIPs = true,
      requireTLS = false
    } = options;

    this.stats.totalValidations++;

    // 基础检查
    if (!url || typeof url !== 'string') {
      this.stats.failedValidations++;
      return {
        isValid: false,
        errors: ['URL must be a non-empty string'],
        sanitized: null
      };
    }

    // 长度检查
    if (url.length > maxLength) {
      this.stats.failedValidations++;
      return {
        isValid: false,
        errors: [`URL too long: ${url.length} > ${maxLength}`],
        sanitized: null
      };
    }

    // 清理输入
    const sanitized = SafeInputSanitizer.sanitizeInput(url, {
      maxLength,
      removeControlChars: true,
      removeScriptTags: true
    });

    if (sanitized !== url) {
      this.stats.failedValidations++;
      return {
        isValid: false,
        errors: ['URL contains dangerous characters'],
        sanitized
      };
    }

    try {
      const urlObj = new URL(sanitized);
      
      // 协议检查
      if (!allowedProtocols.includes(urlObj.protocol.slice(0, -1))) {
        this.stats.failedValidations++;
        return {
          isValid: false,
          errors: [`Protocol not allowed: ${urlObj.protocol}`],
          sanitized
        };
      }

      // TLS检查
      if (requireTLS && !['https', 'wss'].includes(urlObj.protocol.slice(0, -1))) {
        this.stats.failedValidations++;
        return {
          isValid: false,
          errors: ['TLS required but protocol is not secure'],
          sanitized
        };
      }

      // 主机名检查
      const hostValidation = this.validateHostname(urlObj.hostname, {
        allowLocalhost,
        allowPrivateIPs
      });

      if (!hostValidation.isValid) {
        this.stats.failedValidations++;
        return {
          isValid: false,
          errors: hostValidation.errors,
          sanitized
        };
      }

      // 端口检查
      if (urlObj.port) {
        const portNum = parseInt(urlObj.port, 10);
        if (portNum < 1 || portNum > 65535) {
          this.stats.failedValidations++;
          return {
            isValid: false,
            errors: [`Invalid port: ${portNum}`],
            sanitized
          };
        }
      }

      this.stats.passedValidations++;
      return {
        isValid: true,
        errors: [],
        sanitized,
        parsed: {
          protocol: urlObj.protocol.slice(0, -1),
          hostname: urlObj.hostname,
          port: urlObj.port || this.getDefaultPort(urlObj.protocol),
          pathname: urlObj.pathname,
          search: urlObj.search,
          hash: urlObj.hash
        }
      };

    } catch (error) {
      this.stats.failedValidations++;
      return {
        isValid: false,
        errors: [`Invalid URL format: ${error.message}`],
        sanitized
      };
    }
  }

  /**
   * 验证主机名
   * @param {string} hostname - 主机名
   * @param {Object} options - 验证选项
   * @returns {Object} 验证结果
   */
  static validateHostname(hostname, options = {}) {
    const { allowLocalhost = true, allowPrivateIPs = true } = options;

    if (!hostname || typeof hostname !== 'string') {
      return {
        isValid: false,
        errors: ['Hostname must be a non-empty string']
      };
    }

    // 检查是否为IP地址
    const ipv4Result = SafeIPValidator.validateIPv4(hostname);
    const ipv6Result = SafeIPValidator.validateIPv6(hostname);

    if (ipv4Result.isValid || ipv6Result.isValid) {
      // IP地址验证
      if (!allowLocalhost && this.isLocalhostIP(hostname)) {
        return {
          isValid: false,
          errors: ['Localhost IPs not allowed']
        };
      }

      if (!allowPrivateIPs && this.isPrivateIP(hostname)) {
        return {
          isValid: false,
          errors: ['Private IPs not allowed']
        };
      }

      return { isValid: true, errors: [] };
    }

    // 域名验证
    return this.validateDomainName(hostname, { allowLocalhost });
  }

  /**
   * 验证域名
   * @param {string} domain - 域名
   * @param {Object} options - 验证选项
   * @returns {Object} 验证结果
   */
  static validateDomainName(domain, options = {}) {
    const { allowLocalhost = true } = options;

    // 基础检查
    if (domain.length > 253) {
      return {
        isValid: false,
        errors: ['Domain name too long']
      };
    }

    // localhost检查
    if (!allowLocalhost && (domain === 'localhost' || domain.endsWith('.localhost'))) {
      return {
        isValid: false,
        errors: ['Localhost domains not allowed']
      };
    }

    // 分割并验证每个标签
    const labels = domain.split('.');
    
    for (const label of labels) {
      if (!this.validateDomainLabel(label)) {
        return {
          isValid: false,
          errors: [`Invalid domain label: ${label}`]
        };
      }
    }

    // 顶级域名检查
    if (labels.length >= 2) {
      const tld = labels[labels.length - 1];
      if (!this.isValidTLD(tld)) {
        return {
          isValid: false,
          errors: [`Invalid TLD: ${tld}`]
        };
      }
    }

    return { isValid: true, errors: [] };
  }

  /**
   * 验证域名标签
   * @param {string} label - 域名标签
   * @returns {boolean} 是否有效
   */
  static validateDomainLabel(label) {
    if (!label || label.length === 0 || label.length > 63) {
      return false;
    }

    // 不能以连字符开始或结束
    if (label.startsWith('-') || label.endsWith('-')) {
      return false;
    }

    // 只能包含字母、数字和连字符
    for (let i = 0; i < label.length; i++) {
      const char = label[i];
      const code = char.charCodeAt(0);
      
      if (!((code >= 97 && code <= 122) ||  // a-z
            (code >= 65 && code <= 90) ||   // A-Z
            (code >= 48 && code <= 57) ||   // 0-9
            code === 45)) {                 // -
        return false;
      }
    }

    return true;
  }

  /**
   * 检查是否为有效的顶级域名
   * @param {string} tld - 顶级域名
   * @returns {boolean} 是否有效
   */
  static isValidTLD(tld) {
    // 简化的TLD检查，实际应用中可以使用完整的TLD列表
    const commonTLDs = [
      'com', 'org', 'net', 'edu', 'gov', 'mil', 'int',
      'cn', 'uk', 'de', 'fr', 'jp', 'au', 'ca', 'ru',
      'io', 'co', 'me', 'tv', 'cc', 'ly', 'to'
    ];

    return tld.length >= 2 && tld.length <= 6 && 
           (commonTLDs.includes(tld.toLowerCase()) || /^[a-z]{2,6}$/i.test(tld));
  }

  /**
   * 检查是否为localhost IP
   * @param {string} ip - IP地址
   * @returns {boolean} 是否为localhost
   */
  static isLocalhostIP(ip) {
    const localhostIPs = ['127.0.0.1', '::1', '0.0.0.0'];
    return localhostIPs.includes(ip) || ip.startsWith('127.');
  }

  /**
   * 检查是否为私有IP
   * @param {string} ip - IP地址
   * @returns {boolean} 是否为私有IP
   */
  static isPrivateIP(ip) {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,  // 链路本地地址
      /^fc00:/,       // IPv6 ULA
      /^fe80:/        // IPv6 链路本地地址
    ];

    return privateRanges.some(range => range.test(ip));
  }

  /**
   * 获取协议的默认端口
   * @param {string} protocol - 协议
   * @returns {string} 默认端口
   */
  static getDefaultPort(protocol) {
    const defaultPorts = {
      'http:': '80',
      'https:': '443',
      'ws:': '80',
      'wss:': '443',
      'ftp:': '21',
      'ssh:': '22'
    };

    return defaultPorts[protocol] || '';
  }

  /**
   * 验证端口号
   * @param {any} port - 端口号
   * @param {Object} options - 验证选项
   * @returns {Object} 验证结果
   */
  static validatePort(port, options = {}) {
    const { allowWellKnown = true, allowRegistered = true, allowDynamic = true } = options;

    const portNum = parseInt(port, 10);

    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return {
        isValid: false,
        errors: ['Port must be between 1 and 65535'],
        normalized: null
      };
    }

    // 端口范围检查
    if (portNum <= 1023 && !allowWellKnown) {
      return {
        isValid: false,
        errors: ['Well-known ports (1-1023) not allowed'],
        normalized: null
      };
    }

    if (portNum >= 1024 && portNum <= 49151 && !allowRegistered) {
      return {
        isValid: false,
        errors: ['Registered ports (1024-49151) not allowed'],
        normalized: null
      };
    }

    if (portNum >= 49152 && !allowDynamic) {
      return {
        isValid: false,
        errors: ['Dynamic ports (49152-65535) not allowed'],
        normalized: null
      };
    }

    return {
      isValid: true,
      errors: [],
      normalized: portNum
    };
  }

  /**
   * 获取验证统计信息
   * @returns {Object} 统计信息
   */
  static getStats() {
    const now = Date.now();
    const duration = now - this.stats.lastReset;
    
    return {
      ...this.stats,
      successRate: this.stats.totalValidations > 0 ? 
        (this.stats.passedValidations / this.stats.totalValidations * 100).toFixed(2) + '%' : '0%',
      cacheHitRate: this.stats.totalValidations > 0 ?
        (this.stats.cacheHits / this.stats.totalValidations * 100).toFixed(2) + '%' : '0%',
      duration: duration,
      validationsPerSecond: duration > 0 ? (this.stats.totalValidations / (duration / 1000)).toFixed(2) : '0'
    };
  }

  /**
   * 重置统计信息
   */
  static resetStats() {
    this.stats = {
      totalValidations: 0,
      passedValidations: 0,
      failedValidations: 0,
      cacheHits: 0,
      lastReset: Date.now()
    };
  }

  /**
   * 清理验证缓存
   */
  static clearCache() {
    this.validationCache.clear();
  }
}
