/**
 * 生产环境配置
 * 针对生产环境的性能和稳定性优化
 */

import { DEFAULT_CONFIG, mergeConfig } from './default.js';

/**
 * 生产环境特定配置
 */
export const PRODUCTION_CONFIG = mergeConfig({
  // 生产环境目录配置
  inputDir: './input',
  outputDir: './output',
  tempDir: './temp',
  logDir: './logs',

  // 生产环境性能配置
  performance: {
    batchSize: 5000,      // 大批次提高效率
    maxConcurrency: 15,   // 高并发充分利用资源
    enableCache: true,    // 启用缓存提高性能
    cacheTimeout: 600000, // 10分钟缓存
    enableOptimization: true, // 启用所有优化
    memoryLimit: 500 * 1024 * 1024 // 500MB限制
  },

  // 生产环境日志配置
  logging: {
    level: 'warn',        // 只记录警告和错误
    showProgress: true,   // 显示进度
    showStats: true,      // 显示统计
    showDetails: false,   // 不显示详细信息
    enableFileLogging: true // 启用文件日志
  },

  // 生产环境错误处理配置
  errorHandling: {
    maxRetries: 3,        // 标准重试次数
    retryDelay: 1000,     // 标准重试延迟
    logErrors: true,      // 记录错误
    throwOnCritical: false, // 不抛出关键错误
    enableDebugMode: false  // 禁用调试模式
  },

  // 生产环境缓存配置
  cache: {
    enabled: true,        // 启用缓存
    maxSize: 2000,        // 大缓存大小
    ttl: 600000,         // 10分钟TTL
    cleanupInterval: 120000 // 2分钟清理
  },

  // 生产环境验证配置
  validation: {
    strictMode: false,    // 非严格模式
    skipInvalidNodes: true, // 跳过无效节点
    validateBeforeOutput: true // 输出前验证
  },

  // 生产环境特定选项
  production: {
    enableCompression: true,    // 启用压缩
    enableMinification: true,   // 启用最小化
    enableGzipOutput: true,     // 启用Gzip输出
    enableCDNOptimization: true, // 启用CDN优化
    enableMetrics: true,        // 启用指标收集
    enableHealthCheck: true,    // 启用健康检查
    maxFileSize: 500 * 1024 * 1024, // 500MB文件大小限制
    enableBackup: true          // 启用备份
  }
}, DEFAULT_CONFIG);

/**
 * 生产环境高性能配置
 */
export const HIGH_PERFORMANCE_CONFIG = mergeConfig({
  performance: {
    batchSize: 10000,     // 超大批次
    maxConcurrency: 20,   // 最高并发
    enableCache: true,
    enableOptimization: true,
    memoryLimit: 1024 * 1024 * 1024 // 1GB限制
  },
  
  cache: {
    maxSize: 5000,        // 超大缓存
    ttl: 1800000,        // 30分钟TTL
  },
  
  production: {
    enableCompression: true,
    enableMinification: true,
    enableCDNOptimization: true
  }
}, PRODUCTION_CONFIG);

/**
 * 生产环境稳定性配置
 */
export const STABILITY_CONFIG = mergeConfig({
  performance: {
    batchSize: 1000,      // 保守批次大小
    maxConcurrency: 5,    // 保守并发数
    enableCache: true,
    enableOptimization: false // 禁用激进优化
  },
  
  errorHandling: {
    maxRetries: 5,        // 更多重试
    retryDelay: 2000,     // 更长延迟
    throwOnCritical: false
  },
  
  validation: {
    strictMode: true,     // 严格验证
    skipInvalidNodes: false
  },
  
  production: {
    enableBackup: true,
    enableHealthCheck: true,
    enableMetrics: true
  }
}, PRODUCTION_CONFIG);

export default PRODUCTION_CONFIG;
