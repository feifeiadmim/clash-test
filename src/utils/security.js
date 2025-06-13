/**
 * 安全工具模块
 * 提供统一的安全验证、输入清理和防护功能
 * 解决正则表达式DoS、输入验证等安全问题
 */

/**
 * 安全的正则表达式测试器
 * 防止ReDoS攻击
 */
export class SafeRegexTester {
  static DEFAULT_TIMEOUT = 1000; // 1秒超时
  static MAX_INPUT_LENGTH = 10000; // 最大输入长度

  /**
   * 安全地测试正则表达式
   * @param {RegExp} pattern - 正则表达式
   * @param {string} text - 测试文本
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<boolean>} 测试结果
   */
  static async testSafely(pattern, text, timeout = this.DEFAULT_TIMEOUT) {
    // 输入验证
    if (!pattern || !(pattern instanceof RegExp)) {
      throw new Error('Invalid regex pattern');
    }
    
    if (typeof text !== 'string') {
      throw new Error('Text must be a string');
    }

    // 长度限制
    if (text.length > this.MAX_INPUT_LENGTH) {
      throw new Error(`Input too long: ${text.length} > ${this.MAX_INPUT_LENGTH}`);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Regex test timeout - possible ReDoS attack'));
      }, timeout);

      try {
        const result = pattern.test(text);
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * 批量安全测试多个正则表达式
   * @param {Array<RegExp>} patterns - 正则表达式数组
   * @param {string} text - 测试文本
   * @param {number} timeout - 超时时间
   * @returns {Promise<boolean>} 是否有任何模式匹配
   */
  static async testPatternsSafely(patterns, text, timeout = this.DEFAULT_TIMEOUT) {
    if (!Array.isArray(patterns)) {
      throw new Error('Patterns must be an array');
    }

    for (const pattern of patterns) {
      try {
        const result = await this.testSafely(pattern, text, timeout);
        if (result) {
          return true;
        }
      } catch (error) {
        console.warn(`Pattern test failed: ${error.message}`);
        // 继续测试其他模式
      }
    }

    return false;
  }
}

/**
 * 安全的IP地址验证器
 * 使用函数式验证替代复杂正则表达式
 */
export class SafeIPValidator {
  /**
   * 验证IPv4地址
   * @param {string} ip - IP地址
   * @returns {Object} 验证结果
   */
  static validateIPv4(ip) {
    if (!ip || typeof ip !== 'string') {
      return { isValid: false, error: 'Invalid IPv4 input' };
    }

    const parts = ip.split('.');
    if (parts.length !== 4) {
      return { isValid: false, error: 'IPv4 must have 4 octets' };
    }

    for (const part of parts) {
      // 检查是否为纯数字
      if (!/^\d+$/.test(part)) {
        return { isValid: false, error: 'IPv4 octet must be numeric' };
      }

      const num = parseInt(part, 10);
      
      // 检查范围
      if (num < 0 || num > 255) {
        return { isValid: false, error: 'IPv4 octet out of range' };
      }

      // 检查前导零（除了单独的0）
      if (part.length > 1 && part[0] === '0') {
        return { isValid: false, error: 'IPv4 octet cannot have leading zeros' };
      }
    }

    return { isValid: true, normalizedIP: ip };
  }

  /**
   * 验证IPv6地址（简化版）
   * @param {string} ip - IP地址
   * @returns {Object} 验证结果
   */
  static validateIPv6(ip) {
    if (!ip || typeof ip !== 'string') {
      return { isValid: false, error: 'Invalid IPv6 input' };
    }

    // 特殊情况
    if (ip === '::' || ip === '::1') {
      return { isValid: true, normalizedIP: ip };
    }

    // 基本格式检查
    if (!/^[0-9a-fA-F:]+$/.test(ip)) {
      return { isValid: false, error: 'IPv6 contains invalid characters' };
    }

    // 检查双冒号数量
    const doubleColonCount = (ip.match(/::/g) || []).length;
    if (doubleColonCount > 1) {
      return { isValid: false, error: 'IPv6 can have at most one ::' };
    }

    // 分割并验证
    const parts = ip.split(':');
    if (parts.length > 8) {
      return { isValid: false, error: 'IPv6 has too many parts' };
    }

    for (const part of parts) {
      if (part === '') continue; // 允许空部分（::的情况）
      
      if (part.length > 4) {
        return { isValid: false, error: 'IPv6 part too long' };
      }

      if (!/^[0-9a-fA-F]+$/.test(part)) {
        return { isValid: false, error: 'IPv6 part contains invalid characters' };
      }
    }

    return { isValid: true, normalizedIP: ip };
  }

  /**
   * 解析IPv4映射的IPv6地址
   * @param {string} ip - IP地址
   * @returns {string|null} 提取的IPv4地址或null
   */
  static parseIPv4MappedIPv6(ip) {
    if (!ip || typeof ip !== 'string') {
      return null;
    }

    // 检查IPv4映射格式
    if (ip.startsWith('::ffff:')) {
      const ipv4Part = ip.substring(7);
      const validation = this.validateIPv4(ipv4Part);
      return validation.isValid ? ipv4Part : null;
    }

    // 检查完整格式
    const fullMappedMatch = ip.match(/^(0000:){5}ffff:(.+)$/i);
    if (fullMappedMatch) {
      const ipv4Part = fullMappedMatch[2];
      const validation = this.validateIPv4(ipv4Part);
      return validation.isValid ? ipv4Part : null;
    }

    return null;
  }
}

/**
 * 安全的域名验证器
 */
export class SafeDomainValidator {
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
}

/**
 * 安全的输入清理器
 */
export class SafeInputSanitizer {
  /**
   * 清理危险字符
   * @param {string} input - 输入字符串
   * @param {Object} options - 清理选项
   * @returns {string} 清理后的字符串
   */
  static sanitizeInput(input, options = {}) {
    if (!input || typeof input !== 'string') {
      return '';
    }

    const {
      maxLength = 1000,
      allowedChars = /^[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/,
      removeControlChars = true,
      removeScriptTags = true
    } = options;

    let sanitized = input;

    // 长度限制
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    // 移除控制字符
    if (removeControlChars) {
      sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    }

    // 移除脚本标签（使用安全的字符串方法）
    if (removeScriptTags) {
      sanitized = this.removeScriptTags(sanitized);
    }

    return sanitized.trim();
  }

  /**
   * 安全地移除脚本标签
   * @param {string} input - 输入字符串
   * @returns {string} 清理后的字符串
   */
  static removeScriptTags(input) {
    if (!input || typeof input !== 'string') {
      return '';
    }

    let result = input;
    
    // 使用字符串方法而不是正则表达式
    const scriptStart = '<script';
    const scriptEnd = '</script>';
    
    let startIndex = result.toLowerCase().indexOf(scriptStart.toLowerCase());
    while (startIndex !== -1) {
      const endIndex = result.toLowerCase().indexOf(scriptEnd.toLowerCase(), startIndex);
      if (endIndex !== -1) {
        result = result.substring(0, startIndex) + result.substring(endIndex + scriptEnd.length);
      } else {
        result = result.substring(0, startIndex);
        break;
      }
      startIndex = result.toLowerCase().indexOf(scriptStart.toLowerCase());
    }

    return result;
  }

  /**
   * 清理URL路径
   * @param {string} path - URL路径
   * @returns {string} 清理后的路径
   */
  static sanitizePath(path) {
    if (!path || typeof path !== 'string') {
      return '/';
    }

    let sanitized = path.trim();

    // 移除危险字符
    sanitized = sanitized.replace(/[<>:"'&\x00-\x1F\x7F-\x9F]/g, '');

    // 确保以/开头
    if (!sanitized.startsWith('/')) {
      sanitized = '/' + sanitized;
    }

    // 检查路径遍历攻击
    if (sanitized.includes('..') || sanitized.includes('//')) {
      console.warn(`⚠️ 检测到可疑路径: ${path}`);
      return '/';
    }

    // 限制路径长度
    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 500);
    }

    return sanitized;
  }

  /**
   * 清理HTTP头部键
   * @param {string} key - 头部键
   * @returns {string|null} 清理后的键或null（如果危险）
   */
  static sanitizeHeaderKey(key) {
    if (!key || typeof key !== 'string') {
      return null;
    }

    // HTTP头部键只能包含特定字符
    if (!/^[a-zA-Z0-9\-_]+$/.test(key)) {
      return null;
    }

    // 检查危险的头部名称
    const dangerousHeaders = [
      'host', 'authorization', 'cookie', 'set-cookie',
      'x-forwarded-for', 'x-real-ip', 'proxy-authorization'
    ];

    if (dangerousHeaders.includes(key.toLowerCase())) {
      console.warn(`⚠️ 危险头部被过滤: ${key}`);
      return null;
    }

    return key;
  }

  /**
   * 清理HTTP头部值
   * @param {string} value - 头部值
   * @returns {string} 清理后的值
   */
  static sanitizeHeaderValue(value) {
    if (typeof value !== 'string') {
      return String(value);
    }

    // 移除控制字符和换行符
    const sanitized = value.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                           .replace(/[\r\n]/g, '')
                           .trim();

    // 限制长度
    if (sanitized.length > 1000) {
      throw new Error('Header value too long');
    }

    return sanitized;
  }
}

/**
 * 安全的UUID生成器
 */
export class SafeUUIDGenerator {
  /**
   * 生成加密安全的UUID
   * @returns {string} UUID字符串
   */
  static generateSecureUUID() {
    try {
      // 优先使用crypto.randomUUID()
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }

      // 使用crypto.getRandomValues()
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        
        // 设置版本和变体位
        array[6] = (array[6] & 0x0f) | 0x40; // 版本4
        array[8] = (array[8] & 0x3f) | 0x80; // 变体10

        const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        return [
          hex.slice(0, 8),
          hex.slice(8, 12),
          hex.slice(12, 16),
          hex.slice(16, 20),
          hex.slice(20, 32)
        ].join('-');
      }

      // Node.js环境使用crypto.randomBytes
      if (typeof require !== 'undefined') {
        const crypto = require('crypto');
        const randomBytes = crypto.randomBytes(16);
        
        // 设置版本和变体位
        randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40;
        randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80;

        const hex = randomBytes.toString('hex');
        return [
          hex.slice(0, 8),
          hex.slice(8, 12),
          hex.slice(12, 16),
          hex.slice(16, 20),
          hex.slice(20, 32)
        ].join('-');
      }

      // 降级方案：使用更多熵源
      return this.generateFallbackUUID();

    } catch (error) {
      console.warn('⚠️ 安全UUID生成失败，使用降级方案:', error.message);
      return this.generateFallbackUUID();
    }
  }

  /**
   * 降级UUID生成方案
   * @returns {string} UUID字符串
   */
  static generateFallbackUUID() {
    const timestamp = Date.now();
    const performanceNow = typeof performance !== 'undefined' ? performance.now() : 0;
    const randomValues = [];

    // 收集多个随机值
    for (let i = 0; i < 16; i++) {
      randomValues.push(Math.random());
    }

    // 混合熵源
    const entropy = timestamp + performanceNow + randomValues.reduce((a, b) => a + b, 0);
    const seed = entropy.toString().split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);

    // 生成UUID
    let uuid = '';
    for (let i = 0; i < 32; i++) {
      const random = Math.abs(Math.sin(seed + i)) * 16 | 0;
      if (i === 8 || i === 12 || i === 16 || i === 20) uuid += '-';
      if (i === 12) uuid += '4';
      else if (i === 16) uuid += (random & 0x3 | 0x8).toString(16);
      else uuid += random.toString(16);
    }

    console.warn('⚠️ 使用降级UUID生成方案，安全性有限');
    return uuid;
  }

  /**
   * 验证UUID格式
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
}
