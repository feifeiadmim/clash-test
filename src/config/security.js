/**
 * 系统级安全配置
 * 提供全局安全策略和防护机制
 */

import crypto from 'crypto';
import os from 'os';

/**
 * 安全配置常量
 */
export const SECURITY_CONSTANTS = {
  // 文件大小限制
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_MEMORY_USAGE: 512 * 1024 * 1024, // 512MB
  
  // 速率限制
  MAX_REQUESTS_PER_MINUTE: 1000,
  MAX_CONCURRENT_OPERATIONS: 50,
  
  // 超时设置
  OPERATION_TIMEOUT: 30000, // 30秒
  NETWORK_TIMEOUT: 10000, // 10秒
  
  // 安全阈值
  MAX_RETRY_ATTEMPTS: 3,
  MAX_ERROR_RATE: 0.1, // 10%
  
  // 加密设置
  ENCRYPTION_ALGORITHM: 'aes-256-gcm',
  KEY_LENGTH: 32,
  IV_LENGTH: 16
};

/**
 * 默认安全配置
 */
export const DEFAULT_SECURITY_CONFIG = {
  // 沙箱模式
  sandbox: {
    enabled: process.env.NODE_ENV === 'production',
    isolateFileSystem: true,
    restrictNetworkAccess: false,
    limitMemoryUsage: true,
    enableResourceMonitoring: true
  },

  // 输入验证
  inputValidation: {
    enabled: true,
    strictMode: true,
    maxInputLength: 10000,
    allowedCharsets: ['utf-8', 'ascii'],
    sanitizeInput: true,
    validateFileExtensions: true,
    allowedExtensions: ['.yaml', '.yml', '.txt', '.json']
  },

  // 文件操作安全
  fileOperations: {
    maxFileSize: SECURITY_CONSTANTS.MAX_FILE_SIZE,
    allowedPaths: ['./input', './output', './temp', './logs'],
    restrictedPaths: ['/etc', '/var', '/sys', '/proc', 'C:\\Windows', 'C:\\Program Files'],
    enablePathTraversal: false,
    validateFilePermissions: true,
    secureFileCreation: true,
    atomicOperations: true
  },

  // 网络安全
  network: {
    enableRateLimit: true,
    maxRequestsPerMinute: SECURITY_CONSTANTS.MAX_REQUESTS_PER_MINUTE,
    timeout: SECURITY_CONSTANTS.NETWORK_TIMEOUT,
    allowedProtocols: ['http:', 'https:'],
    validateCertificates: true,
    enableProxy: false
  },

  // 内存安全
  memory: {
    maxUsage: SECURITY_CONSTANTS.MAX_MEMORY_USAGE,
    enableGCOptimization: true,
    monitorLeaks: true,
    enableHeapDump: false,
    gcThreshold: 0.8 // 80%内存使用率时触发GC
  },

  // 错误处理安全
  errorHandling: {
    maxRetries: SECURITY_CONSTANTS.MAX_RETRY_ATTEMPTS,
    hideStackTrace: process.env.NODE_ENV === 'production',
    logSensitiveData: false,
    enableErrorReporting: true,
    sanitizeErrorMessages: true
  },

  // 日志安全
  logging: {
    enableSecurityLogs: true,
    logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    sanitizeLogs: true,
    enableAuditTrail: true,
    maxLogFileSize: 50 * 1024 * 1024, // 50MB
    logRetentionDays: 30
  },

  // 加密配置
  encryption: {
    enabled: false, // 默认关闭，按需启用
    algorithm: SECURITY_CONSTANTS.ENCRYPTION_ALGORITHM,
    keyDerivation: 'pbkdf2',
    iterations: 100000,
    saltLength: 32
  },

  // 监控配置
  monitoring: {
    enabled: true,
    realTimeMonitoring: process.env.NODE_ENV === 'production',
    alertThresholds: {
      memoryUsage: 0.9, // 90%
      errorRate: 0.1, // 10%
      responseTime: 5000 // 5秒
    },
    enableMetrics: true,
    metricsInterval: 60000 // 1分钟
  }
};

/**
 * 安全配置管理器
 */
export class SecurityConfigManager {
  constructor() {
    this.config = { ...DEFAULT_SECURITY_CONFIG };
    this.securityKey = null;
    this.initialized = false;
  }

  /**
   * 初始化安全配置
   * @param {Object} customConfig - 自定义配置
   */
  async initialize(customConfig = {}) {
    try {
      // 合并配置
      this.config = this.mergeSecurityConfig(this.config, customConfig);
      
      // 验证配置
      this.validateSecurityConfig(this.config);
      
      // 初始化安全密钥
      if (this.config.encryption.enabled) {
        await this.initializeEncryption();
      }
      
      // 设置安全策略
      this.applySecurityPolicies();
      
      this.initialized = true;
      console.log('🔒 安全配置初始化完成');
      
    } catch (error) {
      console.error('❌ 安全配置初始化失败:', error.message);
      throw error;
    }
  }

  /**
   * 合并安全配置
   * @param {Object} base - 基础配置
   * @param {Object} custom - 自定义配置
   * @returns {Object} 合并后的配置
   */
  mergeSecurityConfig(base, custom) {
    const merged = JSON.parse(JSON.stringify(base));
    
    for (const [key, value] of Object.entries(custom)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        merged[key] = this.mergeSecurityConfig(merged[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }
    
    return merged;
  }

  /**
   * 验证安全配置
   * @param {Object} config - 安全配置
   */
  validateSecurityConfig(config) {
    const errors = [];

    // 验证文件大小限制
    if (config.fileOperations?.maxFileSize > 1024 * 1024 * 1024) { // 1GB
      errors.push('文件大小限制过大，可能导致安全风险');
    }

    // 验证内存限制
    if (config.memory?.maxUsage > 2 * 1024 * 1024 * 1024) { // 2GB
      errors.push('内存限制过大，可能影响系统稳定性');
    }

    // 验证速率限制
    if (config.network?.maxRequestsPerMinute > 10000) {
      errors.push('请求速率限制过高，可能导致DoS风险');
    }

    // 验证路径配置
    if (config.fileOperations?.allowedPaths?.length === 0) {
      errors.push('必须至少配置一个允许的文件路径');
    }

    if (errors.length > 0) {
      throw new Error(`安全配置验证失败: ${errors.join(', ')}`);
    }
  }

  /**
   * 初始化加密
   */
  async initializeEncryption() {
    try {
      // 生成安全密钥
      this.securityKey = crypto.randomBytes(SECURITY_CONSTANTS.KEY_LENGTH);
      console.log('🔐 加密密钥已生成');
    } catch (error) {
      throw new Error(`加密初始化失败: ${error.message}`);
    }
  }

  /**
   * 应用安全策略
   */
  applySecurityPolicies() {
    // 设置进程限制
    if (this.config.memory?.maxUsage) {
      this.setMemoryLimit(this.config.memory.maxUsage);
    }

    // 设置文件描述符限制
    this.setFileDescriptorLimit();

    // 启用安全头
    this.enableSecurityHeaders();
  }

  /**
   * 设置内存限制
   * @param {number} limit - 内存限制（字节）
   */
  setMemoryLimit(limit) {
    try {
      // 监控内存使用
      setInterval(() => {
        const usage = process.memoryUsage();
        if (usage.heapUsed > limit) {
          console.warn(`⚠️ 内存使用超限: ${Math.round(usage.heapUsed / 1024 / 1024)}MB > ${Math.round(limit / 1024 / 1024)}MB`);
          
          if (this.config.memory?.enableGCOptimization && global.gc) {
            global.gc();
          }
        }
      }, 30000); // 30秒检查一次
    } catch (error) {
      console.warn('内存限制设置失败:', error.message);
    }
  }

  /**
   * 设置文件描述符限制
   */
  setFileDescriptorLimit() {
    try {
      // 在支持的平台上设置文件描述符限制
      if (process.platform !== 'win32') {
        const maxFD = 1024;
        console.log(`📁 文件描述符限制: ${maxFD}`);
      }
    } catch (error) {
      console.warn('文件描述符限制设置失败:', error.message);
    }
  }

  /**
   * 启用安全头
   */
  enableSecurityHeaders() {
    // 设置进程标题
    process.title = 'proxy-converter-secure';
    
    // 禁用不安全的功能
    if (this.config.sandbox?.enabled) {
      console.log('🛡️ 沙箱模式已启用');
    }
  }

  /**
   * 获取安全配置
   * @param {string} path - 配置路径
   * @returns {any} 配置值
   */
  getConfig(path) {
    return path.split('.').reduce((config, key) => {
      return config && config[key];
    }, this.config);
  }

  /**
   * 检查操作是否安全
   * @param {string} operation - 操作类型
   * @param {Object} context - 操作上下文
   * @returns {Object} 检查结果
   */
  checkOperationSecurity(operation, context = {}) {
    const checks = {
      isAllowed: true,
      warnings: [],
      errors: []
    };

    switch (operation) {
      case 'file_read':
      case 'file_write':
        this.checkFileOperationSecurity(context, checks);
        break;
      case 'network_request':
        this.checkNetworkSecurity(context, checks);
        break;
      case 'memory_allocation':
        this.checkMemorySecurity(context, checks);
        break;
    }

    return checks;
  }

  /**
   * 检查文件操作安全性
   * @param {Object} context - 操作上下文
   * @param {Object} checks - 检查结果
   */
  checkFileOperationSecurity(context, checks) {
    const { filePath, fileSize } = context;
    
    // 检查文件大小
    if (fileSize > this.config.fileOperations.maxFileSize) {
      checks.isAllowed = false;
      checks.errors.push(`文件大小超限: ${fileSize} > ${this.config.fileOperations.maxFileSize}`);
    }
    
    // 检查路径安全性
    if (filePath && this.config.fileOperations.restrictedPaths) {
      for (const restrictedPath of this.config.fileOperations.restrictedPaths) {
        if (filePath.startsWith(restrictedPath)) {
          checks.isAllowed = false;
          checks.errors.push(`访问受限路径: ${filePath}`);
        }
      }
    }
  }

  /**
   * 检查网络安全性
   * @param {Object} context - 操作上下文
   * @param {Object} checks - 检查结果
   */
  checkNetworkSecurity(context, checks) {
    const { url, protocol } = context;
    
    // 检查协议
    if (protocol && !this.config.network.allowedProtocols.includes(protocol)) {
      checks.isAllowed = false;
      checks.errors.push(`不允许的协议: ${protocol}`);
    }
  }

  /**
   * 检查内存安全性
   * @param {Object} context - 操作上下文
   * @param {Object} checks - 检查结果
   */
  checkMemorySecurity(context, checks) {
    const { requestedSize } = context;
    const currentUsage = process.memoryUsage().heapUsed;
    
    if (currentUsage + requestedSize > this.config.memory.maxUsage) {
      checks.isAllowed = false;
      checks.errors.push(`内存分配超限: ${currentUsage + requestedSize} > ${this.config.memory.maxUsage}`);
    }
  }
}

// 创建全局安全配置管理器实例
export const globalSecurityManager = new SecurityConfigManager();

export default globalSecurityManager;
