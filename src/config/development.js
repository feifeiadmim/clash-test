/**
 * 开发环境配置
 * 针对开发环境的特定配置优化
 */

import { DEFAULT_CONFIG, mergeConfig } from './default.js';

/**
 * 开发环境特定配置
 */
export const DEVELOPMENT_CONFIG = mergeConfig({
  // 开发环境目录配置
  inputDir: './input',
  outputDir: './output/dev',
  tempDir: './temp/dev',
  logDir: './logs/dev',

  // 开发环境性能配置
  performance: {
    batchSize: 50,        // 较小批次便于调试
    maxConcurrency: 3,    // 较低并发避免资源竞争
    enableCache: false,   // 禁用缓存确保数据新鲜
    cacheTimeout: 60000,  // 1分钟缓存
    enableOptimization: false, // 禁用优化便于调试
    memoryLimit: 100 * 1024 * 1024 // 100MB限制
  },

  // 开发环境日志配置
  logging: {
    level: 'debug',       // 详细日志
    showProgress: true,   // 显示进度
    showStats: true,      // 显示统计
    showDetails: true,    // 显示详细信息
    enableFileLogging: true // 启用文件日志
  },

  // 开发环境错误处理配置
  errorHandling: {
    maxRetries: 1,        // 减少重试次数
    retryDelay: 500,      // 较短重试延迟
    logErrors: true,      // 记录所有错误
    throwOnCritical: true, // 抛出关键错误
    enableDebugMode: true  // 启用调试模式
  },

  // 开发环境缓存配置
  cache: {
    enabled: false,       // 禁用缓存
    maxSize: 100,         // 小缓存大小
    ttl: 60000,          // 1分钟TTL
    cleanupInterval: 30000 // 30秒清理
  },

  // 开发环境验证配置
  validation: {
    strictMode: true,     // 严格模式
    skipInvalidNodes: false, // 不跳过无效节点
    validateBeforeOutput: true // 输出前验证
  },

  // 开发环境特定选项
  development: {
    enableHotReload: true,     // 启用热重载
    enableSourceMaps: true,    // 启用源码映射
    enableProfiling: true,     // 启用性能分析
    enableMemoryTracking: true, // 启用内存跟踪
    enableDetailedErrors: true, // 启用详细错误信息
    enableTestMode: true       // 启用测试模式
  }
}, DEFAULT_CONFIG);

/**
 * 开发环境调试配置
 */
export const DEBUG_CONFIG = mergeConfig({
  logging: {
    level: 'debug',
    showDetails: true,
    enableFileLogging: true
  },

  errorHandling: {
    enableDebugMode: true,
    throwOnCritical: true
  },

  performance: {
    enableCache: false,
    enableOptimization: false
  },

  development: {
    enableProfiling: true,
    enableMemoryTracking: true,
    enableDetailedErrors: true
  }
}, DEVELOPMENT_CONFIG);

/**
 * 开发环境测试配置
 */
export const TEST_CONFIG = mergeConfig({
  inputDir: './input',
  outputDir: './output/test',

  logging: {
    level: 'warn',
    showProgress: false,
    showStats: false
  },

  performance: {
    batchSize: 10,
    maxConcurrency: 1,
    enableCache: false
  },

  validation: {
    strictMode: true,
    skipInvalidNodes: false
  }
}, DEVELOPMENT_CONFIG);

export default DEVELOPMENT_CONFIG;
