/**
 * 系统监控模块
 * 提供统一的性能监控、错误追踪和健康检查功能
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { addProcessListener, removeProcessListener } from '../utils/listener-manager.js';

/**
 * 系统监控器
 */
export class SystemMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enableMetrics: true,
      enableHealthCheck: true,
      enableErrorTracking: true,
      metricsInterval: 30000, // 30秒
      healthCheckInterval: 60000, // 1分钟
      maxErrorHistory: 100,
      ...options
    };

    this.metrics = {
      performance: new Map(),
      memory: [],
      errors: [],
      operations: new Map(),
      health: {
        status: 'healthy',
        lastCheck: Date.now(),
        issues: []
      }
    };

    this.timers = new Map();
    this.isRunning = false;

    this.setupMonitoring();
  }

  /**
   * 设置监控
   */
  setupMonitoring() {
    if (this.options.enableMetrics) {
      this.startMetricsCollection();
    }

    if (this.options.enableHealthCheck) {
      this.startHealthCheck();
    }

    if (this.options.enableErrorTracking) {
      this.setupErrorTracking();
    }
  }

  /**
   * 启动监控
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('📊 系统监控已启动');
    this.emit('monitor:started');
  }

  /**
   * 停止监控
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    // 清理定时器
    for (const [name, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();

    // 清理事件监听器
    this.cleanupEventListeners();

    console.log('📊 系统监控已停止');
    this.emit('monitor:stopped');
  }

  /**
   * 清理事件监听器
   */
  cleanupEventListeners() {
    if (this.errorTrackingSetup) {
      removeProcessListener('uncaughtException', 'system-monitor-exception');
      removeProcessListener('unhandledRejection', 'system-monitor-rejection');
      this.errorTrackingSetup = false;
    }
  }

  /**
   * 开始性能指标收集
   */
  startMetricsCollection() {
    const timer = setInterval(() => {
      this.collectMetrics();
    }, this.options.metricsInterval);

    this.timers.set('metrics', timer);
  }

  /**
   * 收集性能指标
   */
  collectMetrics() {
    if (!this.isRunning) return;

    const timestamp = Date.now();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // 内存指标
    const memoryMetric = {
      timestamp,
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss
    };

    this.metrics.memory.push(memoryMetric);

    // 保持最近100个记录
    if (this.metrics.memory.length > 100) {
      this.metrics.memory.shift();
    }

    // CPU指标
    this.metrics.performance.set('cpu', {
      timestamp,
      user: cpuUsage.user,
      system: cpuUsage.system
    });

    // 发出指标事件
    this.emit('metrics:collected', {
      memory: memoryMetric,
      cpu: cpuUsage
    });
  }

  /**
   * 开始健康检查
   */
  startHealthCheck() {
    const timer = setInterval(() => {
      this.performHealthCheck();
    }, this.options.healthCheckInterval);

    this.timers.set('healthCheck', timer);
  }

  /**
   * 执行健康检查
   */
  performHealthCheck() {
    if (!this.isRunning) return;

    const issues = [];
    const timestamp = Date.now();

    // 检查内存使用
    const memoryUsage = process.memoryUsage();
    const memoryThreshold = 300 * 1024 * 1024; // 300MB（与缓存管理保持合理差距）

    if (memoryUsage.heapUsed > memoryThreshold) {
      issues.push({
        type: 'memory',
        severity: 'warning',
        message: `内存使用过高: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        value: memoryUsage.heapUsed,
        threshold: memoryThreshold
      });
    }

    // 检查错误率
    const recentErrors = this.metrics.errors.filter(
      error => timestamp - error.timestamp < 300000 // 最近5分钟
    );

    if (recentErrors.length > 10) {
      issues.push({
        type: 'error_rate',
        severity: 'critical',
        message: `错误率过高: ${recentErrors.length} 个错误在最近5分钟内`,
        value: recentErrors.length,
        threshold: 10
      });
    }

    // 更新健康状态
    this.metrics.health = {
      status: issues.length === 0 ? 'healthy' :
              issues.some(i => i.severity === 'critical') ? 'critical' : 'warning',
      lastCheck: timestamp,
      issues
    };

    // 发出健康检查事件
    this.emit('health:checked', this.metrics.health);

    if (issues.length > 0) {
      this.emit('health:issues', issues);
    }
  }

  /**
   * 设置错误追踪
   */
  setupErrorTracking() {
    // 避免重复添加监听器
    if (this.errorTrackingSetup) return;

    // 使用统一的监听器管理器
    addProcessListener('uncaughtException', (error) => {
      this.trackError(error, 'uncaughtException');
    }, 'system-monitor-exception');

    addProcessListener('unhandledRejection', (reason, promise) => {
      this.trackError(reason, 'unhandledRejection');
    }, 'system-monitor-rejection');

    this.errorTrackingSetup = true;
  }

  /**
   * 追踪错误
   * @param {Error} error - 错误对象
   * @param {string} source - 错误来源
   * @param {Object} context - 上下文信息
   */
  trackError(error, source = 'unknown', context = {}) {
    const errorRecord = {
      timestamp: Date.now(),
      message: error.message || String(error),
      stack: error.stack,
      source,
      context,
      severity: this.determineErrorSeverity(error, source)
    };

    this.metrics.errors.push(errorRecord);

    // 保持最近的错误记录
    if (this.metrics.errors.length > this.options.maxErrorHistory) {
      this.metrics.errors.shift();
    }

    // 发出错误事件
    this.emit('error:tracked', errorRecord);

    console.error(`🚨 错误追踪 [${source}]:`, error.message);
  }

  /**
   * 确定错误严重程度
   * @param {Error} error - 错误对象
   * @param {string} source - 错误来源
   * @returns {string} 严重程度
   */
  determineErrorSeverity(error, source) {
    if (source === 'uncaughtException') return 'critical';
    if (source === 'unhandledRejection') return 'high';
    if (error.name === 'TypeError' || error.name === 'ReferenceError') return 'high';
    return 'medium';
  }

  /**
   * 记录操作指标
   * @param {string} operation - 操作名称
   * @param {number} duration - 持续时间
   * @param {boolean} success - 是否成功
   * @param {Object} metadata - 元数据
   */
  recordOperation(operation, duration, success = true, metadata = {}) {
    if (!this.metrics.operations.has(operation)) {
      this.metrics.operations.set(operation, {
        count: 0,
        totalDuration: 0,
        successCount: 0,
        failureCount: 0,
        avgDuration: 0,
        lastExecution: null
      });
    }

    const stats = this.metrics.operations.get(operation);
    stats.count++;
    stats.totalDuration += duration;
    stats.lastExecution = Date.now();

    if (success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
    }

    stats.avgDuration = stats.totalDuration / stats.count;

    // 发出操作事件
    this.emit('operation:recorded', {
      operation,
      duration,
      success,
      metadata,
      stats
    });
  }

  /**
   * 创建操作计时器
   * @param {string} operation - 操作名称
   * @returns {Function} 结束计时器的函数
   */
  startOperation(operation) {
    const startTime = performance.now();

    return (success = true, metadata = {}) => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      this.recordOperation(operation, duration, success, metadata);
      return duration;
    };
  }

  /**
   * 获取监控报告
   * @returns {Object} 监控报告
   */
  getReport() {
    const now = Date.now();
    const recentMemory = this.metrics.memory.slice(-10); // 最近10个记录
    const recentErrors = this.metrics.errors.filter(
      error => now - error.timestamp < 3600000 // 最近1小时
    );

    return {
      timestamp: now,
      health: this.metrics.health,
      memory: {
        current: recentMemory[recentMemory.length - 1],
        trend: this.calculateMemoryTrend(recentMemory),
        history: recentMemory
      },
      errors: {
        recent: recentErrors,
        total: this.metrics.errors.length,
        bySource: this.groupErrorsBySource(recentErrors)
      },
      operations: Object.fromEntries(this.metrics.operations),
      uptime: process.uptime()
    };
  }

  /**
   * 计算内存趋势
   * @param {Array} memoryHistory - 内存历史记录
   * @returns {string} 趋势描述
   */
  calculateMemoryTrend(memoryHistory) {
    if (memoryHistory.length < 2) return 'stable';

    const recent = memoryHistory.slice(-5);
    const older = memoryHistory.slice(-10, -5);

    if (recent.length === 0 || older.length === 0) return 'stable';

    const recentAvg = recent.reduce((sum, m) => sum + m.heapUsed, 0) / recent.length;
    const olderAvg = older.reduce((sum, m) => sum + m.heapUsed, 0) / older.length;

    const change = (recentAvg - olderAvg) / olderAvg;

    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  /**
   * 按来源分组错误
   * @param {Array} errors - 错误列表
   * @returns {Object} 分组后的错误
   */
  groupErrorsBySource(errors) {
    const grouped = {};

    for (const error of errors) {
      if (!grouped[error.source]) {
        grouped[error.source] = [];
      }
      grouped[error.source].push(error);
    }

    return grouped;
  }

  /**
   * 重置指标
   */
  resetMetrics() {
    this.metrics.memory = [];
    this.metrics.errors = [];
    this.metrics.operations.clear();
    this.metrics.performance.clear();

    console.log('📊 监控指标已重置');
    this.emit('metrics:reset');
  }
}

/**
 * 日志管理器
 */
export class LogManager {
  constructor(options = {}) {
    this.options = {
      level: 'info',
      enableConsole: true,
      enableFile: false,
      maxLogSize: 10 * 1024 * 1024, // 10MB
      maxLogFiles: 5,
      ...options
    };

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };

    this.currentLevel = this.levels[this.options.level] || 2;
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} meta - 元数据
   */
  log(level, message, meta = {}) {
    const levelNum = this.levels[level];
    if (levelNum === undefined || levelNum > this.currentLevel) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      meta,
      pid: process.pid
    };

    if (this.options.enableConsole) {
      this.logToConsole(logEntry);
    }

    if (this.options.enableFile) {
      this.logToFile(logEntry);
    }
  }

  /**
   * 输出到控制台
   * @param {Object} logEntry - 日志条目
   */
  logToConsole(logEntry) {
    const { timestamp, level, message, meta } = logEntry;
    const timeStr = new Date(timestamp).toLocaleTimeString();

    let colorCode = '';
    switch (level) {
      case 'ERROR': colorCode = '\x1b[31m'; break; // 红色
      case 'WARN': colorCode = '\x1b[33m'; break;  // 黄色
      case 'INFO': colorCode = '\x1b[36m'; break;  // 青色
      case 'DEBUG': colorCode = '\x1b[35m'; break; // 紫色
      case 'TRACE': colorCode = '\x1b[37m'; break; // 白色
    }

    const resetCode = '\x1b[0m';
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';

    console.log(`${colorCode}[${timeStr}] ${level}${resetCode}: ${message}${metaStr}`);
  }

  /**
   * 便捷方法
   */
  error(message, meta) { this.log('error', message, meta); }
  warn(message, meta) { this.log('warn', message, meta); }
  info(message, meta) { this.log('info', message, meta); }
  debug(message, meta) { this.log('debug', message, meta); }
  trace(message, meta) { this.log('trace', message, meta); }
}

// 创建全局实例
export const globalSystemMonitor = new SystemMonitor();
export const globalLogger = new LogManager();

// 导出便捷方法
export const startMonitoring = () => globalSystemMonitor.start();
export const stopMonitoring = () => globalSystemMonitor.stop();
export const trackError = (error, source, context) =>
  globalSystemMonitor.trackError(error, source, context);
export const recordOperation = (operation, duration, success, metadata) =>
  globalSystemMonitor.recordOperation(operation, duration, success, metadata);
export const startOperation = (operation) => globalSystemMonitor.startOperation(operation);
export const getMonitoringReport = () => globalSystemMonitor.getReport();

// 日志便捷方法
export const log = {
  error: (message, meta) => globalLogger.error(message, meta),
  warn: (message, meta) => globalLogger.warn(message, meta),
  info: (message, meta) => globalLogger.info(message, meta),
  debug: (message, meta) => globalLogger.debug(message, meta),
  trace: (message, meta) => globalLogger.trace(message, meta)
};
