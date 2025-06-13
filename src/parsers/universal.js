/**
 * 通用解析器管理器
 * 支持自动检测和解析多种代理格式，借鉴Sub-Store的设计
 */

import { wireGuardParsers } from './wireguard.js';
import { sshParsers } from './ssh.js';
import { httpSocksParsers } from './http-socks.js';
import * as shadowsocks from './shadowsocks.js';
import * as shadowsocksr from './shadowsocksr.js';
import * as vmess from './vmess.js';
import * as vless from './vless.js';
import * as trojan from './trojan.js';
import * as hysteria from './hysteria.js';
import * as hysteria2 from './hysteria2.js';
import * as tuic from './tuic.js';
import * as snell from './snell.js';
import * as anytls from './anytls.js';

/**
 * 通用解析器管理器
 * 自动检测格式并选择合适的解析器
 */
export class UniversalParser {
  constructor() {
    this.parsers = [];
    this.registerDefaultParsers();
  }

  /**
   * 注册默认解析器
   */
  registerDefaultParsers() {
    // URI 格式解析器
    this.register('ss', {
      test: (line) => line.startsWith('ss://'),
      parse: (line) => shadowsocks.parseShadowsocksUrl(line)
    });

    this.register('ssr', {
      test: (line) => line.startsWith('ssr://'),
      parse: (line) => shadowsocksr.parseShadowsocksRUrl(line)
    });

    this.register('vmess', {
      test: (line) => line.startsWith('vmess://'),
      parse: (line) => vmess.parseVMessUrl(line)
    });

    this.register('vless', {
      test: (line) => line.startsWith('vless://'),
      parse: (line) => vless.parseVLESSUrl(line)
    });

    this.register('trojan', {
      test: (line) => line.startsWith('trojan://'),
      parse: (line) => trojan.parseTrojanUrl(line)
    });

    this.register('hysteria', {
      test: (line) => line.startsWith('hysteria://'),
      parse: (line) => hysteria.parseHysteriaUrl(line)
    });

    this.register('hysteria2', {
      test: (line) => line.startsWith('hysteria2://') || line.startsWith('hy2://'),
      parse: (line) => hysteria2.parseHysteria2Url(line)
    });

    this.register('tuic', {
      test: (line) => line.startsWith('tuic://'),
      parse: (line) => tuic.parseTuicUrl(line)
    });

    this.register('snell', {
      test: (line) => line.startsWith('snell://'),
      parse: (line) => snell.parseSnellUrl(line)
    });

    // 新增解析器
    for (const parser of wireGuardParsers) {
      this.register(`wireguard-${parser.name}`, parser);
    }

    for (const parser of sshParsers) {
      this.register(`ssh-${parser.name}`, parser);
    }

    for (const parser of httpSocksParsers) {
      this.register(`http-socks-${parser.name}`, parser);
    }
  }

  /**
   * 注册解析器
   * @param {string} name - 解析器名称
   * @param {Object} parser - 解析器对象
   */
  register(name, parser) {
    this.parsers.push({
      name,
      ...parser
    });
  }

  /**
   * 解析单行内容
   * @param {string} line - 输入行
   * @returns {Object|null} 解析结果
   */
  parseLine(line) {
    if (!line || typeof line !== 'string') {
      return null;
    }

    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      return null;
    }

    // 尝试所有解析器
    for (const parser of this.parsers) {
      try {
        if (parser.test(line)) {
          const result = parser.parse(line);
          if (result) {
            result._parser = parser.name;
            return result;
          }
        }
      } catch (error) {
        console.warn(`解析器 ${parser.name} 解析失败:`, error.message);
        continue;
      }
    }

    return null;
  }

  /**
   * 解析多行内容
   * @param {string} content - 输入内容
   * @returns {Object[]} 解析结果数组
   */
  parseContent(content) {
    if (!content || typeof content !== 'string') {
      return [];
    }

    const lines = content.split(/\r?\n/);
    const results = [];

    for (const line of lines) {
      const result = this.parseLine(line);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * 智能解析
   * 自动检测内容格式并解析
   * @param {string} content - 输入内容
   * @returns {Object} 解析结果
   */
  smartParse(content) {
    if (!content || typeof content !== 'string') {
      return { nodes: [], format: 'unknown', errors: [] };
    }

    const errors = [];
    let format = 'unknown';
    let nodes = [];

    try {
      // 尝试检测格式
      format = this.detectFormat(content);

      switch (format) {
        case 'base64':
          // Base64 编码的订阅
          try {
            const decoded = atob(content.trim());
            nodes = this.parseContent(decoded);
          } catch (e) {
            // 尝试 Buffer 解码
            const decoded = Buffer.from(content.trim(), 'base64').toString('utf8');
            nodes = this.parseContent(decoded);
          }
          break;

        case 'yaml':
        case 'clash':
          // Clash YAML 格式
          nodes = this.parseClashYaml(content);
          break;

        case 'json':
          // JSON 格式
          nodes = this.parseJson(content);
          break;

        case 'config':
          // 配置文件格式
          nodes = this.parseConfigFile(content);
          break;

        case 'uri':
        default:
          // URI 格式或混合格式
          nodes = this.parseContent(content);
          break;
      }

    } catch (error) {
      errors.push(error.message);
    }

    return {
      nodes,
      format,
      errors,
      stats: {
        total: nodes.length,
        parsers: this.getUsedParsers(nodes)
      }
    };
  }

  /**
   * 检测内容格式
   * @param {string} content - 输入内容
   * @returns {string} 格式类型
   */
  detectFormat(content) {
    const trimmed = content.trim();

    // Base64 检测
    if (/^[A-Za-z0-9+/]+=*$/.test(trimmed) && trimmed.length % 4 === 0) {
      try {
        const decoded = atob(trimmed);
        if (decoded.includes('://')) {
          return 'base64';
        }
      } catch (e) {
        // 忽略错误
      }
    }

    // YAML/Clash 检测
    if (trimmed.includes('proxies:') || trimmed.includes('proxy-groups:')) {
      return 'clash';
    }

    // JSON 检测
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch (e) {
        // 忽略错误
      }
    }

    // 配置文件检测
    if (trimmed.includes('[Interface]') || trimmed.includes('[Peer]')) {
      return 'config';
    }

    // URI 格式检测
    if (trimmed.includes('://')) {
      return 'uri';
    }

    return 'unknown';
  }

  /**
   * 解析 Clash YAML 格式
   * @param {string} content - YAML 内容
   * @returns {Object[]} 解析结果
   */
  parseClashYaml(content) {
    try {
      // 使用专业的 js-yaml 库进行解析
      const yaml = require('js-yaml');

      // 预处理 YAML 字符串，移除不支持的标签
      const processedContent = this.preprocessYamlString(content);

      // 解析 YAML
      const config = yaml.load(processedContent, {
        // 配置选项以处理大文件
        schema: yaml.DEFAULT_SCHEMA,
        json: false
      });

      // 提取 proxies 数组
      if (config && config.proxies && Array.isArray(config.proxies)) {
        console.log(`🎯 使用 js-yaml 成功解析 ${config.proxies.length} 个节点`);
        return config.proxies;
      }

      console.warn('⚠️ YAML 文件中未找到 proxies 数组');
      return [];

    } catch (yamlError) {
      console.warn('⚠️ js-yaml 解析失败，回退到手工解析:', yamlError.message);

      // 回退到手工解析（保留原有逻辑作为备用）
      return this.parseClashYamlManual(content);
    }
  }

  /**
   * 预处理 YAML 字符串，移除不支持的标签
   * @param {string} yamlString - 原始 YAML 字符串
   * @returns {string} 处理后的 YAML 字符串
   */
  preprocessYamlString(yamlString) {
    // 移除 !<str> 标签，保留值
    let processed = yamlString.replace(/!<str>\s+/g, '');

    // 移除其他可能的自定义标签
    processed = processed.replace(/!<[^>]+>\s+/g, '');

    return processed;
  }

  /**
   * 手工解析 Clash YAML 格式（备用方法）
   * @param {string} content - YAML 内容
   * @returns {Object[]} 解析结果
   */
  parseClashYamlManual(content) {
    const lines = content.split('\n');
    const nodes = [];
    let inProxies = false;
    let currentProxy = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === 'proxies:') {
        inProxies = true;
        continue;
      }

      if (inProxies) {
        if (trimmed.startsWith('- name:') || trimmed.startsWith('- {')) {
          if (currentProxy) {
            nodes.push(currentProxy);
          }
          currentProxy = {};
        }

        if (currentProxy && trimmed.includes(':')) {
          const [key, ...valueParts] = trimmed.replace(/^- /, '').split(':');
          const value = valueParts.join(':').trim();
          currentProxy[key.trim()] = value;
        }
      }
    }

    if (currentProxy) {
      nodes.push(currentProxy);
    }

    console.log(`🔧 手工解析完成，解析到 ${nodes.length} 个节点`);
    return nodes;
  }

  /**
   * 解析 JSON 格式
   * @param {string} content - JSON 内容
   * @returns {Object[]} 解析结果
   */
  parseJson(content) {
    try {
      const data = JSON.parse(content);
      
      if (Array.isArray(data)) {
        return data;
      } else if (data.proxies && Array.isArray(data.proxies)) {
        return data.proxies;
      } else if (data.outbounds && Array.isArray(data.outbounds)) {
        // V2Ray 格式
        return data.outbounds.filter(outbound => outbound.protocol !== 'freedom');
      }
      
      return [data];
    } catch (error) {
      console.error('JSON 解析失败:', error);
      return [];
    }
  }

  /**
   * 解析配置文件格式
   * @param {string} content - 配置内容
   * @returns {Object[]} 解析结果
   */
  parseConfigFile(content) {
    // 尝试 WireGuard 配置解析器
    for (const parser of wireGuardParsers) {
      if (parser.test && parser.test(content)) {
        try {
          const result = parser.parse(content);
          return Array.isArray(result) ? result : [result];
        } catch (error) {
          console.warn('配置文件解析失败:', error);
        }
      }
    }

    return [];
  }

  /**
   * 获取使用的解析器统计
   * @param {Object[]} nodes - 节点数组
   * @returns {Object} 解析器统计
   */
  getUsedParsers(nodes) {
    const stats = {};
    
    for (const node of nodes) {
      if (node._parser) {
        stats[node._parser] = (stats[node._parser] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * 获取支持的格式列表
   * @returns {string[]} 支持的格式
   */
  getSupportedFormats() {
    return ['uri', 'base64', 'clash', 'yaml', 'json', 'config'];
  }

  /**
   * 获取注册的解析器列表
   * @returns {string[]} 解析器名称列表
   */
  getRegisteredParsers() {
    return this.parsers.map(p => p.name);
  }
}

// 导出默认实例
export const universalParser = new UniversalParser();
