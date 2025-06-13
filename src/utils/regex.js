/**
 * 智能正则表达式工具
 * 提供高级正则功能，包括(?i)语法支持、排序等
 */

/**
 * 安全构建智能正则表达式
 * 支持(?i)忽略大小写语法，包含安全验证
 * @param {string} pattern - 正则模式
 * @param {...string} flags - 额外的正则标志
 * @returns {RegExp} 正则表达式对象
 */
export function buildRegex(pattern, ...flags) {
  // 输入验证
  if (!pattern || typeof pattern !== 'string') {
    throw new Error('Pattern must be a non-empty string');
  }

  // 长度限制防止DoS攻击
  if (pattern.length > 1000) {
    throw new Error(`Pattern too long: ${pattern.length} > 1000`);
  }

  // 验证标志
  const additionalFlags = flags.join('');
  const validFlags = /^[gimsuvy]*$/;
  if (!validFlags.test(additionalFlags)) {
    throw new Error(`Invalid regex flags: ${additionalFlags}`);
  }

  // 检查危险的正则表达式模式
  const dangerousPatterns = [
    /\(\?\?\)/,                    // 非贪婪量词可能导致灾难性回溯
    /\(\?\=.*\?\=.*\?\=/,         // 多重前瞻断言
    /\(\?\!.*\?\!.*\?\!/,         // 多重负前瞻断言
    /\(\?\<\=.*\?\<\=.*\?\<\=/,   // 多重后瞻断言
    /\(\?\<\!.*\?\<\!.*\?\<\!/,   // 多重负后瞻断言
    /\(\?\:.*\?\:.*\?\:/,         // 过多非捕获组
    /\*\+/,                       // 嵌套量词
    /\+\*/,                       // 嵌套量词
    /\{\d{3,}\}/,                 // 大量重复
    /\(\?\#/,                     // 注释语法（可能包含恶意代码）
  ];

  for (const dangerousPattern of dangerousPatterns) {
    if (dangerousPattern.test(pattern)) {
      throw new Error('Pattern contains potentially dangerous constructs');
    }
  }

  // 检查复杂度（简单的启发式方法）
  const complexity = calculateRegexComplexity(pattern);
  if (complexity > 100) {
    throw new Error(`Pattern too complex: complexity ${complexity} > 100`);
  }

  try {
    if (pattern.startsWith('(?i)')) {
      // 支持忽略大小写语法
      const actualPattern = pattern.substring(4);
      return new RegExp(actualPattern, 'i' + additionalFlags);
    } else {
      return new RegExp(pattern, additionalFlags);
    }
  } catch (error) {
    throw new Error(`Invalid regex pattern: ${error.message}`);
  }
}

/**
 * 计算正则表达式复杂度
 * @param {string} pattern - 正则模式
 * @returns {number} 复杂度分数
 */
function calculateRegexComplexity(pattern) {
  let complexity = 0;

  // 基础复杂度
  complexity += pattern.length * 0.1;

  // 量词复杂度
  complexity += (pattern.match(/[*+?]/g) || []).length * 2;
  complexity += (pattern.match(/\{\d+,?\d*\}/g) || []).length * 3;

  // 字符类复杂度
  complexity += (pattern.match(/\[.*?\]/g) || []).length * 2;

  // 分组复杂度
  complexity += (pattern.match(/\(/g) || []).length * 1.5;

  // 断言复杂度
  complexity += (pattern.match(/\(\?\=/g) || []).length * 5;
  complexity += (pattern.match(/\(\?\!/g) || []).length * 5;
  complexity += (pattern.match(/\(\?\<\=/g) || []).length * 5;
  complexity += (pattern.match(/\(\?\<\!/g) || []).length * 5;

  // 反向引用复杂度
  complexity += (pattern.match(/\\[1-9]/g) || []).length * 3;

  return Math.round(complexity);
}

/**
 * 正则排序器
 * 根据正则表达式优先级对节点进行排序
 */
export class RegexSorter {
  constructor(expressions, order = 'asc') {
    this.regexList = expressions.map(expr => ({
      regex: buildRegex(expr),
      priority: expressions.indexOf(expr)
    }));
    this.order = order;
  }

  /**
   * 获取节点的正则匹配优先级
   * @param {string} name - 节点名称
   * @returns {number|null} 优先级（数字越小优先级越高）
   */
  getRegexOrder(name) {
    for (const { regex, priority } of this.regexList) {
      if (regex.test(name)) {
        return priority;
      }
    }
    return null;
  }

  /**
   * 对节点数组进行排序
   * @param {Object[]} proxies - 节点数组
   * @returns {Object[]} 排序后的节点数组
   */
  sort(proxies) {
    return proxies.sort((a, b) => {
      const orderA = this.getRegexOrder(a.name);
      const orderB = this.getRegexOrder(b.name);

      // 有匹配的排在前面
      if (orderA !== null && orderB === null) return -1;
      if (orderB !== null && orderA === null) return 1;

      // 都有匹配，按优先级排序
      if (orderA !== null && orderB !== null) {
        return orderA - orderB;
      }

      // 都没匹配，按字母排序
      const nameA = a.name || '';
      const nameB = b.name || '';

      if (this.order === 'desc') {
        return nameA < nameB ? 1 : -1;
      } else {
        return nameA < nameB ? -1 : 1;
      }
    });
  }
}

/**
 * 正则重命名器
 * 使用正则表达式批量重命名节点
 */
export class RegexRenamer {
  constructor(rules) {
    this.rules = rules.map(rule => ({
      regex: buildRegex(rule.pattern),
      replacement: rule.replacement,
      global: rule.global || false
    }));
  }

  /**
   * 重命名单个节点
   * @param {Object} proxy - 节点对象
   * @returns {Object} 重命名后的节点对象
   */
  rename(proxy) {
    let newName = proxy.name || '';

    for (const { regex, replacement, global } of this.rules) {
      if (global) {
        newName = newName.replace(new RegExp(regex.source, regex.flags + 'g'), replacement);
      } else {
        newName = newName.replace(regex, replacement);
      }
    }

    return {
      ...proxy,
      name: newName
    };
  }

  /**
   * 批量重命名节点数组
   * @param {Object[]} proxies - 节点数组
   * @returns {Object[]} 重命名后的节点数组
   */
  renameAll(proxies) {
    return proxies.map(proxy => this.rename(proxy));
  }
}

/**
 * 正则匹配器
 * 提供高级的正则匹配功能
 */
export class RegexMatcher {
  /**
   * 测试多个模式是否匹配
   * @param {string} text - 要测试的文本
   * @param {string[]} patterns - 正则模式数组
   * @param {string} mode - 匹配模式：'any'(任一匹配) 或 'all'(全部匹配)
   * @returns {boolean} 是否匹配
   */
  static test(text, patterns, mode = 'any') {
    const regexList = patterns.map(pattern => buildRegex(pattern));

    if (mode === 'all') {
      return regexList.every(regex => regex.test(text));
    } else {
      return regexList.some(regex => regex.test(text));
    }
  }

  /**
   * 提取匹配的内容
   * @param {string} text - 要匹配的文本
   * @param {string} pattern - 正则模式
   * @param {number} group - 捕获组索引
   * @returns {string|null} 匹配的内容
   */
  static extract(text, pattern, group = 0) {
    const regex = buildRegex(pattern);
    const match = text.match(regex);

    if (match && match[group] !== undefined) {
      return match[group];
    }

    return null;
  }

  /**
   * 提取所有匹配的内容
   * @param {string} text - 要匹配的文本
   * @param {string} pattern - 正则模式
   * @param {number} group - 捕获组索引
   * @returns {string[]} 所有匹配的内容
   */
  static extractAll(text, pattern, group = 0) {
    const regex = buildRegex(pattern, 'g');
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match[group] !== undefined) {
        matches.push(match[group]);
      }
    }

    return matches;
  }
}

/**
 * 预定义的常用正则模式
 */
export const CommonPatterns = {
  // 地域匹配
  REGIONS: {
    HK: '(?i)(香港|hk|hong.?kong)',
    SG: '(?i)(新加坡|sg|singapore)',
    JP: '(?i)(日本|jp|japan)',
    US: '(?i)(美国|us|america|united.?states)',
    UK: '(?i)(英国|uk|britain|united.?kingdom)',
    DE: '(?i)(德国|de|germany)',
    FR: '(?i)(法国|fr|france)',
    CA: '(?i)(加拿大|ca|canada)',
    AU: '(?i)(澳洲|au|australia)',
    KR: '(?i)(韩国|kr|korea)',
    TW: '(?i)(台湾|tw|taiwan)',
    RU: '(?i)(俄罗斯|ru|russia)'
  },

  // 协议类型
  PROTOCOLS: {
    VMESS: '(?i)vmess',
    VLESS: '(?i)vless',
    TROJAN: '(?i)trojan',
    SS: '(?i)(shadowsocks|ss)',
    SSR: '(?i)(shadowsocksr|ssr)',
    HYSTERIA: '(?i)hysteria',
    TUIC: '(?i)tuic',
    SNELL: '(?i)snell'
  },

  // 特殊标识
  SPECIAL: {
    PREMIUM: '(?i)(premium|vip|pro|plus)',
    TRIAL: '(?i)(trial|test|测试)',
    EXPIRED: '(?i)(expire|过期|到期)',
    TRAFFIC: '(?i)(traffic|流量|剩余)',
    SPEED: '(?i)(\\d+x|倍速|加速)'
  },

  // 数字提取
  NUMBERS: {
    INDEX: '(\\d+)',
    SPEED: '(\\d+)x',
    PORT: ':(\\d+)',
    IP: '(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})'
  }
};

/**
 * 正则工具集合
 */
export const RegexUtils = {
  buildRegex,
  RegexSorter,
  RegexRenamer,
  RegexMatcher,
  CommonPatterns
};

/**
 * 快捷函数：创建地域排序器
 * @param {string[]} regions - 地域优先级数组
 * @returns {RegexSorter} 排序器实例
 */
export function createRegionSorter(regions) {
  const patterns = regions.map(region => CommonPatterns.REGIONS[region] || region);
  return new RegexSorter(patterns);
}

/**
 * 快捷函数：创建协议排序器
 * @param {string[]} protocols - 协议优先级数组
 * @returns {RegexSorter} 排序器实例
 */
export function createProtocolSorter(protocols) {
  const patterns = protocols.map(protocol => CommonPatterns.PROTOCOLS[protocol] || protocol);
  return new RegexSorter(patterns);
}

/**
 * 高级正则过滤器
 * 支持复杂的过滤逻辑，借鉴Sub-Store的设计
 */
export class AdvancedRegexFilter {
  constructor() {
    this.filters = [];
  }

  /**
   * 添加包含过滤器
   * @param {string[]} patterns - 正则模式数组
   * @returns {AdvancedRegexFilter} 返回自身，支持链式调用
   */
  include(patterns) {
    this.filters.push({
      type: 'include',
      patterns: patterns.map(p => buildRegex(p))
    });
    return this;
  }

  /**
   * 添加排除过滤器
   * @param {string[]} patterns - 正则模式数组
   * @returns {AdvancedRegexFilter} 返回自身，支持链式调用
   */
  exclude(patterns) {
    this.filters.push({
      type: 'exclude',
      patterns: patterns.map(p => buildRegex(p))
    });
    return this;
  }

  /**
   * 添加条件过滤器
   * @param {Object} condition - 条件对象
   * @returns {AdvancedRegexFilter} 返回自身，支持链式调用
   */
  condition(condition) {
    this.filters.push({
      type: 'condition',
      condition
    });
    return this;
  }

  /**
   * 应用过滤器
   * @param {Object[]} proxies - 节点数组
   * @returns {Object[]} 过滤后的节点数组
   */
  apply(proxies) {
    return proxies.filter(proxy => {
      const name = proxy.name || '';

      for (const filter of this.filters) {
        switch (filter.type) {
          case 'include':
            if (!filter.patterns.some(regex => regex.test(name))) {
              return false;
            }
            break;

          case 'exclude':
            if (filter.patterns.some(regex => regex.test(name))) {
              return false;
            }
            break;

          case 'condition':
            if (!this.evaluateCondition(proxy, filter.condition)) {
              return false;
            }
            break;
        }
      }

      return true;
    });
  }

  /**
   * 评估条件
   * @param {Object} proxy - 节点对象
   * @param {Object} condition - 条件对象
   * @returns {boolean} 是否满足条件
   */
  evaluateCondition(proxy, condition) {
    const { operator, rules } = condition;

    if (!rules || !Array.isArray(rules)) {
      return true;
    }

    const results = rules.map(rule => this.evaluateRule(proxy, rule));

    switch (operator) {
      case 'AND':
        return results.every(r => r);
      case 'OR':
        return results.some(r => r);
      case 'NOT':
        return !results[0];
      default:
        return results[0];
    }
  }

  /**
   * 评估单个规则
   * @param {Object} proxy - 节点对象
   * @param {Object} rule - 规则对象
   * @returns {boolean} 是否满足规则
   */
  evaluateRule(proxy, rule) {
    const { field, operator, value } = rule;
    const fieldValue = proxy[field];

    switch (operator) {
      case 'EQUALS':
        return fieldValue === value;
      case 'CONTAINS':
        return String(fieldValue).includes(value);
      case 'REGEX':
        return buildRegex(value).test(String(fieldValue));
      case 'IN':
        return Array.isArray(value) && value.includes(fieldValue);
      case 'GT':
        return Number(fieldValue) > Number(value);
      case 'LT':
        return Number(fieldValue) < Number(value);
      default:
        return false;
    }
  }

  /**
   * 清空所有过滤器
   * @returns {AdvancedRegexFilter} 返回自身，支持链式调用
   */
  clear() {
    this.filters = [];
    return this;
  }
}

/**
 * 正则删除器
 * 根据正则模式删除匹配的内容
 */
export class RegexDeleter {
  constructor(patterns) {
    this.patterns = patterns.map(pattern => buildRegex(pattern, 'g'));
  }

  /**
   * 删除匹配的内容
   * @param {Object[]} proxies - 节点数组
   * @returns {Object[]} 处理后的节点数组
   */
  delete(proxies) {
    return proxies.map(proxy => {
      let newName = proxy.name || '';

      for (const regex of this.patterns) {
        newName = newName.replace(regex, '').trim();
      }

      return {
        ...proxy,
        name: newName
      };
    });
  }
}

/**
 * 智能正则构建器
 * 提供更智能的正则表达式构建功能
 */
export class SmartRegexBuilder {
  /**
   * 构建地域匹配正则
   * @param {string} region - 地域代码
   * @param {boolean} strict - 是否严格匹配
   * @returns {string} 正则模式
   */
  static buildRegionPattern(region, strict = false) {
    const basePattern = CommonPatterns.REGIONS[region.toUpperCase()];
    if (!basePattern) {
      return strict ? `(?i)\\b${region}\\b` : `(?i)${region}`;
    }

    if (strict) {
      // 严格模式：添加单词边界
      return basePattern.replace('(?i)', '(?i)\\b') + '\\b';
    }

    return basePattern;
  }

  /**
   * 构建协议匹配正则
   * @param {string} protocol - 协议名称
   * @returns {string} 正则模式
   */
  static buildProtocolPattern(protocol) {
    return CommonPatterns.PROTOCOLS[protocol.toUpperCase()] || `(?i)${protocol}`;
  }

  /**
   * 构建数字范围匹配正则
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {string} 正则模式
   */
  static buildNumberRangePattern(min, max) {
    if (min === max) {
      return `\\b${min}\\b`;
    }

    // 简化的数字范围匹配
    const patterns = [];
    for (let i = min; i <= max; i++) {
      patterns.push(`\\b${i}\\b`);
    }

    return `(${patterns.join('|')})`;
  }

  /**
   * 构建模糊匹配正则
   * @param {string} text - 要匹配的文本
   * @param {number} tolerance - 容错级别 (0-1)
   * @returns {string} 正则模式
   */
  static buildFuzzyPattern(text, tolerance = 0.2) {
    const chars = text.split('');
    const maxErrors = Math.floor(chars.length * tolerance);

    if (maxErrors === 0) {
      return `(?i)${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
    }

    // 简化的模糊匹配：允许字符缺失
    let pattern = '(?i)';
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (i < chars.length - maxErrors) {
        pattern += char;
      } else {
        pattern += `${char}?`;
      }
    }

    return pattern;
  }
}

/**
 * 正则性能优化器
 * 优化正则表达式的性能
 */
export class RegexOptimizer {
  /**
   * 优化正则表达式数组
   * @param {string[]} patterns - 正则模式数组
   * @returns {RegExp[]} 优化后的正则数组
   */
  static optimize(patterns) {
    // 去重
    const uniquePatterns = [...new Set(patterns)];

    // 按长度排序（短的在前，可能更快匹配）
    uniquePatterns.sort((a, b) => a.length - b.length);

    // 预编译正则
    return uniquePatterns.map(pattern => buildRegex(pattern));
  }

  /**
   * 合并相似的正则模式
   * @param {string[]} patterns - 正则模式数组
   * @returns {string[]} 合并后的模式数组
   */
  static merge(patterns) {
    // 简单的合并逻辑：将相同前缀的模式合并
    const groups = new Map();

    for (const pattern of patterns) {
      const prefix = pattern.substring(0, 3);
      if (!groups.has(prefix)) {
        groups.set(prefix, []);
      }
      groups.get(prefix).push(pattern);
    }

    const merged = [];
    for (const [prefix, group] of groups) {
      if (group.length === 1) {
        merged.push(group[0]);
      } else {
        // 简单合并：用 | 连接
        const alternatives = group.map(p => p.replace(/^\(\?\i\)/, '')).join('|');
        merged.push(`(?i)(${alternatives})`);
      }
    }

    return merged;
  }
}
