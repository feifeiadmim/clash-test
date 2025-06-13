/**
 * 性能监控配置管理器
 * 根据环境和负载动态调整性能参数
 */

import os from 'os';

/**
 * 性能监控级别枚举
 */
export const MonitoringLevel = {
  DEBUG: 'debug',       // 开发调试：最详细的监控
  DEVELOPMENT: 'development', // 开发环境：适中的监控
  PRODUCTION: 'production'    // 生产环境：最小化监控
};

/**
 * 性能配置管理器
 */
export class PerformanceConfigManager {
  constructor() {
    this.currentLevel = MonitoringLevel.PRODUCTION;
    this.systemInfo = this.getSystemInfo();
    this.configs = this.initializeConfigs();
  }

  /**
   * 获取系统信息
   */
  getSystemInfo() {
    return {
      cpuCount: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      platform: os.platform(),
      arch: os.arch()
    };
  }

  /**
   * 初始化不同级别的配置
   */
  initializeConfigs() {
    const baseMemory = Math.min(this.systemInfo.totalMemory * 0.3, 2 * 1024 * 1024 * 1024); // 最多2GB

    return {
      [MonitoringLevel.DEBUG]: {
        enablePerformanceMonitoring: true,
        enableDetailedMetrics: true,
        enableMemoryTracking: true,
        enableCPUTracking: true,
        metricsInterval: 5000,      // 5秒
        memoryCheckInterval: 10000, // 10秒
        batchSize: 1000,
        maxConcurrency: 2,
        memoryThreshold: baseMemory * 0.3,
        gcThreshold: baseMemory * 0.5,
        logLevel: 'debug'
      },
      [MonitoringLevel.DEVELOPMENT]: {
        enablePerformanceMonitoring: true,
        enableDetailedMetrics: true,
        enableMemoryTracking: true,
        enableCPUTracking: false,
        metricsInterval: 15000,     // 15秒
        memoryCheckInterval: 30000, // 30秒
        batchSize: 5000,
        maxConcurrency: Math.min(8, this.systemInfo.cpuCount),
        memoryThreshold: baseMemory * 0.5,
        gcThreshold: baseMemory * 0.7,
        logLevel: 'info'
      },
      [MonitoringLevel.PRODUCTION]: {
        enablePerformanceMonitoring: true,
        enableDetailedMetrics: false,
        enableMemoryTracking: true,
        enableCPUTracking: false,
        metricsInterval: 60000,     // 60秒
        memoryCheckInterval: 120000, // 120秒
        batchSize: 10000,
        maxConcurrency: Math.min(16, this.systemInfo.cpuCount * 2),
        memoryThreshold: baseMemory * 0.6,
        gcThreshold: baseMemory * 0.8,
        logLevel: 'warn'
      }
    };
  }

  /**
   * 设置监控级别
   * @param {string} level - 监控级别
   */
  setMonitoringLevel(level) {
    if (!Object.values(MonitoringLevel).includes(level)) {
      throw new Error(`Invalid monitoring level: ${level}`);
    }
    
    this.currentLevel = level;
    console.log(`🔧 性能监控级别设置为: ${level}`);
  }

  /**
   * 获取当前配置
   * @returns {Object} 当前性能配置
   */
  getCurrentConfig() {
    return {
      ...this.configs[this.currentLevel],
      systemInfo: this.systemInfo
    };
  }

  /**
   * 根据系统负载动态调整配置
   * @returns {Object} 调整后的配置
   */
  getAdaptiveConfig() {
    const baseConfig = this.getCurrentConfig();
    const memoryUsage = (this.systemInfo.totalMemory - this.systemInfo.freeMemory) / this.systemInfo.totalMemory;
    
    // 根据内存使用率调整
    if (memoryUsage > 0.8) {
      // 高内存使用：降低批次大小，减少并发
      return {
        ...baseConfig,
        batchSize: Math.max(1000, Math.floor(baseConfig.batchSize * 0.5)),
        maxConcurrency: Math.max(1, Math.floor(baseConfig.maxConcurrency * 0.5)),
        memoryCheckInterval: Math.max(10000, baseConfig.memoryCheckInterval * 0.5)
      };
    } else if (memoryUsage < 0.3) {
      // 低内存使用：可以适当提升性能
      return {
        ...baseConfig,
        batchSize: Math.min(50000, Math.floor(baseConfig.batchSize * 1.5)),
        maxConcurrency: Math.min(32, Math.floor(baseConfig.maxConcurrency * 1.2))
      };
    }
    
    return baseConfig;
  }

  /**
   * 获取内存优化配置
   * @returns {Object} 内存优化配置
   */
  getMemoryOptimizedConfig() {
    const config = this.getCurrentConfig();
    
    return {
      memoryThreshold: config.memoryThreshold,
      gcThreshold: config.gcThreshold,
      enableAutoGC: true,
      gcInterval: config.memoryCheckInterval * 2,
      cacheMaxSize: Math.floor(config.memoryThreshold / (1024 * 1024)), // MB转换为条目数
      cacheTTL: this.currentLevel === MonitoringLevel.PRODUCTION ? 300000 : 180000
    };
  }

  /**
   * 获取并发优化配置
   * @returns {Object} 并发优化配置
   */
  getConcurrencyConfig() {
    const config = this.getCurrentConfig();
    
    return {
      maxConcurrency: config.maxConcurrency,
      queueSize: config.maxConcurrency * 10,
      timeout: 30000,
      enableWorkerThreads: this.systemInfo.cpuCount >= 4,
      workerPoolSize: Math.min(4, Math.floor(this.systemInfo.cpuCount / 2))
    };
  }

  /**
   * 获取批处理优化配置
   * @returns {Object} 批处理配置
   */
  getBatchConfig() {
    const config = this.getCurrentConfig();
    
    return {
      batchSize: config.batchSize,
      minBatchSize: Math.max(100, Math.floor(config.batchSize * 0.1)),
      maxBatchSize: Math.min(100000, config.batchSize * 5),
      adaptiveBatching: this.currentLevel !== MonitoringLevel.DEBUG,
      memoryBasedAdjustment: true
    };
  }

  /**
   * 生成性能报告
   * @returns {Object} 性能配置报告
   */
  generateReport() {
    const config = this.getCurrentConfig();
    
    return {
      timestamp: new Date().toISOString(),
      monitoringLevel: this.currentLevel,
      systemInfo: this.systemInfo,
      currentConfig: config,
      adaptiveConfig: this.getAdaptiveConfig(),
      memoryConfig: this.getMemoryOptimizedConfig(),
      concurrencyConfig: this.getConcurrencyConfig(),
      batchConfig: this.getBatchConfig(),
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * 生成优化建议
   * @returns {Array} 建议列表
   */
  generateRecommendations() {
    const recommendations = [];
    const memoryUsageRatio = (this.systemInfo.totalMemory - this.systemInfo.freeMemory) / this.systemInfo.totalMemory;

    if (memoryUsageRatio > 0.8) {
      recommendations.push({
        type: 'memory',
        priority: 'high',
        message: '系统内存使用率过高，建议降低批次大小或减少并发数'
      });
    }

    if (this.systemInfo.cpuCount >= 8 && this.currentLevel === MonitoringLevel.PRODUCTION) {
      recommendations.push({
        type: 'concurrency',
        priority: 'medium',
        message: '检测到多核CPU，可以考虑提升并发处理能力'
      });
    }

    if (this.currentLevel === MonitoringLevel.DEBUG) {
      recommendations.push({
        type: 'monitoring',
        priority: 'low',
        message: '当前为调试模式，生产环境建议切换到production级别'
      });
    }

    return recommendations;
  }

  /**
   * 自动优化性能配置
   * @returns {Object} 优化结果
   */
  autoOptimize() {
    const currentConfig = this.getCurrentConfig();
    const optimizations = [];

    // 内存优化
    const memoryOptimization = this.optimizeMemoryUsage();
    if (memoryOptimization.applied) {
      optimizations.push(memoryOptimization);
    }

    // 并发优化
    const concurrencyOptimization = this.optimizeConcurrency();
    if (concurrencyOptimization.applied) {
      optimizations.push(concurrencyOptimization);
    }

    // 批处理优化
    const batchOptimization = this.optimizeBatchProcessing();
    if (batchOptimization.applied) {
      optimizations.push(batchOptimization);
    }

    return {
      timestamp: new Date().toISOString(),
      originalConfig: currentConfig,
      optimizations,
      newConfig: this.getCurrentConfig()
    };
  }

  /**
   * 优化内存使用
   * @returns {Object} 优化结果
   */
  optimizeMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    const heapUsedRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;

    if (heapUsedRatio > 0.8) {
      // 内存使用率过高，降低缓存大小
      const currentConfig = this.configs[this.currentLevel];
      const newBatchSize = Math.max(1000, Math.floor(currentConfig.batchSize * 0.7));
      const newConcurrency = Math.max(1, Math.floor(currentConfig.maxConcurrency * 0.8));

      this.configs[this.currentLevel] = {
        ...currentConfig,
        batchSize: newBatchSize,
        maxConcurrency: newConcurrency
      };

      return {
        applied: true,
        type: 'memory',
        reason: `内存使用率过高 (${(heapUsedRatio * 100).toFixed(1)}%)`,
        changes: {
          batchSize: { from: currentConfig.batchSize, to: newBatchSize },
          maxConcurrency: { from: currentConfig.maxConcurrency, to: newConcurrency }
        }
      };
    }

    return { applied: false };
  }

  /**
   * 优化并发处理
   * @returns {Object} 优化结果
   */
  optimizeConcurrency() {
    const cpuUsage = process.cpuUsage();
    const currentConfig = this.configs[this.currentLevel];

    // 如果CPU核心数较多但并发数较低，可以适当提升
    if (this.systemInfo.cpuCount >= 8 && currentConfig.maxConcurrency < this.systemInfo.cpuCount) {
      const newConcurrency = Math.min(this.systemInfo.cpuCount, currentConfig.maxConcurrency * 1.5);

      this.configs[this.currentLevel] = {
        ...currentConfig,
        maxConcurrency: Math.floor(newConcurrency)
      };

      return {
        applied: true,
        type: 'concurrency',
        reason: `多核CPU可以支持更高并发 (${this.systemInfo.cpuCount}核)`,
        changes: {
          maxConcurrency: { from: currentConfig.maxConcurrency, to: Math.floor(newConcurrency) }
        }
      };
    }

    return { applied: false };
  }

  /**
   * 优化批处理
   * @returns {Object} 优化结果
   */
  optimizeBatchProcessing() {
    const currentConfig = this.configs[this.currentLevel];
    const memoryUsage = process.memoryUsage();
    const availableMemory = this.systemInfo.freeMemory;

    // 如果可用内存充足，可以增加批处理大小
    if (availableMemory > 1024 * 1024 * 1024 && currentConfig.batchSize < 20000) { // 1GB可用内存
      const newBatchSize = Math.min(20000, Math.floor(currentConfig.batchSize * 1.3));

      this.configs[this.currentLevel] = {
        ...currentConfig,
        batchSize: newBatchSize
      };

      return {
        applied: true,
        type: 'batch',
        reason: `可用内存充足 (${Math.round(availableMemory / 1024 / 1024)}MB)`,
        changes: {
          batchSize: { from: currentConfig.batchSize, to: newBatchSize }
        }
      };
    }

    return { applied: false };
  }

  /**
   * 监控性能指标
   * @returns {Object} 性能指标
   */
  getPerformanceMetrics() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      timestamp: new Date().toISOString(),
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        heapUsedRatio: (memoryUsage.heapUsed / memoryUsage.heapTotal * 100).toFixed(2) + '%',
        external: memoryUsage.external,
        rss: memoryUsage.rss
      },
      system: {
        freeMemory: this.systemInfo.freeMemory,
        totalMemory: this.systemInfo.totalMemory,
        memoryUsageRatio: ((this.systemInfo.totalMemory - this.systemInfo.freeMemory) / this.systemInfo.totalMemory * 100).toFixed(2) + '%',
        cpuCount: this.systemInfo.cpuCount,
        platform: this.systemInfo.platform
      },
      config: {
        level: this.currentLevel,
        batchSize: this.configs[this.currentLevel].batchSize,
        maxConcurrency: this.configs[this.currentLevel].maxConcurrency
      }
    };
  }

  /**
   * 重置配置到默认值
   */
  resetToDefaults() {
    this.configs = this.initializeConfigs();
    console.log('🔄 性能配置已重置到默认值');
  }
}

// 创建全局实例
export const globalPerformanceConfig = new PerformanceConfigManager();

// 根据环境变量设置监控级别
const envLevel = process.env.NODE_ENV === 'development' ? 
  MonitoringLevel.DEVELOPMENT : 
  (process.env.NODE_ENV === 'production' ? MonitoringLevel.PRODUCTION : MonitoringLevel.DEBUG);

globalPerformanceConfig.setMonitoringLevel(envLevel);

export default globalPerformanceConfig;
