/**
 * 统一配置管理中心
 * 支持动态配置更新、环境切换、配置验证
 */

import { DEFAULT_CONFIG } from './default.js';
import { DEVELOPMENT_CONFIG } from './development.js';
import { globalPerformanceConfig } from './performance-config.js';
import { globalLogger } from '../utils/smart-logger.js';

/**
 * 配置管理器
 */
export class ConfigManager {
  constructor() {
    this.configs = new Map();
    this.currentEnv = process.env.NODE_ENV || 'development';
    this.watchers = new Map(); // 配置变化监听器
    this.validationRules = new Map(); // 配置验证规则
    
    this.initializeConfigs();
    this.setupValidationRules();
  }

  /**
   * 初始化配置
   */
  initializeConfigs() {
    // 注册默认配置
    this.configs.set('default', DEFAULT_CONFIG);
    this.configs.set('development', DEVELOPMENT_CONFIG);
    
    // 生产环境配置
    this.configs.set('production', {
      ...DEFAULT_CONFIG,
      logging: {
        ...DEFAULT_CONFIG.logging,
        level: 'warn',
        enableFileLogging: true,
        showDetails: false
      },
      performance: {
        ...DEFAULT_CONFIG.performance,
        enableDetailedMetrics: false,
        monitoringLevel: 'production'
      },
      cache: {
        ...DEFAULT_CONFIG.cache,
        maxSize: 5000, // 生产环境增大缓存
        adaptiveTTL: true
      }
    });

    // 测试环境配置
    this.configs.set('test', {
      ...DEFAULT_CONFIG,
      logging: {
        ...DEFAULT_CONFIG.logging,
        level: 'error',
        showProgress: false,
        showStats: false
      },
      performance: {
        ...DEFAULT_CONFIG.performance,
        batchSize: 100,
        maxConcurrency: 2,
        enablePerformanceMonitoring: false
      }
    });
  }

  /**
   * 设置验证规则
   */
  setupValidationRules() {
    // 性能配置验证
    this.validationRules.set('performance.maxConcurrency', {
      type: 'number',
      min: 1,
      max: 64,
      message: '并发数必须在1-64之间'
    });

    this.validationRules.set('performance.batchSize', {
      type: 'number',
      min: 100,
      max: 100000,
      message: '批次大小必须在100-100000之间'
    });

    this.validationRules.set('performance.memoryLimit', {
      type: 'number',
      min: 100 * 1024 * 1024, // 100MB
      max: 8 * 1024 * 1024 * 1024, // 8GB
      message: '内存限制必须在100MB-8GB之间'
    });

    // 缓存配置验证
    this.validationRules.set('cache.maxSize', {
      type: 'number',
      min: 100,
      max: 50000,
      message: '缓存大小必须在100-50000之间'
    });

    this.validationRules.set('cache.ttl', {
      type: 'number',
      min: 1000, // 1秒
      max: 24 * 60 * 60 * 1000, // 24小时
      message: 'TTL必须在1秒-24小时之间'
    });

    // 日志配置验证
    this.validationRules.set('logging.level', {
      type: 'string',
      enum: ['debug', 'info', 'warn', 'error'],
      message: '日志级别必须是debug、info、warn或error之一'
    });

    this.validationRules.set('logging.outputDir', {
      type: 'string',
      validator: this.validatePath.bind(this),
      message: '日志输出目录路径不安全'
    });

    // 输出配置验证
    this.validationRules.set('output.outputDir', {
      type: 'string',
      validator: this.validatePath.bind(this),
      message: '输出目录路径不安全'
    });

    // 网络配置验证
    this.validationRules.set('network.timeout', {
      type: 'number',
      min: 1000, // 1秒
      max: 300000, // 5分钟
      message: '网络超时必须在1秒-5分钟之间'
    });

    this.validationRules.set('network.maxRetries', {
      type: 'number',
      min: 0,
      max: 10,
      message: '最大重试次数必须在0-10之间'
    });

    // 安全配置验证
    this.validationRules.set('security.enableSandbox', {
      type: 'boolean',
      message: '沙箱模式必须是布尔值'
    });

    this.validationRules.set('security.maxFileSize', {
      type: 'number',
      min: 1024, // 1KB
      max: 1024 * 1024 * 1024, // 1GB
      message: '最大文件大小必须在1KB-1GB之间'
    });

    this.validationRules.set('security.allowedExtensions', {
      type: 'object',
      validator: this.validateArrayOfStrings.bind(this),
      message: '允许的文件扩展名必须是字符串数组'
    });

    // 错误处理配置验证
    this.validationRules.set('errorHandling.maxRetries', {
      type: 'number',
      min: 0,
      max: 10,
      message: '最大重试次数必须在0-10之间'
    });

    this.validationRules.set('errorHandling.retryDelay', {
      type: 'number',
      min: 100, // 100ms
      max: 60000, // 1分钟
      message: '重试延迟必须在100ms-1分钟之间'
    });

    // 验证配置验证
    this.validationRules.set('validation.strictMode', {
      type: 'boolean',
      message: '严格模式必须是布尔值'
    });

    this.validationRules.set('validation.skipInvalidNodes', {
      type: 'boolean',
      message: '跳过无效节点必须是布尔值'
    });
  }

  /**
   * 验证路径安全性
   * @param {string} path - 路径
   * @returns {boolean} 是否安全
   */
  validatePath(path) {
    if (!path || typeof path !== 'string') {
      return false;
    }

    // 检查危险路径模式
    const dangerousPatterns = [
      /\.\./,           // 父目录遍历
      /[<>:"|?*]/,      // 非法字符
      /[\x00-\x1f]/,    // 控制字符
      /^\/etc/,         // 系统目录
      /^\/var/,         // 系统变量目录
      /^\/tmp/,         // 临时目录
      /^C:\\Windows/i,  // Windows系统目录
      /^C:\\Program/i   // Windows程序目录
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(path)) {
        return false;
      }
    }

    // 检查路径长度
    if (path.length > 260) { // Windows路径长度限制
      return false;
    }

    return true;
  }

  /**
   * 验证配置对象结构
   * @param {Object} config - 配置对象
   * @returns {Object} 验证结果
   */
  validateConfigStructure(config) {
    const errors = [];
    const warnings = [];

    // 检查危险属性
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    for (const key of dangerousKeys) {
      if (key in config) {
        errors.push(`检测到危险属性: ${key}`);
      }
    }

    // 检查配置深度
    const maxDepth = 10;
    const checkDepth = (obj, depth = 0) => {
      if (depth > maxDepth) {
        errors.push(`配置对象嵌套过深 (最大${maxDepth}层)`);
        return;
      }

      if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'object' && value !== null) {
            checkDepth(value, depth + 1);
          }
        }
      }
    };

    checkDepth(config);

    // 检查配置大小
    const configStr = JSON.stringify(config);
    if (configStr.length > 1024 * 1024) { // 1MB限制
      errors.push('配置对象过大 (最大1MB)');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 获取当前配置
   * @returns {Object} 当前环境的配置
   */
  getCurrentConfig() {
    const baseConfig = this.configs.get(this.currentEnv) || this.configs.get('default');
    
    // 合并性能配置
    const performanceConfig = globalPerformanceConfig.getCurrentConfig();
    
    return {
      ...baseConfig,
      performance: {
        ...baseConfig.performance,
        ...performanceConfig
      },
      environment: this.currentEnv,
      timestamp: Date.now()
    };
  }

  /**
   * 获取指定路径的配置值
   * @param {string} path - 配置路径，如 'performance.maxConcurrency'
   * @param {any} defaultValue - 默认值
   * @returns {any} 配置值
   */
  get(path, defaultValue = null) {
    const config = this.getCurrentConfig();
    const keys = path.split('.');
    
    let value = config;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }

  /**
   * 设置配置值
   * @param {string} path - 配置路径
   * @param {any} value - 配置值
   * @param {boolean} validate - 是否验证
   */
  set(path, value, validate = true) {
    if (validate && !this.validateConfigValue(path, value)) {
      throw new Error(`Invalid config value for ${path}: ${value}`);
    }

    const config = this.configs.get(this.currentEnv) || this.configs.get('default');
    const keys = path.split('.');
    const lastKey = keys.pop();
    
    let target = config;
    for (const key of keys) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    
    const oldValue = target[lastKey];
    target[lastKey] = value;
    
    // 通知监听器
    this.notifyWatchers(path, value, oldValue);
    
    globalLogger.info(`配置更新: ${path} = ${JSON.stringify(value)}`);
  }

  /**
   * 验证配置值（加强版，防止绕过）
   * @param {string} path - 配置路径
   * @param {any} value - 配置值
   * @returns {boolean} 是否有效
   */
  validateConfigValue(path, value) {
    try {
      // 首先进行基础安全检查
      if (!this.performBasicSecurityCheck(path, value)) {
        return false;
      }

      const rule = this.validationRules.get(path);
      if (!rule) {
        // 没有验证规则的路径需要额外检查
        return this.validateUnknownConfigPath(path, value);
      }

      // 基本安全检查
      if (value === null || value === undefined) {
        return true; // 允许null/undefined值
      }

      // 类型检查
      if (rule.type && typeof value !== rule.type) {
        globalLogger.warn(`配置验证失败: ${path} 类型错误，期望 ${rule.type}，实际 ${typeof value}`);
        return false;
      }

      // 字符串安全检查
      if (rule.type === 'string') {
        // 长度检查
        if (typeof value === 'string') {
          if (value.length > 1000) { // 字符串长度限制
            globalLogger.warn(`配置验证失败: ${path} 字符串过长 (最大1000字符)`);
            return false;
          }

          // 危险字符检查
          const dangerousPatterns = [
            /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, // 控制字符
            /<script[^>]*>.*?<\/script>/gi,        // 脚本标签
            /javascript:/gi,                       // JavaScript协议
            /vbscript:/gi                          // VBScript协议
          ];

          for (const pattern of dangerousPatterns) {
            if (pattern.test(value)) {
              globalLogger.warn(`配置验证失败: ${path} 包含危险字符`);
              return false;
            }
          }
        }
      }

      // 数值范围检查
      if (rule.type === 'number') {
        if (!Number.isFinite(value)) {
          globalLogger.warn(`配置验证失败: ${path} 不是有效数值`);
          return false;
        }

        if (rule.min !== undefined && value < rule.min) {
          globalLogger.warn(`配置验证失败: ${path} 值过小，最小值 ${rule.min}`);
          return false;
        }
        if (rule.max !== undefined && value > rule.max) {
          globalLogger.warn(`配置验证失败: ${path} 值过大，最大值 ${rule.max}`);
          return false;
        }
      }

      // 枚举检查
      if (rule.enum && !rule.enum.includes(value)) {
        globalLogger.warn(`配置验证失败: ${path} 值不在允许范围内，允许值: ${rule.enum.join(', ')}`);
        return false;
      }

      // 自定义验证器
      if (rule.validator && typeof rule.validator === 'function') {
        if (!rule.validator(value)) {
          globalLogger.warn(`配置验证失败: ${path} ${rule.message || '自定义验证失败'}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      globalLogger.error(`配置验证异常: ${path}`, { error: error.message });
      return false;
    }
  }

  /**
   * 监听配置变化
   * @param {string} path - 配置路径
   * @param {Function} callback - 回调函数
   */
  watch(path, callback) {
    if (!this.watchers.has(path)) {
      this.watchers.set(path, new Set());
    }
    this.watchers.get(path).add(callback);
  }

  /**
   * 取消监听
   * @param {string} path - 配置路径
   * @param {Function} callback - 回调函数
   */
  unwatch(path, callback) {
    const pathWatchers = this.watchers.get(path);
    if (pathWatchers) {
      pathWatchers.delete(callback);
    }
  }

  /**
   * 通知监听器
   * @param {string} path - 配置路径
   * @param {any} newValue - 新值
   * @param {any} oldValue - 旧值
   */
  notifyWatchers(path, newValue, oldValue) {
    const pathWatchers = this.watchers.get(path);
    if (pathWatchers) {
      for (const callback of pathWatchers) {
        try {
          callback(newValue, oldValue, path);
        } catch (error) {
          globalLogger.error(`配置监听器执行失败: ${path}`, { error: error.message });
        }
      }
    }
  }

  /**
   * 切换环境
   * @param {string} env - 环境名称
   */
  switchEnvironment(env) {
    if (!this.configs.has(env)) {
      throw new Error(`Unknown environment: ${env}`);
    }
    
    const oldEnv = this.currentEnv;
    this.currentEnv = env;
    
    globalLogger.info(`环境切换: ${oldEnv} -> ${env}`);
    
    // 通知所有监听器环境变化
    this.notifyWatchers('environment', env, oldEnv);
  }

  /**
   * 重载配置
   */
  reload() {
    this.initializeConfigs();
    globalLogger.info('配置已重载');
  }

  /**
   * 获取配置摘要
   * @returns {Object} 配置摘要
   */
  getSummary() {
    const config = this.getCurrentConfig();
    
    return {
      environment: this.currentEnv,
      performance: {
        batchSize: config.performance.batchSize,
        maxConcurrency: config.performance.maxConcurrency,
        memoryLimit: `${Math.round(config.performance.memoryLimit / 1024 / 1024)}MB`,
        monitoringLevel: config.performance.monitoringLevel
      },
      cache: {
        maxSize: config.cache.maxSize,
        ttl: `${config.cache.ttl / 1000}s`,
        adaptiveTTL: config.cache.adaptiveTTL
      },
      logging: {
        level: config.logging.level,
        fileLogging: config.logging.enableFileLogging
      },
      watchers: this.watchers.size,
      lastUpdate: new Date(config.timestamp).toISOString()
    };
  }

  /**
   * 导出配置
   * @param {boolean} includeSecrets - 是否包含敏感信息
   * @returns {Object} 配置对象
   */
  export(includeSecrets = false) {
    const config = this.getCurrentConfig();
    
    if (!includeSecrets) {
      // 移除敏感信息
      const sanitized = { ...config };
      delete sanitized.secrets;
      delete sanitized.apiKeys;
      return sanitized;
    }
    
    return config;
  }

  /**
   * 从对象导入配置
   * @param {Object} configData - 配置数据
   * @param {boolean} validate - 是否验证
   */
  import(configData, validate = true) {
    try {
      // 基本类型检查
      if (!configData || typeof configData !== 'object') {
        throw new Error('配置数据必须是对象');
      }

      // 结构验证
      const structureValidation = this.validateConfigStructure(configData);
      if (!structureValidation.isValid) {
        throw new Error(`配置结构验证失败: ${structureValidation.errors.join(', ')}`);
      }

      // 安全清理配置数据
      const sanitizedConfig = this.sanitizeConfig(configData);

      if (validate) {
        // 验证所有配置值
        const flattenedConfig = this.flattenConfig(sanitizedConfig);
        for (const [path, value] of Object.entries(flattenedConfig)) {
          if (!this.validateConfigValue(path, value)) {
            throw new Error(`Invalid config value during import: ${path} = ${JSON.stringify(value)}`);
          }
        }
      }

      this.configs.set(this.currentEnv, { ...sanitizedConfig });
      globalLogger.info('配置已导入');
    } catch (error) {
      globalLogger.error('配置导入失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 清理配置对象，移除危险属性
   * @param {Object} config - 原始配置
   * @returns {Object} 清理后的配置
   */
  sanitizeConfig(config) {
    if (!config || typeof config !== 'object') {
      return config;
    }

    if (Array.isArray(config)) {
      return config.map(item => this.sanitizeConfig(item));
    }

    const sanitized = {};
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

    for (const [key, value] of Object.entries(config)) {
      // 跳过危险属性
      if (dangerousKeys.includes(key)) {
        globalLogger.warn(`跳过危险配置属性: ${key}`);
        continue;
      }

      // 验证键名
      if (typeof key !== 'string' || key.length > 100) {
        globalLogger.warn(`跳过不安全的配置键: ${key}`);
        continue;
      }

      // 递归清理值
      sanitized[key] = this.sanitizeConfig(value);
    }

    return sanitized;
  }

  /**
   * 验证字符串数组
   * @param {any} value - 要验证的值
   * @returns {boolean} 是否有效
   */
  validateArrayOfStrings(value) {
    if (!Array.isArray(value)) {
      return false;
    }

    return value.every(item =>
      typeof item === 'string' &&
      item.length > 0 &&
      item.length <= 100
    );
  }

  /**
   * 验证环境配置
   * @param {string} env - 环境名称
   * @returns {Object} 验证结果
   */
  validateEnvironment(env) {
    const validEnvironments = ['development', 'production', 'test', 'staging'];

    if (!validEnvironments.includes(env)) {
      return {
        isValid: false,
        error: `Invalid environment: ${env}. Valid environments: ${validEnvironments.join(', ')}`
      };
    }

    return { isValid: true };
  }

  /**
   * 验证配置完整性
   * @param {Object} config - 配置对象
   * @returns {Object} 验证结果
   */
  validateConfigIntegrity(config) {
    const errors = [];
    const warnings = [];

    // 检查必需的配置项
    const requiredPaths = [
      'performance.maxConcurrency',
      'performance.batchSize',
      'cache.maxSize',
      'logging.level'
    ];

    for (const path of requiredPaths) {
      const value = this.getNestedValue(config, path);
      if (value === undefined || value === null) {
        errors.push(`Missing required configuration: ${path}`);
      }
    }

    // 检查配置项之间的依赖关系
    if (config.performance?.enableCache === false && config.cache?.enabled === true) {
      warnings.push('Cache is enabled but performance.enableCache is false');
    }

    if (config.performance?.maxConcurrency > 32) {
      warnings.push('High concurrency may impact system stability');
    }

    // 检查资源限制
    if (config.performance?.memoryLimit > 2 * 1024 * 1024 * 1024) { // 2GB
      warnings.push('Memory limit is very high, may cause system issues');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 获取嵌套对象的值
   * @param {Object} obj - 对象
   * @param {string} path - 路径（用点分隔）
   * @returns {any} 值
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * 扁平化配置对象
   * @param {Object} obj - 配置对象
   * @param {string} prefix - 前缀
   * @returns {Object} 扁平化的配置
   */
  flattenConfig(obj, prefix = '') {
    const flattened = {};

    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenConfig(value, path));
      } else {
        flattened[path] = value;
      }
    }

    return flattened;
  }

  /**
   * 基础安全检查
   * @param {string} path - 配置路径
   * @param {any} value - 配置值
   * @returns {boolean} 是否通过安全检查
   */
  performBasicSecurityCheck(path, value) {
    // 检查路径安全性
    if (!this.isConfigPathSafe(path)) {
      globalLogger.warn(`不安全的配置路径: ${path}`);
      return false;
    }

    // 检查值的类型安全性
    if (!this.isValueTypeSafe(value)) {
      globalLogger.warn(`不安全的配置值类型: ${path}`);
      return false;
    }

    // 检查原型污染
    if (this.hasPrototypePollution(value)) {
      globalLogger.warn(`检测到原型污染尝试: ${path}`);
      return false;
    }

    return true;
  }

  /**
   * 检查配置路径是否安全
   * @param {string} path - 配置路径
   * @returns {boolean} 是否安全
   */
  isConfigPathSafe(path) {
    if (!path || typeof path !== 'string') {
      return false;
    }

    // 路径长度限制
    if (path.length > 200) {
      return false;
    }

    // 检查危险的路径模式
    const dangerousPathPatterns = [
      /__proto__/,
      /constructor/,
      /prototype/,
      /\.\./,
      /[<>:"'&]/,
      /[\x00-\x1F\x7F-\x9F]/
    ];

    return !dangerousPathPatterns.some(pattern => pattern.test(path));
  }

  /**
   * 检查值类型是否安全
   * @param {any} value - 配置值
   * @returns {boolean} 是否安全
   */
  isValueTypeSafe(value) {
    // 检查函数类型（不允许）
    if (typeof value === 'function') {
      return false;
    }

    // 检查Symbol类型（不允许）
    if (typeof value === 'symbol') {
      return false;
    }

    // 检查对象深度
    if (typeof value === 'object' && value !== null) {
      return this.checkObjectDepth(value, 0, 10);
    }

    return true;
  }

  /**
   * 检查对象深度
   * @param {Object} obj - 对象
   * @param {number} depth - 当前深度
   * @param {number} maxDepth - 最大深度
   * @returns {boolean} 是否安全
   */
  checkObjectDepth(obj, depth, maxDepth) {
    if (depth > maxDepth) {
      return false;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        if (!this.checkObjectDepth(value, depth + 1, maxDepth)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 检查是否存在原型污染
   * @param {any} value - 配置值
   * @returns {boolean} 是否存在原型污染
   */
  hasPrototypePollution(value) {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

    // 递归检查对象的所有属性
    const checkObject = (obj) => {
      for (const key of Object.keys(obj)) {
        if (dangerousKeys.includes(key)) {
          return true;
        }

        if (typeof obj[key] === 'object' && obj[key] !== null) {
          if (checkObject(obj[key])) {
            return true;
          }
        }
      }
      return false;
    };

    return checkObject(value);
  }

  /**
   * 验证未知配置路径
   * @param {string} path - 配置路径
   * @param {any} value - 配置值
   * @returns {boolean} 是否允许
   */
  validateUnknownConfigPath(path, value) {
    // 白名单机制：只允许已知的配置路径前缀
    const allowedPrefixes = [
      'performance.',
      'cache.',
      'logging.',
      'output.',
      'network.',
      'security.',
      'errorHandling.',
      'validation.',
      'custom.'  // 允许自定义配置
    ];

    const isAllowed = allowedPrefixes.some(prefix => path.startsWith(prefix));

    if (!isAllowed) {
      globalLogger.warn(`未知的配置路径: ${path}`);
      return false;
    }

    // 对未知路径进行额外的安全检查
    return this.performStrictValidation(value);
  }

  /**
   * 严格验证配置值
   * @param {any} value - 配置值
   * @returns {boolean} 是否通过验证
   */
  performStrictValidation(value) {
    // 类型白名单
    const allowedTypes = ['string', 'number', 'boolean', 'object'];
    if (!allowedTypes.includes(typeof value)) {
      return false;
    }

    // 字符串验证
    if (typeof value === 'string') {
      if (value.length > 1000) return false;

      // 检查危险字符
      const dangerousPatterns = [
        /<script/i,
        /javascript:/i,
        /vbscript:/i,
        /on\w+\s*=/i,
        /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/
      ];

      return !dangerousPatterns.some(pattern => pattern.test(value));
    }

    // 数值验证
    if (typeof value === 'number') {
      return Number.isFinite(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER;
    }

    // 对象验证
    if (typeof value === 'object' && value !== null) {
      try {
        const jsonStr = JSON.stringify(value);
        return jsonStr.length < 10000; // 限制对象大小
      } catch (error) {
        return false;
      }
    }

    return true;
  }

  /**
   * 验证字符串数组
   * @param {any} value - 值
   * @returns {boolean} 是否有效
   */
  validateArrayOfStrings(value) {
    if (!Array.isArray(value)) {
      return false;
    }

    // 限制数组大小
    if (value.length > 100) {
      return false;
    }

    for (const item of value) {
      if (typeof item !== 'string' || item.length > 100) {
        return false;
      }

      // 检查字符串安全性
      if (!this.performStrictValidation(item)) {
        return false;
      }
    }

    return true;
  }
}

// 创建全局配置管理器实例
export const globalConfigManager = new ConfigManager();

export default globalConfigManager;
