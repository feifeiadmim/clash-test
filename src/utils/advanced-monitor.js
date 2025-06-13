/**
 * 高级监控系统
 * 提供全面的系统监控、性能分析和告警功能
 */

import { EventEmitter } from 'events';
import { globalResourceManager, ResourceType } from './resource-manager.js';
import { globalPerformanceConfig } from '../config/performance-config.js';

/**
 * 监控事件类型
 */
export const MonitorEvent = {
  PERFORMANCE_ALERT: 'performance_alert',
  MEMORY_WARNING: 'memory_warning',
  ERROR_THRESHOLD: 'error_threshold',
  RESOURCE_LIMIT: 'resource_limit',
  HEALTH_CHECK: 'health_check'
};

/**
 * 告警级别
 */
export const AlertLevel = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * 高级监控系统类
 */
export class AdvancedMonitor extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.metrics = new Map();
    this.alerts = [];
    this.thresholds = {
      memoryUsage: 80,        // 内存使用率阈值 (%)
      cpuUsage: 85,           // CPU使用率阈值 (%)
      errorRate: 5,           // 错误率阈值 (%)
      responseTime: 5000,     // 响应时间阈值 (ms)
      resourceCount: 1000     // 资源数量阈值
    };
    this.intervals = new Map();
    this.healthChecks = new Map();
    this.performanceHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * 启动监控系统
   * @param {Object} options - 监控选项
   */
  start(options = {}) {
    if (this.isRunning) {
      console.warn('⚠️ 监控系统已在运行');
      return;
    }

    const {
      metricsInterval = 30000,      // 30秒
      healthCheckInterval = 60000,  // 60秒
      alertCheckInterval = 15000,   // 15秒
      enablePerformanceTracking = true,
      enableResourceMonitoring = true,
      enableHealthChecks = true
    } = options;

    this.isRunning = true;
    console.log('🔍 启动高级监控系统...');

    // 启动性能监控
    if (enablePerformanceTracking) {
      this.startPerformanceMonitoring(metricsInterval);
    }

    // 启动资源监控
    if (enableResourceMonitoring) {
      this.startResourceMonitoring(metricsInterval);
    }

    // 启动健康检查
    if (enableHealthChecks) {
      this.startHealthChecks(healthCheckInterval);
    }

    // 启动告警检查
    this.startAlertChecking(alertCheckInterval);

    // 注册资源清理
    globalResourceManager.register(
      ResourceType.TIMER,
      'advanced-monitor',
      this,
      () => this.stop()
    );

    console.log('✅ 高级监控系统启动完成');
  }

  /**
   * 停止监控系统
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 停止高级监控系统...');
    this.isRunning = false;

    // 清理所有定时器
    for (const [name, intervalId] of this.intervals.entries()) {
      clearInterval(intervalId);
      console.log(`🧹 清理定时器: ${name}`);
    }
    this.intervals.clear();

    // 清理健康检查
    this.healthChecks.clear();

    console.log('✅ 高级监控系统已停止');
  }

  /**
   * 启动性能监控
   * @param {number} interval - 监控间隔
   */
  startPerformanceMonitoring(interval) {
    const performanceTimer = setInterval(() => {
      if (!this.isRunning) return;

      try {
        const metrics = this.collectPerformanceMetrics();
        this.updateMetrics('performance', metrics);
        this.checkPerformanceThresholds(metrics);
        this.addToHistory(metrics);
      } catch (error) {
        console.error('❌ 性能监控错误:', error);
      }
    }, interval);

    this.intervals.set('performance', performanceTimer);
    console.log(`📊 性能监控已启动 (间隔: ${interval}ms)`);
  }

  /**
   * 启动资源监控
   * @param {number} interval - 监控间隔
   */
  startResourceMonitoring(interval) {
    const resourceTimer = setInterval(() => {
      if (!this.isRunning) return;

      try {
        const metrics = this.collectResourceMetrics();
        this.updateMetrics('resources', metrics);
        this.checkResourceThresholds(metrics);
      } catch (error) {
        console.error('❌ 资源监控错误:', error);
      }
    }, interval);

    this.intervals.set('resources', resourceTimer);
    console.log(`🔧 资源监控已启动 (间隔: ${interval}ms)`);
  }

  /**
   * 启动健康检查
   * @param {number} interval - 检查间隔
   */
  startHealthChecks(interval) {
    const healthTimer = setInterval(() => {
      if (!this.isRunning) return;

      try {
        this.performHealthChecks();
      } catch (error) {
        console.error('❌ 健康检查错误:', error);
      }
    }, interval);

    this.intervals.set('health', healthTimer);
    console.log(`🏥 健康检查已启动 (间隔: ${interval}ms)`);
  }

  /**
   * 启动告警检查
   * @param {number} interval - 检查间隔
   */
  startAlertChecking(interval) {
    const alertTimer = setInterval(() => {
      if (!this.isRunning) return;

      try {
        this.processAlerts();
      } catch (error) {
        console.error('❌ 告警检查错误:', error);
      }
    }, interval);

    this.intervals.set('alerts', alertTimer);
    console.log(`🚨 告警检查已启动 (间隔: ${interval}ms)`);
  }

  /**
   * 收集性能指标
   * @returns {Object} 性能指标
   */
  collectPerformanceMetrics() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();

    return {
      timestamp: Date.now(),
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsagePercent: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
        external: memoryUsage.external,
        rss: memoryUsage.rss
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        userMS: Math.round(cpuUsage.user / 1000),
        systemMS: Math.round(cpuUsage.system / 1000)
      },
      process: {
        uptime: Math.round(uptime),
        uptimeFormatted: this.formatUptime(uptime),
        pid: process.pid,
        version: process.version,
        platform: process.platform
      }
    };
  }

  /**
   * 收集资源指标
   * @returns {Object} 资源指标
   */
  collectResourceMetrics() {
    const resourceStats = globalResourceManager.getStats();
    const performanceConfig = globalPerformanceConfig.getCurrentConfig();

    return {
      timestamp: Date.now(),
      resources: {
        total: resourceStats.totalResources,
        byType: resourceStats.byType,
        oldResources: resourceStats.oldResources.length
      },
      performance: {
        batchSize: performanceConfig.batchSize,
        maxConcurrency: performanceConfig.maxConcurrency,
        memoryThreshold: performanceConfig.memoryThreshold,
        gcThreshold: performanceConfig.gcThreshold
      }
    };
  }

  /**
   * 执行健康检查
   */
  performHealthChecks() {
    const healthStatus = {
      timestamp: Date.now(),
      overall: 'healthy',
      checks: {}
    };

    // 内存健康检查
    const memoryMetrics = this.getLatestMetrics('performance')?.memory;
    if (memoryMetrics) {
      healthStatus.checks.memory = {
        status: memoryMetrics.heapUsagePercent < this.thresholds.memoryUsage ? 'healthy' : 'warning',
        value: memoryMetrics.heapUsagePercent,
        threshold: this.thresholds.memoryUsage,
        message: `内存使用率: ${memoryMetrics.heapUsagePercent}%`
      };
    }

    // 资源健康检查
    const resourceMetrics = this.getLatestMetrics('resources')?.resources;
    if (resourceMetrics) {
      healthStatus.checks.resources = {
        status: resourceMetrics.total < this.thresholds.resourceCount ? 'healthy' : 'warning',
        value: resourceMetrics.total,
        threshold: this.thresholds.resourceCount,
        message: `资源总数: ${resourceMetrics.total}`
      };
    }

    // 进程健康检查
    const processMetrics = this.getLatestMetrics('performance')?.process;
    if (processMetrics) {
      healthStatus.checks.process = {
        status: 'healthy',
        uptime: processMetrics.uptime,
        message: `运行时间: ${processMetrics.uptimeFormatted}`
      };
    }

    // 计算整体健康状态
    const checkStatuses = Object.values(healthStatus.checks).map(check => check.status);
    if (checkStatuses.includes('critical')) {
      healthStatus.overall = 'critical';
    } else if (checkStatuses.includes('warning')) {
      healthStatus.overall = 'warning';
    }

    this.updateMetrics('health', healthStatus);
    this.emit(MonitorEvent.HEALTH_CHECK, healthStatus);
  }

  /**
   * 检查性能阈值
   * @param {Object} metrics - 性能指标
   */
  checkPerformanceThresholds(metrics) {
    // 内存使用率检查
    if (metrics.memory.heapUsagePercent > this.thresholds.memoryUsage) {
      this.createAlert(AlertLevel.WARNING, 'memory_usage', 
        `内存使用率过高: ${metrics.memory.heapUsagePercent}%`, metrics);
    }

    // 内存泄漏检查
    if (this.performanceHistory.length > 10) {
      const recentMemory = this.performanceHistory.slice(-10).map(h => h.memory.heapUsed);
      const memoryTrend = this.calculateTrend(recentMemory);
      
      if (memoryTrend > 0.1) { // 10%增长趋势
        this.createAlert(AlertLevel.WARNING, 'memory_leak', 
          '检测到可能的内存泄漏', { trend: memoryTrend, recentMemory });
      }
    }
  }

  /**
   * 检查资源阈值
   * @param {Object} metrics - 资源指标
   */
  checkResourceThresholds(metrics) {
    if (metrics.resources.total > this.thresholds.resourceCount) {
      this.createAlert(AlertLevel.WARNING, 'resource_limit',
        `资源数量过多: ${metrics.resources.total}`, metrics);
    }

    if (metrics.resources.oldResources > 50) {
      this.createAlert(AlertLevel.INFO, 'old_resources',
        `发现大量长时间未使用的资源: ${metrics.resources.oldResources}`, metrics);
    }
  }

  /**
   * 创建告警
   * @param {string} level - 告警级别
   * @param {string} type - 告警类型
   * @param {string} message - 告警消息
   * @param {Object} data - 相关数据
   */
  createAlert(level, type, message, data = null) {
    const alert = {
      id: this.generateAlertId(),
      timestamp: Date.now(),
      level,
      type,
      message,
      data,
      acknowledged: false
    };

    this.alerts.push(alert);
    
    // 限制告警数量
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-500);
    }

    console.log(`🚨 [${level.toUpperCase()}] ${message}`);
    this.emit(MonitorEvent.PERFORMANCE_ALERT, alert);
  }

  /**
   * 处理告警
   */
  processAlerts() {
    const unacknowledgedAlerts = this.alerts.filter(alert => !alert.acknowledged);
    
    if (unacknowledgedAlerts.length > 0) {
      // 按级别分组
      const alertsByLevel = {};
      for (const alert of unacknowledgedAlerts) {
        if (!alertsByLevel[alert.level]) {
          alertsByLevel[alert.level] = [];
        }
        alertsByLevel[alert.level].push(alert);
      }

      // 处理关键告警
      if (alertsByLevel[AlertLevel.CRITICAL]) {
        console.log(`🔴 关键告警: ${alertsByLevel[AlertLevel.CRITICAL].length} 个`);
      }

      // 处理错误告警
      if (alertsByLevel[AlertLevel.ERROR]) {
        console.log(`🟠 错误告警: ${alertsByLevel[AlertLevel.ERROR].length} 个`);
      }
    }
  }

  /**
   * 更新指标
   * @param {string} category - 指标类别
   * @param {Object} data - 指标数据
   */
  updateMetrics(category, data) {
    this.metrics.set(category, data);
  }

  /**
   * 获取最新指标
   * @param {string} category - 指标类别
   * @returns {Object} 指标数据
   */
  getLatestMetrics(category) {
    return this.metrics.get(category);
  }

  /**
   * 获取所有指标
   * @returns {Object} 所有指标
   */
  getAllMetrics() {
    const result = {};
    for (const [category, data] of this.metrics.entries()) {
      result[category] = data;
    }
    return result;
  }

  /**
   * 添加到历史记录
   * @param {Object} metrics - 指标数据
   */
  addToHistory(metrics) {
    this.performanceHistory.push(metrics);
    
    // 限制历史记录大小
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory = this.performanceHistory.slice(-this.maxHistorySize / 2);
    }
  }

  /**
   * 计算趋势
   * @param {Array} values - 数值数组
   * @returns {number} 趋势值
   */
  calculateTrend(values) {
    if (values.length < 2) return 0;
    
    const first = values[0];
    const last = values[values.length - 1];
    
    return (last - first) / first;
  }

  /**
   * 格式化运行时间
   * @param {number} seconds - 秒数
   * @returns {string} 格式化的时间
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) {
      return `${days}天 ${hours}小时 ${minutes}分钟`;
    } else if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`;
    } else if (minutes > 0) {
      return `${minutes}分钟 ${secs}秒`;
    } else {
      return `${secs}秒`;
    }
  }

  /**
   * 生成告警ID
   * @returns {string} 告警ID
   */
  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 设置阈值
   * @param {Object} thresholds - 阈值配置
   */
  setThresholds(thresholds) {
    this.thresholds = { ...this.thresholds, ...thresholds };
    console.log('🔧 监控阈值已更新:', this.thresholds);
  }

  /**
   * 获取监控报告
   * @returns {Object} 监控报告
   */
  getMonitoringReport() {
    return {
      timestamp: new Date().toISOString(),
      isRunning: this.isRunning,
      metrics: this.getAllMetrics(),
      alerts: {
        total: this.alerts.length,
        unacknowledged: this.alerts.filter(a => !a.acknowledged).length,
        byLevel: this.getAlertsByLevel()
      },
      thresholds: this.thresholds,
      historySize: this.performanceHistory.length
    };
  }

  /**
   * 按级别获取告警统计
   * @returns {Object} 告警统计
   */
  getAlertsByLevel() {
    const stats = {};
    for (const alert of this.alerts) {
      stats[alert.level] = (stats[alert.level] || 0) + 1;
    }
    return stats;
  }
}

// 创建全局监控实例
export const globalAdvancedMonitor = new AdvancedMonitor();

export default globalAdvancedMonitor;
