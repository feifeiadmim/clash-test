/**
 * 解析器注册管理系统
 * 借鉴Sub-Store的ParserRegistry设计，支持插件化解析器管理
 */

/**
 * 解析器基类
 */
export class BaseParser {
  constructor(name, type) {
    this.name = name;
    this.type = type;
  }

  /**
   * 测试是否能解析该内容
   * @param {string} content - 要测试的内容
   * @returns {boolean} 是否能解析
   */
  test(content) {
    throw new Error('Parser test method must be implemented');
  }

  /**
   * 解析内容
   * @param {string} content - 要解析的内容
   * @returns {Object[]} 解析后的节点数组
   */
  parse(content) {
    throw new Error('Parser parse method must be implemented');
  }
}

/**
 * 解析器注册管理器（性能优化版本）
 */
export class ParserRegistry {
  constructor() {
    this.parsers = []; // 保留原始数组用于顺序执行场景
    this.parserMap = new Map(); // 基于协议类型的O(1)查找
    this.testCache = new Map(); // 缓存测试结果，避免重复测试
    this.lastParser = null; // 缓存上次成功的解析器
    this.parsing = new Map(); // 防止并发解析同一内容
    this.stats = {
      totalAttempts: 0,
      successfulParses: 0,
      cacheHits: 0,
      concurrentRequests: 0,
      mapLookups: 0, // 新增：Map查找次数
      arrayLookups: 0 // 新增：数组查找次数
    };
  }

  /**
   * 注册解析器（优化版本）
   * @param {BaseParser} parser - 解析器实例
   * @param {boolean} silent - 是否静默注册（不输出日志）
   */
  register(parser, silent = false) {
    if (!(parser instanceof BaseParser)) {
      throw new Error('Parser must extend BaseParser');
    }

    this.parsers.push(parser);

    // 同时注册到Map中，支持按协议类型快速查找
    if (parser.type) {
      if (!this.parserMap.has(parser.type)) {
        this.parserMap.set(parser.type, []);
      }
      this.parserMap.get(parser.type).push(parser);
    }

    if (!silent) {
      console.log(`📝 注册解析器: ${parser.name} (${parser.type})`);
    }
  }

  /**
   * 尝试解析内容（并发安全版本）
   * @param {string} content - 要解析的内容
   * @returns {Promise<Object[]>} 解析后的节点数组
   */
  async parse(content) {
    this.stats.totalAttempts++;

    if (!content || typeof content !== 'string') {
      throw new Error('Invalid content for parsing');
    }

    // 生成内容哈希作为并发控制键
    const contentHash = this.generateContentHash(content);

    // 检查是否正在解析相同内容
    if (this.parsing.has(contentHash)) {
      this.stats.concurrentRequests++;
      console.log('🔄 检测到并发解析请求，等待现有解析完成...');
      return await this.parsing.get(contentHash);
    }

    // 创建解析Promise
    const parsePromise = this.performParse(content);
    this.parsing.set(contentHash, parsePromise);

    try {
      const result = await parsePromise;
      return result;
    } finally {
      // 清理并发控制
      this.parsing.delete(contentHash);
    }
  }

  /**
   * 执行实际解析（性能优化版本）
   * @param {string} content - 要解析的内容
   * @returns {Promise<Object[]>} 解析后的节点数组
   */
  async performParse(content) {
    // 优先使用上次成功的解析器（性能优化）
    if (this.lastParser && this.tryParseWithCache(this.lastParser, content)) {
      this.stats.cacheHits++;
      this.stats.successfulParses++;
      return this.lastParser.parse(content);
    }

    // 尝试智能协议检测和快速查找
    const detectedType = this.detectProtocolType(content);
    if (detectedType && this.parserMap.has(detectedType)) {
      this.stats.mapLookups++;
      const typeParsers = this.parserMap.get(detectedType);

      for (const parser of typeParsers) {
        if (parser === this.lastParser) continue; // 跳过已尝试的

        if (this.tryParseWithCache(parser, content)) {
          this.lastParser = parser;
          this.stats.successfulParses++;
          return parser.parse(content);
        }
      }
    }

    // 回退到遍历所有解析器
    this.stats.arrayLookups++;
    for (const parser of this.parsers) {
      if (parser === this.lastParser) continue; // 跳过已尝试的

      if (this.tryParseWithCache(parser, content)) {
        this.lastParser = parser;
        this.stats.successfulParses++;
        return parser.parse(content);
      }
    }

    throw new Error(`No suitable parser found for content type`);
  }

  /**
   * 生成内容哈希
   * @param {string} content - 内容
   * @returns {string} 哈希值
   */
  generateContentHash(content) {
    // 简单哈希算法，用于并发控制
    let hash = 0;
    for (let i = 0; i < Math.min(content.length, 1000); i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(36);
  }

  /**
   * 智能协议类型检测
   * @param {string} content - 内容
   * @returns {string|null} 检测到的协议类型
   */
  detectProtocolType(content) {
    // 快速协议前缀检测
    const protocolPatterns = {
      'vmess': /vmess:\/\//i,
      'vless': /vless:\/\//i,
      'trojan': /trojan:\/\//i,
      'ss': /ss:\/\//i,
      'ssr': /ssr:\/\//i,
      'hysteria': /hysteria:\/\//i,
      'hysteria2': /hysteria2:\/\/|hy2:\/\//i,
      'tuic': /tuic:\/\//i,
      'snell': /snell:\/\//i,
      'base64': /^[A-Za-z0-9+/]+=*$/
    };

    for (const [type, pattern] of Object.entries(protocolPatterns)) {
      if (pattern.test(content)) {
        return type;
      }
    }

    return null;
  }

  /**
   * 带缓存的解析器测试
   * @param {BaseParser} parser - 解析器
   * @param {string} content - 内容
   * @returns {boolean} 是否能解析
   */
  tryParseWithCache(parser, content) {
    // 生成缓存键
    const cacheKey = `${parser.name}:${this.generateContentHash(content)}`;

    // 检查缓存
    if (this.testCache.has(cacheKey)) {
      return this.testCache.get(cacheKey);
    }

    // 执行测试
    try {
      const result = parser.test(content);

      // 缓存结果（限制缓存大小）
      if (this.testCache.size > 1000) {
        const firstKey = this.testCache.keys().next().value;
        this.testCache.delete(firstKey);
      }
      this.testCache.set(cacheKey, result);

      return result;
    } catch (error) {
      console.warn(`⚠️ 解析器 ${parser.name} 测试失败:`, error.message);
      this.testCache.set(cacheKey, false);
      return false;
    }
  }

  /**
   * 尝试使用解析器解析（保留向后兼容）
   * @param {BaseParser} parser - 解析器
   * @param {string} content - 内容
   * @returns {boolean} 是否能解析
   */
  tryParse(parser, content) {
    return this.tryParseWithCache(parser, content);
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalAttempts > 0 ?
        (this.stats.successfulParses / this.stats.totalAttempts * 100).toFixed(2) + '%' : '0%',
      cacheHitRate: this.stats.totalAttempts > 0 ?
        (this.stats.cacheHits / this.stats.totalAttempts * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalAttempts: 0,
      successfulParses: 0,
      cacheHits: 0
    };
  }

  /**
   * 获取所有注册的解析器
   * @returns {BaseParser[]} 解析器数组
   */
  getRegisteredParsers() {
    return [...this.parsers];
  }

  /**
   * 按类型获取解析器
   * @param {string} type - 解析器类型
   * @returns {BaseParser[]} 指定类型的解析器数组
   */
  getParsersByType(type) {
    return this.parsers.filter(parser => parser.type === type);
  }

  /**
   * 清空所有解析器
   */
  clear() {
    this.parsers = [];
    this.lastParser = null;
    this.resetStats();
  }
}

/**
 * VMess解析器
 */
export class VMessParser extends BaseParser {
  constructor() {
    super('VMess Parser', 'vmess');
  }

  test(content) {
    return content.includes('vmess://') ||
           (content.includes('"v"') && content.includes('"ps"'));
  }

  parse(content) {
    const nodes = [];

    // 处理vmess://链接
    const vmessLinks = content.match(/vmess:\/\/[A-Za-z0-9+/=]+/g) || [];
    for (const link of vmessLinks) {
      try {
        const decoded = JSON.parse(atob(link.replace('vmess://', '')));
        nodes.push({
          name: decoded.ps || 'VMess节点',
          server: decoded.add,
          port: parseInt(decoded.port),
          type: 'vmess',
          uuid: decoded.id,
          alterId: parseInt(decoded.aid) || 0,
          cipher: decoded.scy || 'auto',
          network: decoded.net || 'tcp',
          tls: decoded.tls === 'tls' ? { enabled: true } : { enabled: false }
        });
      } catch (error) {
        console.warn('⚠️ VMess解析失败:', error.message);
      }
    }

    return nodes;
  }
}

/**
 * Trojan解析器
 */
export class TrojanParser extends BaseParser {
  constructor() {
    super('Trojan Parser', 'trojan');
  }

  test(content) {
    return content.includes('trojan://');
  }

  parse(content) {
    const nodes = [];
    const trojanLinks = content.match(/trojan:\/\/[^\s\n]+/g) || [];

    for (const link of trojanLinks) {
      try {
        const url = new URL(link);
        nodes.push({
          name: decodeURIComponent(url.hash.slice(1)) || 'Trojan节点',
          server: url.hostname,
          port: parseInt(url.port) || 443,
          type: 'trojan',
          password: url.username,
          sni: url.searchParams.get('sni') || url.hostname
        });
      } catch (error) {
        console.warn('⚠️ Trojan解析失败:', error.message);
      }
    }

    return nodes;
  }
}

/**
 * Shadowsocks解析器
 */
export class ShadowsocksParser extends BaseParser {
  constructor() {
    super('Shadowsocks Parser', 'ss');
  }

  test(content) {
    return content.includes('ss://');
  }

  parse(content) {
    const nodes = [];
    const ssLinks = content.match(/ss:\/\/[^\s\n]+/g) || [];

    for (const link of ssLinks) {
      try {
        const url = new URL(link);
        const auth = atob(url.username);
        const [method, password] = auth.split(':');

        nodes.push({
          name: decodeURIComponent(url.hash.slice(1)) || 'SS节点',
          server: url.hostname,
          port: parseInt(url.port),
          type: 'ss',
          method: method,
          password: password
        });
      } catch (error) {
        console.warn('⚠️ SS解析失败:', error.message);
      }
    }

    return nodes;
  }
}

/**
 * Base64订阅解析器
 */
export class Base64Parser extends BaseParser {
  constructor() {
    super('Base64 Parser', 'base64');
    this.subParsers = [
      new VMessParser(),
      new TrojanParser(),
      new ShadowsocksParser()
    ];
  }

  test(content) {
    // 检查是否为Base64编码
    try {
      const decoded = atob(content.trim());
      return decoded.includes('://') || decoded.includes('"v"');
    } catch {
      return false;
    }
  }

  parse(content) {
    try {
      const decoded = atob(content.trim());
      const lines = decoded.split('\n').filter(line => line.trim());

      const allNodes = [];
      for (const line of lines) {
        for (const parser of this.subParsers) {
          if (parser.test(line)) {
            const nodes = parser.parse(line);
            allNodes.push(...nodes);
            break;
          }
        }
      }

      return allNodes;
    } catch (error) {
      throw new Error(`Base64解析失败: ${error.message}`);
    }
  }
}

// 导入所有协议解析器
import { parseVLESSUrl } from '../parsers/vless.js';
import { parseHysteria2Url } from '../parsers/hysteria2.js';
import { parseHysteriaUrl } from '../parsers/hysteria.js';
import { parseTuicUrl } from '../parsers/tuic.js';
import { parseSnellUrl } from '../parsers/snell.js';
import { parseShadowsocksRUrl } from '../parsers/shadowsocksr.js';
import { wireGuardParsers } from '../parsers/wireguard.js';
import { parseAnyTLSUrl } from '../parsers/anytls.js';
import { directParsers } from '../parsers/direct.js';
import { httpSocksParsers } from '../parsers/http-socks.js';
import { sshParsers } from '../parsers/ssh.js';

/**
 * 协议解析器适配器类
 * 将现有的解析器函数适配到BaseParser接口
 */
class ProtocolParserAdapter extends BaseParser {
  constructor(name, type, parseFunction, testFunction) {
    super(name, type);
    this.parseFunction = parseFunction;
    this.testFunction = testFunction;
  }

  test(content) {
    if (this.testFunction) {
      return this.testFunction(content);
    }
    // 默认测试逻辑：检查协议前缀
    const protocolPrefix = `${this.type}://`;
    return content.includes(protocolPrefix);
  }

  parse(content) {
    try {
      // 提取该协议的URL
      const protocolPrefix = `${this.type}://`;
      const urls = content.match(new RegExp(`${this.type}://[^\\s\\n]+`, 'g')) || [];

      const nodes = [];
      for (const url of urls) {
        try {
          const node = this.parseFunction(url);
          if (node) {
            nodes.push(node);
          }
        } catch (error) {
          console.warn(`⚠️ ${this.name} 解析失败:`, error.message);
        }
      }

      return nodes;
    } catch (error) {
      console.error(`❌ ${this.name} 解析器错误:`, error.message);
      return [];
    }
  }
}

// 创建全局解析器注册表
export const globalParserRegistry = new ParserRegistry();

// 注册所有协议解析器
globalParserRegistry.register(new VMessParser());
globalParserRegistry.register(new TrojanParser());
globalParserRegistry.register(new ShadowsocksParser());

// 注册VLESS解析器
globalParserRegistry.register(new ProtocolParserAdapter(
  'VLESS Parser',
  'vless',
  parseVLESSUrl,
  (content) => content.includes('vless://')
));

// 注册Hysteria2解析器
globalParserRegistry.register(new ProtocolParserAdapter(
  'Hysteria2 Parser',
  'hysteria2',
  parseHysteria2Url,
  (content) => content.includes('hysteria2://') || content.includes('hy2://')
));

// 注册Hysteria解析器
globalParserRegistry.register(new ProtocolParserAdapter(
  'Hysteria Parser',
  'hysteria',
  parseHysteriaUrl,
  (content) => content.includes('hysteria://') || content.includes('hy://')
));

// 注册TUIC解析器
globalParserRegistry.register(new ProtocolParserAdapter(
  'TUIC Parser',
  'tuic',
  parseTuicUrl,
  (content) => content.includes('tuic://')
));

// 注册Snell解析器
globalParserRegistry.register(new ProtocolParserAdapter(
  'Snell Parser',
  'snell',
  parseSnellUrl,
  (content) => content.includes('snell://')
));

// 注册SSR解析器
globalParserRegistry.register(new ProtocolParserAdapter(
  'ShadowsocksR Parser',
  'ssr',
  parseShadowsocksRUrl,
  (content) => content.includes('ssr://')
));

// 注册AnyTLS解析器
globalParserRegistry.register(new ProtocolParserAdapter(
  'AnyTLS Parser',
  'anytls',
  parseAnyTLSUrl,
  (content) => content.includes('anytls://')
));

// 注册Direct解析器
if (directParsers && directParsers.length > 0) {
  for (const parser of directParsers) {
    globalParserRegistry.register(new ProtocolParserAdapter(
      `Direct ${parser.name}`,
      'direct',
      (content) => {
        const lines = content.split('\n');
        const results = [];
        for (const line of lines) {
          if (parser.test(line)) {
            results.push(parser.parse(line));
          }
        }
        return results.length === 1 ? results[0] : results;
      },
      parser.test
    ));
  }
}

// 注册HTTP/SOCKS解析器
if (httpSocksParsers && httpSocksParsers.length > 0) {
  for (const parser of httpSocksParsers) {
    globalParserRegistry.register(new ProtocolParserAdapter(
      `HTTP/SOCKS ${parser.name}`,
      parser.name.toLowerCase().includes('http') ? 'http' : 'socks5',
      (content) => {
        const lines = content.split('\n');
        const results = [];
        for (const line of lines) {
          if (parser.test(line)) {
            results.push(parser.parse(line));
          }
        }
        return results.length === 1 ? results[0] : results;
      },
      parser.test
    ));
  }
}

// 注册SSH解析器
if (sshParsers && sshParsers.length > 0) {
  for (const parser of sshParsers) {
    globalParserRegistry.register(new ProtocolParserAdapter(
      `SSH ${parser.name}`,
      'ssh',
      (content) => {
        if (parser.name.includes('Config')) {
          // OpenSSH配置解析器返回数组
          return parser.parse(content);
        } else {
          // URI解析器处理单行
          const lines = content.split('\n');
          const results = [];
          for (const line of lines) {
            if (parser.test(line)) {
              results.push(parser.parse(line));
            }
          }
          return results.length === 1 ? results[0] : results;
        }
      },
      parser.test
    ));
  }
}

// 注册Wireguard解析器
if (wireGuardParsers && wireGuardParsers.length > 0) {
  for (const parser of wireGuardParsers) {
    globalParserRegistry.register(new ProtocolParserAdapter(
      `Wireguard ${parser.name} Parser`,
      'wireguard',
      parser.parse,
      parser.test
    ));
  }
}

// Base64解析器将在需要时手动注册，避免重复注册



// 全局状态管理
let standardizedOutputEnabled = false;
let base64ParserRegistered = false;

/**
 * 确保Base64解析器已注册
 */
export function ensureBase64Parser() {
  if (!base64ParserRegistered) {
    globalParserRegistry.register(new Base64Parser());
    base64ParserRegistered = true;
  }
}

/**
 * 启用标准化输出结构
 * 将所有注册的解析器包装为标准化输出
 */
export async function enableStandardizedOutput() {
  // 防止重复启用
  if (standardizedOutputEnabled) {
    console.log('⚠️ 标准化输出已启用，跳过重复操作');
    return;
  }

  console.log('🔄 启用标准化输出结构...');

  try {
    // 动态导入包装器函数
    const { wrapParsers } = await import('./parser-wrapper.js');

    // 获取当前所有解析器
    const currentParsers = globalParserRegistry.getRegisteredParsers();

    // 包装所有解析器
    const wrappedParsers = wrapParsers(currentParsers, {
      enableStandardization: true,
      enableValidation: true,
      enablePerformanceTracking: true,
      preserveOriginalFields: false // 不保留原始字段以节省内存
    });

    // 清空注册表
    globalParserRegistry.clear();

    // 重新注册包装后的解析器（静默注册，避免重复日志）
    for (const wrappedParser of wrappedParsers) {
      globalParserRegistry.register(wrappedParser, true);
    }

    // 标记为已启用
    standardizedOutputEnabled = true;

    // 重置Base64解析器状态，因为它已经被包装了
    base64ParserRegistered = true;

    console.log(`✅ 已启用标准化输出，包装了 ${wrappedParsers.length} 个解析器`);
  } catch (error) {
    console.error('❌ 启用标准化输出失败:', error.message);
    throw error;
  }
}

/**
 * 获取解析器统计信息（包括包装器统计）
 */
export function getParserStats() {
  const registryStats = globalParserRegistry.getStats();
  const parsers = globalParserRegistry.getRegisteredParsers();

  const wrapperStats = parsers
    .filter(parser => parser.getStats) // 只有包装器有getStats方法
    .map(parser => ({
      name: parser.parserName,
      stats: parser.getStats()
    }));

  return {
    registry: registryStats,
    wrappers: wrapperStats,
    totalParsers: parsers.length,
    wrappedParsers: wrapperStats.length
  };
}
