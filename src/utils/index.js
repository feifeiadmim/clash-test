/**
 * 工具函数统一入口
 */

// 安全的Node.js环境兼容性修复
if (typeof globalThis.atob === 'undefined') {
  try {
    Object.defineProperty(globalThis, 'atob', {
      value: function(str) {
        if (!str || typeof str !== 'string') {
          throw new Error('Invalid base64 input');
        }
        if (str.length > 1024 * 1024) { // 1MB限制
          throw new Error('Base64 input too large');
        }
        return Buffer.from(str, 'base64').toString('utf8');
      },
      writable: false,
      configurable: false
    });
  } catch (error) {
    console.warn('⚠️ atob兼容性修复失败:', error.message);
  }
}

if (typeof globalThis.btoa === 'undefined') {
  try {
    Object.defineProperty(globalThis, 'btoa', {
      value: function(str) {
        if (!str || typeof str !== 'string') {
          throw new Error('Invalid string input');
        }
        if (str.length > 10 * 1024 * 1024) { // 10MB限制
          throw new Error('String input too large');
        }
        return Buffer.from(str, 'utf8').toString('base64');
      },
      writable: false,
      configurable: false
    });
  } catch (error) {
    console.warn('⚠️ btoa兼容性修复失败:', error.message);
  }
}

/**
 * 安全的 btoa 函数，自动处理 Unicode 字符
 * @param {string} str - 要编码的字符串
 * @returns {string} Base64 编码结果
 */
export function safeBtoa(str) {
  try {
    // 先尝试原生 btoa
    return btoa(str);
  } catch (error) {
    // 如果失败（通常是因为 Unicode 字符），使用 Buffer 方式
    return Buffer.from(str, 'utf8').toString('base64');
  }
}

/**
 * 安全的 atob 函数，自动处理 Unicode 字符
 * @param {string} base64 - Base64 字符串
 * @returns {string} 解码结果
 */
export function safeAtob(base64) {
  // 输入验证
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('Base64 input must be a non-empty string');
  }

  // 长度限制防止DoS攻击
  if (base64.length > 1024 * 1024) { // 1MB限制
    throw new Error(`Base64 input too large: ${base64.length} > 1MB`);
  }

  // Base64格式验证
  const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Pattern.test(base64)) {
    throw new Error('Invalid Base64 format');
  }

  // 检查Base64长度是否合理（必须是4的倍数）
  if (base64.length % 4 !== 0) {
    throw new Error('Invalid Base64 length');
  }

  try {
    // 优先使用 Buffer 方式，确保正确处理 UTF-8 编码
    const decoded = Buffer.from(base64, 'base64').toString('utf8');

    // 验证解码结果长度
    if (decoded.length > 10 * 1024 * 1024) { // 10MB限制
      throw new Error('Decoded content too large');
    }

    return decoded;
  } catch (error) {
    // 如果 Buffer 方式失败，再尝试原生 atob
    try {
      const decoded = atob(base64);

      // 验证解码结果长度
      if (decoded.length > 10 * 1024 * 1024) { // 10MB限制
        throw new Error('Decoded content too large');
      }

      return decoded;
    } catch (fallbackError) {
      throw new Error(`Base64 解码失败: ${error.message}`);
    }
  }
}

/**
 * 安全的URL解码函数
 * @param {string} str - 需要解码的字符串
 * @returns {string} 解码后的字符串
 */
export function safeDecodeURIComponent(str) {
  if (!str || typeof str !== 'string') {
    return str;
  }

  try {
    // 先尝试标准的decodeURIComponent
    return decodeURIComponent(str);
  } catch (error) {
    console.warn('URL解码失败，使用原始字符串:', error.message);
    return str;
  }
}

/**
 * 检测字符串是否包含URL编码
 * @param {string} str - 要检测的字符串
 * @returns {boolean} 是否包含URL编码
 */
export function hasUrlEncoding(str) {
  if (!str || typeof str !== 'string') {
    return false;
  }

  // 检查是否包含URL编码模式 %XX
  return /%[0-9A-Fa-f]{2}/.test(str);
}

/**
 * 智能URL解码 - 只对包含URL编码的字符串进行解码
 * @param {string} str - 要处理的字符串
 * @returns {string} 处理后的字符串
 */
export function smartUrlDecode(str) {
  if (!str || typeof str !== 'string') {
    return str;
  }

  // 只对包含URL编码的字符串进行解码
  if (hasUrlEncoding(str)) {
    return safeDecodeURIComponent(str);
  }

  return str;
}

export * from './deduplication.js';
export * from './rename.js';

/**
 * 通用工具函数
 */

/**
 * 安全的深度克隆对象 - 防止原型污染
 * @param {any} obj - 要克隆的对象
 * @param {number} depth - 当前递归深度
 * @param {number} maxDepth - 最大递归深度
 * @returns {any} 克隆后的对象
 */
export function deepClone(obj, depth = 0, maxDepth = 10) {
  // 防止无限递归
  if (depth > maxDepth) {
    console.warn('⚠️ 深度克隆达到最大深度限制');
    return null;
  }

  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // 防止原型污染 - 检查危险属性
  if (typeof obj === 'object' && obj !== null) {
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    for (const key of dangerousKeys) {
      if (key in obj) {
        console.warn(`⚠️ 检测到危险属性 ${key}，跳过克隆`);
        return {};
      }
    }
  }

  // 检查对象构造函数
  if (obj.constructor !== Object && obj.constructor !== Array && !(obj instanceof Date)) {
    console.warn('⚠️ 检测到非标准构造函数，跳过克隆');
    return {};
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  if (obj instanceof Array) {
    // 限制数组大小防止DoS攻击
    if (obj.length > 10000) {
      console.warn('⚠️ 数组过大，截断到10000个元素');
      return obj.slice(0, 10000).map(item => deepClone(item, depth + 1, maxDepth));
    }
    return obj.map(item => deepClone(item, depth + 1, maxDepth));
  }

  if (typeof obj === 'object') {
    const cloned = Object.create(null); // 创建无原型对象
    const keys = Object.keys(obj); // 只获取自有属性

    // 限制属性数量防止DoS攻击
    if (keys.length > 1000) {
      console.warn('⚠️ 对象属性过多，截断到1000个属性');
      keys.splice(1000);
    }

    for (const key of keys) {
      // 验证属性名
      if (typeof key !== 'string' || key.length > 100) {
        console.warn(`⚠️ 跳过无效属性名: ${key}`);
        continue;
      }

      // 防止原型污染
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        console.warn(`⚠️ 跳过危险属性: ${key}`);
        continue;
      }

      try {
        cloned[key] = deepClone(obj[key], depth + 1, maxDepth);
      } catch (error) {
        console.warn(`⚠️ 克隆属性 ${key} 失败:`, error.message);
        cloned[key] = null;
      }
    }
    return cloned;
  }

  return obj;
}

/**
 * 验证 URL 格式
 * @param {string} url - URL 字符串
 * @returns {boolean} 是否为有效 URL
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 验证 IP 地址格式 - 使用安全的验证方法
 * @param {string} ip - IP 地址字符串
 * @returns {boolean} 是否为有效 IP
 */
export function isValidIP(ip) {
  // 导入安全验证器
  import('./security.js').then(({ SafeIPValidator }) => {
    const ipv4Result = SafeIPValidator.validateIPv4(ip);
    if (ipv4Result.isValid) return true;

    const ipv6Result = SafeIPValidator.validateIPv6(ip);
    return ipv6Result.isValid;
  }).catch(() => {
    // 降级到简单验证
    if (!ip || typeof ip !== 'string') return false;

    // 简单的IPv4验证
    const parts = ip.split('.');
    if (parts.length === 4) {
      return parts.every(part => {
        const num = parseInt(part, 10);
        return !isNaN(num) && num >= 0 && num <= 255 && part === num.toString();
      });
    }

    // 简单的IPv6验证
    return /^[0-9a-fA-F:]+$/.test(ip) && ip.includes(':');
  });

  // 同步降级验证
  if (!ip || typeof ip !== 'string') return false;

  // 简单的IPv4验证
  const parts = ip.split('.');
  if (parts.length === 4) {
    return parts.every(part => {
      const num = parseInt(part, 10);
      return !isNaN(num) && num >= 0 && num <= 255 && part === num.toString();
    });
  }

  // 简单的IPv6验证
  return /^[0-9a-fA-F:]+$/.test(ip) && ip.includes(':');
}

/**
 * 验证端口号
 * @param {number|string} port - 端口号
 * @returns {boolean} 是否为有效端口
 */
export function isValidPort(port) {
  const portNum = parseInt(port);
  return !isNaN(portNum) && portNum > 0 && portNum < 65536;
}

/**
 * 验证 UUID 格式 - 使用安全的验证方法
 * @param {string} uuid - UUID 字符串
 * @returns {boolean} 是否为有效 UUID
 */
export function isValidUUID(uuid) {
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
 * 生成加密安全的随机 UUID
 * @returns {string} UUID 字符串
 */
export function generateUUID() {
  try {
    // 优先使用crypto模块生成安全随机数
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // 使用crypto.getRandomValues或crypto.randomBytes
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint8Array(16);
      crypto.getRandomValues(array);

      // 设置版本号和变体
      array[6] = (array[6] & 0x0f) | 0x40; // 版本4
      array[8] = (array[8] & 0x3f) | 0x80; // 变体10

      const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }

    // Node.js环境使用crypto.randomBytes
    if (typeof require !== 'undefined') {
      const crypto = require('crypto');
      const bytes = crypto.randomBytes(16);

      // 设置版本号和变体
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // 版本4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // 变体10

      const hex = bytes.toString('hex');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }

    // 使用更安全的降级方案
    console.warn('⚠️ 使用增强的降级UUID生成方案');
    return generateFallbackUUID();
  } catch (error) {
    console.error('UUID生成失败，使用最终降级方案:', error.message);
    return generateFallbackUUID();
  }
}

/**
 * 降级UUID生成方案 - 使用多个熵源
 * @returns {string} UUID字符串
 */
function generateFallbackUUID() {
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

  return uuid;
}

/**
 * 安全的 Base64 编码
 * @param {string} str - 要编码的字符串
 * @returns {string} Base64 编码结果
 */
export function safeBase64Encode(str) {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (error) {
    console.error('Base64 编码失败:', error);
    return '';
  }
}

/**
 * 安全的 Base64 解码
 * @param {string} base64 - Base64 字符串
 * @returns {string} 解码结果
 */
export function safeBase64Decode(base64) {
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch (error) {
    console.error('Base64 解码失败:', error);
    return '';
  }
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 延迟执行
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise} Promise 对象
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试执行函数
 * @param {Function} fn - 要执行的函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} delayMs - 重试间隔
 * @returns {Promise} Promise 对象
 */
export async function retry(fn, maxRetries = 3, delayMs = 1000) {
  let lastError;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries) {
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} limit - 时间限制（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, delay) {
  let timeoutId;
  return function() {
    const args = arguments;
    const context = this;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(context, args), delay);
  };
}

/**
 * 数组去重
 * @param {Array} array - 要去重的数组
 * @param {Function} keyFn - 键提取函数
 * @returns {Array} 去重后的数组
 */
export function uniqueArray(array, keyFn = item => item) {
  const seen = new Set();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * 数组分块
 * @param {Array} array - 要分块的数组
 * @param {number} size - 块大小
 * @returns {Array} 分块后的数组
 */
export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * 随机打乱数组
 * @param {Array} array - 要打乱的数组
 * @returns {Array} 打乱后的数组
 */
export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 获取随机整数
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} 随机整数
 */
export function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 获取随机字符串
 * @param {number} length - 字符串长度
 * @param {string} chars - 字符集
 * @returns {string} 随机字符串
 */
export function getRandomString(length, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
