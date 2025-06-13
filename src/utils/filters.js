/**
 * 节点过滤器系统
 * 提供多种过滤策略，支持链式调用
 */

/**
 * 过滤器基类
 */
class BaseFilter {
  constructor(name) {
    this.name = name;
  }

  /**
   * 过滤节点
   * @param {Object[]} proxies - 节点数组
   * @param {Object} options - 过滤选项
   * @returns {Object[]} 过滤后的节点数组
   */
  filter(proxies, options = {}) {
    throw new Error('Filter method must be implemented');
  }
}

/**
 * 地域过滤器
 * 根据节点名称中的地域标识进行过滤
 */
export class RegionFilter extends BaseFilter {
  constructor() {
    super('Region Filter');

    // 地域标识映射
    this.regionMap = {
      // 中国
      'HK': ['香港', 'HK', 'Hong Kong', 'hongkong', '🇭🇰'],
      'TW': ['台湾', 'TW', 'Taiwan', 'taiwan', '🇹🇼'],
      'CN': ['中国', 'CN', 'China', 'china', '🇨🇳'],

      // 亚洲
      'SG': ['新加坡', 'SG', 'Singapore', 'singapore', '🇸🇬'],
      'JP': ['日本', 'JP', 'Japan', 'japan', '🇯🇵'],
      'KR': ['韩国', 'KR', 'Korea', 'korea', '🇰🇷'],

      // 欧洲
      'UK': ['英国', 'UK', 'Britain', 'britain', '🇬🇧'],
      'DE': ['德国', 'DE', 'Germany', 'germany', '🇩🇪'],
      'FR': ['法国', 'FR', 'France', 'france', '🇫🇷'],

      // 美洲
      'US': ['美国', 'US', 'America', 'america', '🇺🇸'],
      'CA': ['加拿大', 'CA', 'Canada', 'canada', '🇨🇦'],

      // 其他
      'RU': ['俄罗斯', 'RU', 'Russia', 'russia', '🇷🇺'],
      'AU': ['澳洲', 'AU', 'Australia', 'australia', '🇦🇺']
    };
  }

  /**
   * 识别节点的地域
   * @param {Object} proxy - 节点对象
   * @returns {string|null} 地域代码
   */
  detectRegion(proxy) {
    const name = proxy.name || '';

    for (const [region, identifiers] of Object.entries(this.regionMap)) {
      for (const identifier of identifiers) {
        if (name.toLowerCase().includes(identifier.toLowerCase())) {
          return region;
        }
      }
    }

    return null;
  }

  /**
   * 过滤节点
   * @param {Object[]} proxies - 节点数组
   * @param {Object} options - 过滤选项
   * @param {string[]} options.regions - 地域代码数组
   * @param {boolean} options.keep - true保留，false排除
   * @returns {Object[]} 过滤后的节点数组
   */
  filter(proxies, options = {}) {
    const { regions = [], keep = true } = options;

    if (regions.length === 0) {
      return proxies;
    }

    return proxies.filter(proxy => {
      const region = this.detectRegion(proxy);
      const isMatched = region && regions.includes(region);

      return keep ? isMatched : !isMatched;
    });
  }
}

/**
 * 协议类型过滤器
 * 根据代理协议类型进行过滤
 */
export class TypeFilter extends BaseFilter {
  constructor() {
    super('Type Filter');
  }

  /**
   * 过滤节点
   * @param {Object[]} proxies - 节点数组
   * @param {Object} options - 过滤选项
   * @param {string[]} options.types - 协议类型数组
   * @param {boolean} options.keep - true保留，false排除
   * @returns {Object[]} 过滤后的节点数组
   */
  filter(proxies, options = {}) {
    const { types = [], keep = true } = options;

    if (types.length === 0) {
      return proxies;
    }

    return proxies.filter(proxy => {
      const proxyType = (proxy.type || '').toLowerCase();
      const isMatched = types.some(type => type.toLowerCase() === proxyType);

      return keep ? isMatched : !isMatched;
    });
  }
}

/**
 * 正则表达式过滤器
 * 使用正则表达式匹配节点名称，支持Sub-Store风格的高级语法
 */
export class RegexFilter extends BaseFilter {
  constructor() {
    super('Regex Filter');
  }

  /**
   * 构建正则表达式（支持(?i)语法）
   * @param {string} pattern - 正则模式
   * @returns {RegExp} 正则表达式对象
   */
  buildRegex(pattern) {
    // 导入正则工具
    const { buildRegex } = require('./regex.js');
    return buildRegex(pattern);
  }

  /**
   * 过滤节点
   * @param {Object[]} proxies - 节点数组
   * @param {Object} options - 过滤选项
   * @param {string[]} options.patterns - 正则模式数组
   * @param {boolean} options.keep - true保留，false排除
   * @param {string} options.mode - 匹配模式：'any'(任一匹配) 或 'all'(全部匹配)
   * @returns {Object[]} 过滤后的节点数组
   */
  filter(proxies, options = {}) {
    const { patterns = [], keep = true, mode = 'any' } = options;

    if (patterns.length === 0) {
      return proxies;
    }

    const regexList = patterns.map(pattern => this.buildRegex(pattern));

    return proxies.filter(proxy => {
      const name = proxy.name || '';

      let isMatched;
      if (mode === 'all') {
        isMatched = regexList.every(regex => regex.test(name));
      } else {
        isMatched = regexList.some(regex => regex.test(name));
      }

      return keep ? isMatched : !isMatched;
    });
  }
}

/**
 * 条件过滤器
 * 支持复杂的条件逻辑，借鉴Sub-Store的条件过滤器
 */
export class ConditionalFilter extends BaseFilter {
  constructor() {
    super('Conditional Filter');
  }

  /**
   * 过滤节点
   * @param {Object[]} proxies - 节点数组
   * @param {Object} options - 过滤选项
   * @param {Object} options.rule - 条件规则
   * @returns {Object[]} 过滤后的节点数组
   */
  filter(proxies, options = {}) {
    const { rule } = options;

    if (!rule) {
      return proxies;
    }

    return proxies.filter(proxy => this.isMatch(rule, proxy));
  }

  /**
   * 检查节点是否匹配规则
   * @param {Object} rule - 规则对象
   * @param {Object} proxy - 节点对象
   * @returns {boolean} 是否匹配
   */
  isMatch(rule, proxy) {
    // 叶子节点
    if (!rule.operator) {
      switch (rule.proposition) {
        case 'IN':
          return rule.value.indexOf(proxy[rule.attr]) !== -1;
        case 'CONTAINS':
          if (typeof proxy[rule.attr] !== 'string') return false;
          return proxy[rule.attr].indexOf(rule.value) !== -1;
        case 'EQUALS':
          return proxy[rule.attr] === rule.value;
        case 'EXISTS':
          return proxy[rule.attr] !== null && typeof proxy[rule.attr] !== 'undefined';
        case 'REGEX':
          return this.buildRegex(rule.value).test(String(proxy[rule.attr] || ''));
        case 'GT':
          return Number(proxy[rule.attr]) > Number(rule.value);
        case 'LT':
          return Number(proxy[rule.attr]) < Number(rule.value);
        default:
          throw new Error(`Unknown proposition: ${rule.proposition}`);
      }
    }

    // 操作符节点
    switch (rule.operator) {
      case 'AND':
        return rule.child.every(child => this.isMatch(child, proxy));
      case 'OR':
        return rule.child.some(child => this.isMatch(child, proxy));
      case 'NOT':
        return !this.isMatch(rule.child, proxy);
      default:
        throw new Error(`Unknown operator: ${rule.operator}`);
    }
  }

  /**
   * 构建正则表达式
   * @param {string} pattern - 正则模式
   * @returns {RegExp} 正则表达式对象
   */
  buildRegex(pattern) {
    const { buildRegex } = require('./regex.js');
    return buildRegex(pattern);
  }
}

/**
 * 无用节点过滤器
 * 自动过滤掉明显无用的节点
 */
export class UselessFilter extends BaseFilter {
  constructor() {
    super('Useless Filter');

    // 无用关键词
    this.uselessKeywords = [
      '过期', '到期', '流量', '剩余', '官网', '购买', '续费',
      'expire', 'expired', 'traffic', 'remaining', 'website',
      '测试', 'test', '禁止', 'forbidden', '失效', 'invalid'
    ];
  }

  /**
   * 检查是否为无用节点
   * @param {Object} proxy - 节点对象
   * @returns {boolean} 是否为无用节点
   */
  isUseless(proxy) {
    const name = (proxy.name || '').toLowerCase();

    // 检查无用关键词
    if (this.uselessKeywords.some(keyword => name.includes(keyword.toLowerCase()))) {
      return true;
    }

    // 检查端口号是否有效
    const port = proxy.port;
    if (!port || port < 1 || port > 65535) {
      return true;
    }

    // 检查服务器地址是否有效
    const server = proxy.server;
    if (!server || server.trim() === '') {
      return true;
    }

    // 检查必要字段
    if (!proxy.type) {
      return true;
    }

    return false;
  }

  /**
   * 过滤节点
   * @param {Object[]} proxies - 节点数组
   * @returns {Object[]} 过滤后的节点数组
   */
  filter(proxies) {
    return proxies.filter(proxy => !this.isUseless(proxy));
  }
}

/**
 * 过滤器管理器
 * 管理多个过滤器的链式调用
 */
export class FilterManager {
  constructor() {
    this.filters = [];
  }

  /**
   * 添加过滤器
   * @param {BaseFilter} filter - 过滤器实例
   * @param {Object} options - 过滤选项
   * @returns {FilterManager} 返回自身，支持链式调用
   */
  addFilter(filter, options = {}) {
    this.filters.push({ filter, options });
    return this;
  }

  /**
   * 执行所有过滤器
   * @param {Object[]} proxies - 节点数组
   * @returns {Object[]} 过滤后的节点数组
   */
  apply(proxies) {
    let result = proxies;

    for (const { filter, options } of this.filters) {
      const beforeCount = result.length;
      result = filter.filter(result, options);
      const afterCount = result.length;

      console.log(`🔍 ${filter.name}: ${beforeCount} → ${afterCount} (移除 ${beforeCount - afterCount})`);
    }

    return result;
  }

  /**
   * 清空所有过滤器
   */
  clear() {
    this.filters = [];
    return this;
  }
}

// 导出过滤器实例
export const regionFilter = new RegionFilter();
export const typeFilter = new TypeFilter();
export const regexFilter = new RegexFilter();
export const uselessFilter = new UselessFilter();
export const conditionalFilter = new ConditionalFilter();

// 导出过滤器枚举
export const FilterTypes = {
  REGION: 'region',
  TYPE: 'type',
  REGEX: 'regex',
  USELESS: 'useless',
  CONDITIONAL: 'conditional'
};

/**
 * 高级过滤器管理器
 * 支持更复杂的过滤逻辑组合
 */
export class AdvancedFilterManager extends FilterManager {
  constructor() {
    super();
    this.namedFilters = new Map();
  }

  /**
   * 注册命名过滤器
   * @param {string} name - 过滤器名称
   * @param {BaseFilter} filter - 过滤器实例
   * @param {Object} options - 过滤选项
   * @returns {AdvancedFilterManager} 返回自身，支持链式调用
   */
  register(name, filter, options = {}) {
    this.namedFilters.set(name, { filter, options });
    return this;
  }

  /**
   * 使用命名过滤器
   * @param {string} name - 过滤器名称
   * @param {Object} overrideOptions - 覆盖选项
   * @returns {AdvancedFilterManager} 返回自身，支持链式调用
   */
  use(name, overrideOptions = {}) {
    const namedFilter = this.namedFilters.get(name);
    if (!namedFilter) {
      throw new Error(`Named filter '${name}' not found`);
    }

    const { filter, options } = namedFilter;
    const finalOptions = { ...options, ...overrideOptions };

    return this.addFilter(filter, finalOptions);
  }

  /**
   * 添加条件过滤器的便捷方法
   * @param {Object} rule - 条件规则
   * @returns {AdvancedFilterManager} 返回自身，支持链式调用
   */
  addCondition(rule) {
    return this.addFilter(new ConditionalFilter(), { rule });
  }

  /**
   * 添加正则过滤器的便捷方法
   * @param {string[]} patterns - 正则模式数组
   * @param {boolean} keep - 是否保留匹配的节点
   * @param {string} mode - 匹配模式
   * @returns {AdvancedFilterManager} 返回自身，支持链式调用
   */
  addRegex(patterns, keep = true, mode = 'any') {
    return this.addFilter(new RegexFilter(), { patterns, keep, mode });
  }

  /**
   * 添加地域过滤器的便捷方法
   * @param {string[]} regions - 地域代码数组
   * @param {boolean} keep - 是否保留匹配的节点
   * @returns {AdvancedFilterManager} 返回自身，支持链式调用
   */
  addRegion(regions, keep = true) {
    return this.addFilter(new RegionFilter(), { regions, keep });
  }

  /**
   * 添加协议类型过滤器的便捷方法
   * @param {string[]} types - 协议类型数组
   * @param {boolean} keep - 是否保留匹配的节点
   * @returns {AdvancedFilterManager} 返回自身，支持链式调用
   */
  addType(types, keep = true) {
    return this.addFilter(new TypeFilter(), { types, keep });
  }

  /**
   * 获取过滤统计信息
   * @param {Object[]} originalProxies - 原始节点数组
   * @param {Object[]} filteredProxies - 过滤后的节点数组
   * @returns {Object} 统计信息
   */
  getFilterStats(originalProxies, filteredProxies) {
    const removed = originalProxies.length - filteredProxies.length;
    const retainRate = originalProxies.length > 0 ?
      (filteredProxies.length / originalProxies.length * 100).toFixed(2) : '0';

    return {
      original: originalProxies.length,
      filtered: filteredProxies.length,
      removed,
      retainRate: retainRate + '%',
      filtersApplied: this.filters.length,
      namedFiltersRegistered: this.namedFilters.size
    };
  }

  /**
   * 预设过滤器组合
   */
  static presets = {
    /**
     * 基础清理：移除无用节点
     */
    basicCleanup() {
      return new AdvancedFilterManager()
        .addFilter(new UselessFilter());
    },

    /**
     * 地域筛选：只保留指定地域
     */
    regionOnly(regions) {
      return new AdvancedFilterManager()
        .addFilter(new UselessFilter())
        .addRegion(regions, true);
    },

    /**
     * 协议筛选：只保留指定协议
     */
    protocolOnly(types) {
      return new AdvancedFilterManager()
        .addFilter(new UselessFilter())
        .addType(types, true);
    },

    /**
     * 高质量节点：移除试用、过期等节点
     */
    highQuality() {
      return new AdvancedFilterManager()
        .addFilter(new UselessFilter())
        .addRegex(['(?i)(trial|test|expire|过期|试用|测试)'], false);
    },

    /**
     * 自定义组合
     */
    custom() {
      return new AdvancedFilterManager();
    }
  };
}
