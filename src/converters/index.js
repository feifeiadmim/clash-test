/**
 * 格式转换器统一入口
 */

import * as clashConverter from './clash.js';
import * as base64Converter from './base64.js';
import { generateProxyUrls, parseProxyUrls } from '../parsers/index.js';
import { OutputFormats } from '../types.js';

/**
 * 主要的格式转换类
 */
export class FormatConverter {
  /**
   * 将节点数组转换为指定格式
   * @param {Object[]} nodes - 节点数组
   * @param {string} format - 输出格式
   * @param {Object} options - 转换选项
   * @returns {string|Object} 转换后的内容
   */
  static convert(nodes, format, options = {}) {
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return format === OutputFormats.JSON ? [] : '';
    }

    switch (format) {
      case OutputFormats.CLASH:
        return clashConverter.toClashConfig(nodes, options);

      case OutputFormats.BASE64:
        return base64Converter.toBase64Subscription(nodes, options);

      case OutputFormats.URL:
        return generateProxyUrls(nodes).join('\n');

      case OutputFormats.JSON:
        return nodes;

      default:
        throw new Error(`不支持的输出格式: ${format}`);
    }
  }

  /**
   * 从指定格式解析节点
   * @param {string|Object} content - 输入内容
   * @param {string} format - 输入格式
   * @returns {Object[]} 节点数组
   */
  static parse(content, format) {
    if (!content) {
      return [];
    }

    switch (format) {
      case OutputFormats.CLASH:
        return clashConverter.fromClashConfig(content);

      case OutputFormats.BASE64:
        return base64Converter.fromBase64Subscription(content);

      case OutputFormats.URL:
        return this.parseUrls(content);

      case OutputFormats.JSON:
        return Array.isArray(content) ? content : [];

      default:
        throw new Error(`不支持的输入格式: ${format}`);
    }
  }

  /**
   * 解析 URL 列表
   * @param {string} content - URL 内容
   * @returns {Object[]} 节点数组
   */
  static parseUrls(content) {
    // 动态导入在这里不合适，直接使用已导入的函数
    return parseProxyUrls(content);
  }

  /**
   * 自动检测输入格式（性能优化版本）
   * 使用快速预检查避免昂贵的解析操作
   * @param {string|Object} content - 输入内容
   * @returns {string} 检测到的格式
   */
  static detectFormat(content) {
    if (!content) {
      return null;
    }

    // 如果是对象，使用快速属性检查
    if (typeof content === 'object') {
      return this._detectObjectFormat(content);
    }

    // 如果是字符串，使用分层快速检查
    if (typeof content === 'string') {
      return this._detectStringFormat(content);
    }

    return null;
  }

  /**
   * 检测对象格式（内部方法）
   * @param {Object} content - 对象内容
   * @returns {string|null} 检测到的格式
   */
  static _detectObjectFormat(content) {
    // 快速Clash配置检查
    if (content.proxies || content['proxy-groups']) {
      return OutputFormats.CLASH;
    }

    if (Array.isArray(content)) {
      if (content.length === 0) {
        return OutputFormats.JSON;
      }

      // 只检查前几个元素，避免遍历大数组
      const sampleSize = Math.min(content.length, 3);
      const proxyPrefixRegex = /^(ss|ssr|vmess|vless|trojan|hysteria2?|hy2|tuic|snell):\/\//i;

      for (let i = 0; i < sampleSize; i++) {
        if (typeof content[i] === 'string' && proxyPrefixRegex.test(content[i])) {
          return OutputFormats.URL;
        }
      }
      return OutputFormats.JSON;
    }

    return null;
  }

  /**
   * 检测字符串格式（内部方法）
   * @param {string} content - 字符串内容
   * @returns {string|null} 检测到的格式
   */
  static _detectStringFormat(content) {
    const trimmed = content.trim();

    // 快速长度检查
    if (trimmed.length === 0) {
      return null;
    }

    // 1. 快速协议前缀检查（最常见的情况）
    const protocolMatch = trimmed.match(/^(ss|ssr|vmess|vless|trojan|hysteria2?|hy2|tuic|snell):\/\//i);
    if (protocolMatch) {
      return OutputFormats.URL;
    }

    // 2. 快速Base64检查（避免完整验证）
    if (this._isLikelyBase64(trimmed)) {
      // 只有在看起来像Base64时才进行完整验证
      if (base64Converter.isValidBase64(trimmed)) {
        return OutputFormats.BASE64;
      }
    }

    // 3. 快速YAML检查（使用正则而非字符串搜索）
    if (this._isLikelyYaml(trimmed)) {
      return OutputFormats.CLASH;
    }

    // 4. 快速JSON检查（只检查开头字符）
    const firstChar = trimmed[0];
    if (firstChar === '{' || firstChar === '[') {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          if (parsed.proxies || parsed['proxy-groups']) {
            return OutputFormats.CLASH;
          }
          if (Array.isArray(parsed)) {
            return OutputFormats.JSON;
          }
        }
      } catch (e) {
        // 不是有效JSON，继续其他检查
      }
    }

    // 5. 多行URL检查（最后检查，因为需要分割字符串）
    if (this._isLikelyUrlList(trimmed)) {
      return OutputFormats.URL;
    }

    return null;
  }

  /**
   * 快速Base64格式检查
   * @param {string} content - 内容
   * @returns {boolean} 是否可能是Base64
   */
  static _isLikelyBase64(content) {
    // 快速检查：最小长度要求
    if (content.length < 16) {
      return false;
    }

    // 检查是否只包含Base64字符（允许不完整的padding）
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content)) {
      return false;
    }

    // 长度检查：应该是4的倍数或接近4的倍数
    const remainder = content.length % 4;
    if (remainder !== 0 && remainder !== 2 && remainder !== 3) {
      return false;
    }

    // 内容长度检查：应该足够长以排除短字符串
    return content.length > 50;
  }

  /**
   * 快速YAML格式检查
   * @param {string} content - 内容
   * @returns {boolean} 是否可能是YAML
   */
  static _isLikelyYaml(content) {
    // 使用正则快速检查YAML关键字
    return /^[a-zA-Z-]+:\s/m.test(content) &&
           /\b(proxies|proxy-groups|rules|port|socks-port):/i.test(content);
  }

  /**
   * 快速URL列表检查
   * @param {string} content - 内容
   * @returns {boolean} 是否可能是URL列表
   */
  static _isLikelyUrlList(content) {
    // 如果包含换行符，可能是URL列表
    if (!content.includes('\n')) {
      return false;
    }

    // 快速检查：是否包含协议前缀
    return /(ss|ssr|vmess|vless|trojan|hysteria|tuic|snell):\/\//i.test(content);
  }

  /**
   * 检查是否为 YAML 格式（向后兼容方法）
   * @param {string} content - 内容
   * @returns {boolean} 是否为 YAML
   */
  static isYamlFormat(content) {
    return this._isLikelyYaml(content);
  }

  /**
   * 检查是否为 URL 格式（向后兼容方法）
   * @param {string} content - 内容
   * @returns {boolean} 是否为 URL 列表
   */
  static isUrlFormat(content) {
    // 保留原有的精确检查逻辑用于向后兼容
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return false;

    const proxyPrefixes = ['ss://', 'ssr://', 'vmess://', 'vless://', 'trojan://', 'hysteria://', 'hysteria2://', 'hy2://', 'tuic://', 'snell://'];

    // 至少 50% 的行是代理 URL
    const proxyLines = lines.filter(line =>
      proxyPrefixes.some(prefix => line.trim().startsWith(prefix))
    );

    return proxyLines.length / lines.length >= 0.5;
  }

  /**
   * 转换格式（自动检测输入格式）
   * @param {string|Object} input - 输入内容
   * @param {string} outputFormat - 输出格式
   * @param {Object} options - 转换选项
   * @returns {string|Object} 转换后的内容
   */
  static transform(input, outputFormat, options = {}) {
    // 自动检测输入格式
    const inputFormat = this.detectFormat(input);
    if (!inputFormat) {
      throw new Error('无法检测输入格式');
    }

    // 解析输入内容
    const nodes = this.parse(input, inputFormat);

    // 转换为目标格式
    return this.convert(nodes, outputFormat, options);
  }

  /**
   * 批量转换
   * @param {Array} inputs - 输入数组，每个元素包含 {content, format}
   * @param {string} outputFormat - 输出格式
   * @param {Object} options - 转换选项
   * @returns {string|Object} 合并转换后的内容
   */
  static batchTransform(inputs, outputFormat, options = {}) {
    const allNodes = [];

    for (const input of inputs) {
      const format = input.format || this.detectFormat(input.content);
      if (format) {
        const nodes = this.parse(input.content, format);
        allNodes.push(...nodes);
      }
    }

    return this.convert(allNodes, outputFormat, options);
  }

  /**
   * 获取支持的格式列表
   * @returns {string[]} 支持的格式数组
   */
  static getSupportedFormats() {
    return Object.values(OutputFormats);
  }

  /**
   * 验证格式是否支持
   * @param {string} format - 格式名称
   * @returns {boolean} 是否支持
   */
  static isFormatSupported(format) {
    return Object.values(OutputFormats).includes(format);
  }
}

// 导出便捷函数
export const {
  convert,
  parse,
  detectFormat,
  transform,
  batchTransform,
  getSupportedFormats,
  isFormatSupported
} = FormatConverter;

// 导出子模块
export { clashConverter, base64Converter };
