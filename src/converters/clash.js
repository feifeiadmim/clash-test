/**
 * Clash 格式转换器
 */

import { toClashFormat, fromClashFormat } from '../parsers/index.js';
import yaml from 'js-yaml';

/**
 * 安全的对象合并函数，防止原型污染
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的安全对象
 */
function safeObjectMerge(target, source) {
  if (!source || typeof source !== 'object') {
    return { ...target };
  }

  // 检查危险属性
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  for (const key of dangerousKeys) {
    if (key in source) {
      console.warn(`⚠️ 检测到危险属性 ${key}，已忽略`);
      delete source[key];
    }
  }

  // 创建安全的合并对象
  const result = {};

  // 复制目标对象属性
  for (const [key, value] of Object.entries(target)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = { ...value };
    } else {
      result[key] = value;
    }
  }

  // 安全地合并源对象属性
  for (const [key, value] of Object.entries(source)) {
    if (dangerousKeys.includes(key)) {
      continue; // 跳过危险属性
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // 递归合并对象
      result[key] = safeObjectMerge(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * 清理YAML解析结果，防止原型污染
 * @param {any} obj - 解析结果对象
 * @returns {any} 清理后的安全对象
 */
function sanitizeYamlResult(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeYamlResult(item));
  }

  // 检查和清理危险属性
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  const safeObj = {};

  for (const [key, value] of Object.entries(obj)) {
    // 跳过危险属性
    if (dangerousKeys.includes(key)) {
      console.warn(`⚠️ 检测到危险属性 ${key}，已忽略`);
      continue;
    }

    // 验证键名安全性
    if (typeof key !== 'string' || key.length > 100) {
      console.warn(`⚠️ 检测到不安全的键名，已忽略: ${key}`);
      continue;
    }

    // 递归清理值
    safeObj[key] = sanitizeYamlResult(value);
  }

  return safeObj;
}

/**
 * 默认的 Clash 配置模板
 */
const defaultClashConfig = {
  port: 7890,
  'socks-port': 7891,
  'allow-lan': false,
  mode: 'rule',
  'log-level': 'info',
  'external-controller': '127.0.0.1:9090',
  dns: {
    enable: true,
    ipv6: false,
    'default-nameserver': ['223.5.5.5', '119.29.29.29'],
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'use-hosts': true,
    nameserver: ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
    fallback: ['https://doh.dns.sb/dns-query', 'https://dns.cloudflare.com/dns-query', 'https://dns.twnic.tw/dns-query', 'tls://8.8.4.4:853'],
    'fallback-filter': { geoip: true, 'geoip-code': 'CN', ipcidr: ['240.0.0.0/4'] }
  }
};

/**
 * 默认的代理组配置
 */
const defaultProxyGroups = [
  {
    name: '🚀 节点选择',
    type: 'select',
    proxies: ['♻️ 自动选择', '🎯 全球直连', 'DIRECT']
  },
  {
    name: '♻️ 自动选择',
    type: 'url-test',
    proxies: [],
    url: 'http://www.gstatic.com/generate_204',
    interval: 300
  },
  {
    name: '🎯 全球直连',
    type: 'select',
    proxies: ['DIRECT']
  },
  {
    name: '🛑 广告拦截',
    type: 'select',
    proxies: ['REJECT', 'DIRECT']
  },
  {
    name: '🐟 漏网之鱼',
    type: 'select',
    proxies: ['🚀 节点选择', '🎯 全球直连', 'DIRECT']
  }
];

/**
 * 默认的规则配置
 */
const defaultRules = [
  'DOMAIN-SUFFIX,local,DIRECT',
  'IP-CIDR,127.0.0.0/8,DIRECT',
  'IP-CIDR,172.16.0.0/12,DIRECT',
  'IP-CIDR,192.168.0.0/16,DIRECT',
  'IP-CIDR,10.0.0.0/8,DIRECT',
  'IP-CIDR,17.0.0.0/8,DIRECT',
  'IP-CIDR,100.64.0.0/10,DIRECT',
  'IP-CIDR,224.0.0.0/4,DIRECT',
  'IP-CIDR6,fe80::/10,DIRECT',
  'GEOIP,CN,🎯 全球直连',
  'MATCH,🐟 漏网之鱼'
];

/**
 * 将节点数组转换为 Clash 配置
 * @param {Object[]} nodes - 节点数组
 * @param {Object} options - 转换选项
 * @returns {Object} Clash 配置对象
 */
export function toClashConfig(nodes, options = {}) {
  // 安全的对象合并，防止原型污染
  const config = safeObjectMerge(defaultClashConfig, options.baseConfig || {});

  // 转换代理节点
  const proxies = [];
  const proxyNames = [];

  for (const node of nodes) {
    const clashNode = toClashFormat(node);
    if (clashNode) {
      proxies.push(clashNode);
      proxyNames.push(clashNode.name);
    }
  }

  config.proxies = proxies;

  // 设置代理组
  const proxyGroups = [...defaultProxyGroups];

  // 将所有代理添加到自动选择组
  const autoSelectGroup = proxyGroups.find(group => group.name === '♻️ 自动选择');
  if (autoSelectGroup) {
    autoSelectGroup.proxies = [...proxyNames];
  }

  // 将所有代理添加到节点选择组
  const selectGroup = proxyGroups.find(group => group.name === '🚀 节点选择');
  if (selectGroup) {
    selectGroup.proxies = ['♻️ 自动选择', '🎯 全球直连', ...proxyNames];
  }

  config['proxy-groups'] = proxyGroups;

  // 设置规则
  config.rules = options.rules || defaultRules;

  return config;
}

/**
 * 从 Clash 配置解析节点
 * @param {Object|string} clashConfig - Clash 配置对象或 YAML 字符串
 * @returns {Object[]} 节点数组
 */
export function fromClashConfig(clashConfig) {
  let config;

  if (typeof clashConfig === 'string') {
    try {
      console.log(`🔍 开始解析 YAML 字符串 (${clashConfig.length} 字符)`);
      const startTime = Date.now();

      // 如果是 YAML 字符串，需要解析
      config = parseYamlString(clashConfig);

      const parseTime = Date.now() - startTime;
      console.log(`⚡ YAML 解析完成，耗时 ${parseTime}ms`);

      if (config && config.proxies) {
        console.log(`🎯 发现 ${config.proxies.length} 个代理节点`);
      } else {
        console.warn('⚠️ YAML 解析成功但未找到 proxies 数组');
      }
    } catch (error) {
      console.error('❌ 解析 Clash YAML 配置失败:', error.message);
      console.error('📄 输入内容预览:', clashConfig.substring(0, 200) + '...');
      return [];
    }
  } else {
    config = clashConfig;
  }

  const nodes = [];

  if (config && config.proxies && Array.isArray(config.proxies)) {
    console.log(`🔄 开始转换 ${config.proxies.length} 个节点...`);

    for (let i = 0; i < config.proxies.length; i++) {
      const clashNode = config.proxies[i];
      try {
        const node = fromClashFormat(clashNode);
        if (node) {
          nodes.push(node);
        }
      } catch (error) {
        console.warn(`⚠️ 节点 ${i + 1} 转换失败:`, error.message);
      }

      // 每1000个节点显示一次进度
      if ((i + 1) % 1000 === 0) {
        console.log(`📊 已处理 ${i + 1}/${config.proxies.length} 个节点`);
      }
    }

    console.log(`✅ 节点转换完成: ${config.proxies.length} → ${nodes.length} (成功率: ${((nodes.length / config.proxies.length) * 100).toFixed(1)}%)`);
  } else {
    console.warn('⚠️ 配置中未找到有效的 proxies 数组');
  }

  return nodes;
}

/**
 * 将 Clash 配置转换为 YAML 字符串
 * @param {Object} config - Clash 配置对象
 * @returns {string} YAML 字符串
 */
export function toYamlString(config) {
  try {
    return yaml.dump(config, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"'
    });
  } catch (error) {
    console.error('YAML 序列化失败:', error);
    // 降级到简化实现
    return stringifyYaml(config, 0);
  }
}

/**
 * 检查字符串是否需要引号包裹
 * @param {string} value - 要检查的值
 * @returns {boolean} 是否需要引号
 */
function needsQuotes(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  // 检查第一个字符是否为特殊字符
  const firstChar = value.charAt(0);
  const specialChars = ['@', '#', '$', '%', '&', '*', '!', '?', '|', '>', '<', '=', '+', '-', '~', '`', '^', '(', ')', '[', ']', '{', '}', ':', ';', ',', '.', '/', '\\', '"', "'"];

  return specialChars.includes(firstChar);
}

/**
 * 格式化YAML值，必要时添加引号
 * @param {any} value - 要格式化的值
 * @param {boolean} forceQuotes - 是否强制添加引号
 * @returns {string} 格式化后的值
 */
function formatYamlValue(value, forceQuotes = false) {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value.toString();
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  const stringValue = String(value);

  if (forceQuotes || needsQuotes(stringValue)) {
    // 转义引号
    const escaped = stringValue.replace(/"/g, '\\"');
    return `"${escaped}"`;
  }

  return stringValue;
}

/**
 * 将节点数组转换为简化的 Clash YAML 配置
 * @param {Object[]} nodes - 节点数组
 * @param {Object} options - 转换选项
 * @returns {string} YAML 字符串
 */
export function toSimpleClashYaml(nodes, options = {}) {
  const { sourceFormat = 'unknown' } = options;
  const shouldQuoteSpecialChars = sourceFormat === 'url' || sourceFormat === 'base64';

  const clashNodes = [];

  for (const node of nodes) {
    try {
      const clashNode = toClashFormat(node);
      if (clashNode) {
        // 添加源格式信息
        clashNode._sourceFormat = node._sourceFormat || sourceFormat;
        clashNodes.push(clashNode);
      } else {
        console.warn(`⚠️ 跳过无法转换的节点: ${node.name || node.server || 'Unknown'} (${node.type || 'Unknown type'})`);
      }
    } catch (error) {
      console.error(`❌ 转换节点失败: ${node.name || node.server || 'Unknown'}`, error.message);
      // 继续处理其他节点，不中断整个过程
    }
  }

  // 生成简化的 YAML 配置
  let yaml = 'proxies:\n';

  for (const node of clashNodes) {
    const isFromUrlOrBase64 = node._sourceFormat === 'url' || node._sourceFormat === 'base64' || shouldQuoteSpecialChars;

    yaml += `  - name: "${node.name}"\n`;
    yaml += `    type: ${node.type}\n`;
    yaml += `    server: ${node.server}\n`;
    yaml += `    port: ${node.port}\n`;

    // 根据协议类型添加特定字段
    switch (node.type) {
      case 'ss':
        yaml += `    cipher: ${formatYamlValue(node.cipher, isFromUrlOrBase64)}\n`;
        yaml += `    password: ${formatYamlValue(node.password, isFromUrlOrBase64)}\n`;
        if (node.plugin) {
          yaml += `    plugin: ${formatYamlValue(node.plugin, isFromUrlOrBase64)}\n`;
          if (node['plugin-opts']) {
            yaml += `    plugin-opts:\n`;
            for (const [key, value] of Object.entries(node['plugin-opts'])) {
              yaml += `      ${key}: ${formatYamlValue(value, isFromUrlOrBase64)}\n`;
            }
          }
        }
        break;

      case 'vmess':
        yaml += `    uuid: ${formatYamlValue(node.uuid, isFromUrlOrBase64)}\n`;
        yaml += `    alterId: ${node.alterId}\n`;
        yaml += `    cipher: ${formatYamlValue(node.cipher, isFromUrlOrBase64)}\n`;
        yaml += `    network: ${node.network}\n`;
        if (node.tls) {
          yaml += `    tls: true\n`;
          if (node.servername) {
            yaml += `    servername: ${formatYamlValue(node.servername, isFromUrlOrBase64)}\n`;
          }
        }
        if (node['ws-opts']) {
          yaml += `    ws-opts:\n`;
          yaml += `      path: ${formatYamlValue(node['ws-opts'].path, isFromUrlOrBase64)}\n`;
          if (node['ws-opts'].headers && Object.keys(node['ws-opts'].headers).length > 0) {
            yaml += `      headers:\n`;
            for (const [key, value] of Object.entries(node['ws-opts'].headers)) {
              yaml += `        ${key}: ${formatYamlValue(value, isFromUrlOrBase64)}\n`;
            }
          }
        }
        break;

      case 'vless':
        yaml += `    uuid: ${formatYamlValue(node.uuid, isFromUrlOrBase64)}\n`;
        yaml += `    network: ${node.network}\n`;
        if (node.flow) {
          yaml += `    flow: ${formatYamlValue(node.flow, isFromUrlOrBase64)}\n`;
        }
        if (node.tls) {
          yaml += `    tls: true\n`;
          if (node.servername) {
            yaml += `    servername: ${formatYamlValue(node.servername, isFromUrlOrBase64)}\n`;
          }
        }
        if (node.reality?.enabled) {
          yaml += `    reality:\n`;
          yaml += `      enabled: true\n`;
          if (node.reality['public-key']) {
            yaml += `      public-key: ${formatYamlValue(node.reality['public-key'], isFromUrlOrBase64)}\n`;
          }
          if (node.reality['short-id']) {
            yaml += `      short-id: ${formatYamlValue(node.reality['short-id'], isFromUrlOrBase64)}\n`;
          }
        }
        break;

      case 'trojan':
        yaml += `    password: ${formatYamlValue(node.password, isFromUrlOrBase64)}\n`;
        yaml += `    network: ${node.network}\n`;
        if (node.sni) {
          yaml += `    sni: ${formatYamlValue(node.sni, isFromUrlOrBase64)}\n`;
        }
        if (node['skip-cert-verify']) {
          yaml += `    skip-cert-verify: true\n`;
        }
        break;

      case 'ssr':
        yaml += `    cipher: ${formatYamlValue(node.cipher, isFromUrlOrBase64)}\n`;
        yaml += `    password: ${formatYamlValue(node.password, isFromUrlOrBase64)}\n`;
        yaml += `    protocol: ${formatYamlValue(node.protocol, isFromUrlOrBase64)}\n`;
        yaml += `    obfs: ${formatYamlValue(node.obfs, isFromUrlOrBase64)}\n`;
        if (node['protocol-param']) {
          yaml += `    protocol-param: ${formatYamlValue(node['protocol-param'], isFromUrlOrBase64)}\n`;
        }
        if (node['obfs-param']) {
          yaml += `    obfs-param: ${formatYamlValue(node['obfs-param'], isFromUrlOrBase64)}\n`;
        }
        break;

      case 'hysteria2':
        yaml += `    password: ${formatYamlValue(node.password, isFromUrlOrBase64)}\n`;
        if (node.obfs) {
          yaml += `    obfs: ${formatYamlValue(node.obfs, isFromUrlOrBase64)}\n`;
          if (node['obfs-password']) {
            yaml += `    obfs-password: ${formatYamlValue(node['obfs-password'], isFromUrlOrBase64)}\n`;
          }
        }
        if (node.sni) {
          yaml += `    sni: ${formatYamlValue(node.sni, isFromUrlOrBase64)}\n`;
        }
        if (node.up) {
          yaml += `    up: ${formatYamlValue(node.up, isFromUrlOrBase64)}\n`;
        }
        if (node.down) {
          yaml += `    down: ${formatYamlValue(node.down, isFromUrlOrBase64)}\n`;
        }
        break;

      case 'hysteria':
        yaml += `    password: ${formatYamlValue(node.password, isFromUrlOrBase64)}\n`;
        if (node.protocol && node.protocol !== 'udp') {
          yaml += `    protocol: ${node.protocol}\n`;
        }
        if (node.obfs) {
          yaml += `    obfs: ${formatYamlValue(node.obfs, isFromUrlOrBase64)}\n`;
        }
        if (node.sni) {
          yaml += `    sni: ${formatYamlValue(node.sni, isFromUrlOrBase64)}\n`;
        }
        if (node.up) {
          yaml += `    up: ${node.up}\n`;
        }
        if (node.down) {
          yaml += `    down: ${node.down}\n`;
        }
        if (node['skip-cert-verify']) {
          yaml += `    skip-cert-verify: true\n`;
        }
        break;

      case 'tuic':
        yaml += `    uuid: ${formatYamlValue(node.uuid, isFromUrlOrBase64)}\n`;
        yaml += `    password: ${formatYamlValue(node.password, isFromUrlOrBase64)}\n`;
        if (node.version && node.version !== 5) {
          yaml += `    version: ${node.version}\n`;
        }
        if (node['congestion-controller'] && node['congestion-controller'] !== 'cubic') {
          yaml += `    congestion-controller: ${node['congestion-controller']}\n`;
        }
        if (node['udp-relay-mode'] && node['udp-relay-mode'] !== 'native') {
          yaml += `    udp-relay-mode: ${node['udp-relay-mode']}\n`;
        }
        if (node.sni) {
          yaml += `    sni: ${formatYamlValue(node.sni, isFromUrlOrBase64)}\n`;
        }
        if (node['skip-cert-verify']) {
          yaml += `    skip-cert-verify: true\n`;
        }
        break;

      case 'snell':
        yaml += `    psk: ${formatYamlValue(node.psk, isFromUrlOrBase64)}\n`;
        yaml += `    version: ${node.version}\n`;
        if (node['obfs-opts']) {
          yaml += `    obfs-opts:\n`;
          yaml += `      mode: ${formatYamlValue(node['obfs-opts'].mode, isFromUrlOrBase64)}\n`;
          if (node['obfs-opts'].host) {
            yaml += `      host: ${formatYamlValue(node['obfs-opts'].host, isFromUrlOrBase64)}\n`;
          }
        }
        break;

      case 'anytls':
        yaml += `    password: ${formatYamlValue(node.password, isFromUrlOrBase64)}\n`;
        if (node.tls) {
          yaml += `    tls: true\n`;
          if (node.tls.sni || node.tls.servername) {
            yaml += `    sni: ${formatYamlValue(node.tls.sni || node.tls.servername, isFromUrlOrBase64)}\n`;
          }
          if (node.tls['skip-cert-verify']) {
            yaml += `    skip-cert-verify: true\n`;
          }
        }
        if (node['idle-session-check-interval']) {
          yaml += `    idle-session-check-interval: ${formatYamlValue(node['idle-session-check-interval'], isFromUrlOrBase64)}\n`;
        }
        if (node['idle-session-timeout']) {
          yaml += `    idle-session-timeout: ${formatYamlValue(node['idle-session-timeout'], isFromUrlOrBase64)}\n`;
        }
        if (node['min-idle-session'] !== undefined) {
          yaml += `    min-idle-session: ${node['min-idle-session']}\n`;
        }
        if (node['padding-scheme']) {
          yaml += `    padding-scheme:\n`;
          if (Array.isArray(node['padding-scheme'])) {
            for (const scheme of node['padding-scheme']) {
              yaml += `      - ${formatYamlValue(scheme, isFromUrlOrBase64)}\n`;
            }
          }
        }
        break;
    }

    yaml += `    udp: true\n`;
    yaml += '\n';
  }

  return yaml;
}

/**
 * 预处理 YAML 字符串，移除不支持的标签
 * @param {string} yamlString - 原始 YAML 字符串
 * @returns {string} 处理后的 YAML 字符串
 */
function preprocessYamlString(yamlString) {
  // 移除 !<str> 标签，保留值
  let processed = yamlString.replace(/!<str>\s+/g, '');

  // 移除其他可能的自定义标签
  processed = processed.replace(/!<[^>]+>\s+/g, '');

  return processed;
}

/**
 * 解析 YAML 字符串为对象
 * @param {string} yamlString - YAML 字符串
 * @returns {Object} 解析后的对象
 */
function parseYamlString(yamlString) {
  try {
    console.log(`🔧 开始预处理 YAML 字符串...`);

    // 预处理 YAML 字符串
    const processedYaml = preprocessYamlString(yamlString);

    console.log(`🔧 预处理完成，开始 js-yaml 解析...`);

    // 使用 js-yaml 解析，配置安全选项
    const config = yaml.load(processedYaml, {
      schema: yaml.DEFAULT_SCHEMA,
      json: false,
      // 安全选项
      filename: 'clash-config.yaml',
      onWarning: (warning) => {
        console.warn(`⚠️ YAML 解析警告:`, warning.message);
      },
      // 禁用不安全的构造函数
      schema: yaml.CORE_SCHEMA
    });

    if (!config) {
      throw new Error('YAML 解析结果为空');
    }

    console.log(`✅ js-yaml 解析成功`);

    // 安全清理解析结果，防止原型污染
    const safeConfig = sanitizeYamlResult(config);
    return safeConfig;
  } catch (error) {
    console.error(`❌ YAML 解析失败:`, error.message);

    // 提供更详细的错误信息
    if (error.mark) {
      console.error(`📍 错误位置: 行 ${error.mark.line + 1}, 列 ${error.mark.column + 1}`);
      if (error.mark.get_snippet) {
        console.error(`📄 错误上下文: ${error.mark.get_snippet()}`);
      }
    }

    throw new Error(`YAML 解析失败: ${error.message}`);
  }
}

/**
 * 简化的 YAML 序列化函数
 * @param {any} obj - 要序列化的对象
 * @param {number} indent - 缩进级别
 * @returns {string} YAML 字符串
 */
function stringifyYaml(obj, indent = 0) {
  const spaces = '  '.repeat(indent);

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'boolean') {
    return obj.toString();
  }

  if (typeof obj === 'number') {
    return obj.toString();
  }

  if (typeof obj === 'string') {
    // 简单的字符串处理，实际需要更复杂的转义逻辑
    if (obj.includes('\n') || obj.includes(':') || obj.includes('#')) {
      return `"${obj.replace(/"/g, '\\"')}"`;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return '[]';
    }
    return obj.map(item => `${spaces}- ${stringifyYaml(item, indent + 1).replace(/^\s+/, '')}`).join('\n');
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) {
      return '{}';
    }

    return entries.map(([key, value]) => {
      const valueStr = stringifyYaml(value, indent + 1);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return `${spaces}${key}:\n${valueStr}`;
      } else if (Array.isArray(value) && value.length > 0) {
        return `${spaces}${key}:\n${valueStr}`;
      } else {
        return `${spaces}${key}: ${valueStr}`;
      }
    }).join('\n');
  }

  return String(obj);
}

/**
 * 创建自定义 Clash 配置
 * @param {Object[]} nodes - 节点数组
 * @param {Object} template - 配置模板
 * @returns {Object} Clash 配置对象
 */
export function createCustomClashConfig(nodes, template) {
  const config = toClashConfig(nodes, { baseConfig: template.config });

  // 应用自定义代理组
  if (template.proxyGroups) {
    config['proxy-groups'] = template.proxyGroups;
  }

  // 应用自定义规则
  if (template.rules) {
    config.rules = template.rules;
  }

  return config;
}

/**
 * 验证 Clash 配置
 * @param {Object} config - Clash 配置对象
 * @returns {Object} 验证结果
 */
export function validateClashConfig(config) {
  const errors = [];
  const warnings = [];

  // 检查必需字段
  if (!config.proxies || !Array.isArray(config.proxies)) {
    errors.push('缺少 proxies 字段或格式错误');
  }

  if (!config['proxy-groups'] || !Array.isArray(config['proxy-groups'])) {
    warnings.push('缺少 proxy-groups 字段');
  }

  if (!config.rules || !Array.isArray(config.rules)) {
    warnings.push('缺少 rules 字段');
  }

  // 检查代理节点
  if (config.proxies) {
    config.proxies.forEach((proxy, index) => {
      if (!proxy.name) {
        errors.push(`代理节点 ${index} 缺少 name 字段`);
      }
      if (!proxy.type) {
        errors.push(`代理节点 ${index} 缺少 type 字段`);
      }
      if (!proxy.server) {
        errors.push(`代理节点 ${index} 缺少 server 字段`);
      }
      if (!proxy.port) {
        errors.push(`代理节点 ${index} 缺少 port 字段`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
