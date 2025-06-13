/**
 * 安全监控系统
 * 实时监控系统安全状态，检测异常行为
 */

import EventEmitter from 'events';
import { globalSecurityManager } from '../config/security.js';

/**
 * 安全事件类型
 */
export const SECURITY_EVENTS = {
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  RESOURCE_ABUSE: 'resource_abuse',
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  MEMORY_THRESHOLD_EXCEEDED: 'memory_threshold_exceeded',
  FILE_OPERATION_BLOCKED: 'file_operation_blocked',
  NETWORK_ANOMALY: 'network_anomaly'
};

/**
 * 安全监控器
 */
export class SecurityMonitor extends EventEmitter {
  constructor() {
    super();
    this.isMonitoring = false;
    this.metrics = {
      totalRequests: 0,
      blockedRequests: 0,
      errorCount: 0,
      memoryPeakUsage: 0,
      lastResetTime: Date.now()
    };
    this.rateLimiters = new Map();
    this.suspiciousActivities = [];
    this.monitoringInterval = null;
  }

  /**
   * 启动安全监控
   */
  start() {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    console.log('🔍 安全监控系统启动');

    // 启动实时监控
    this.startRealTimeMonitoring();

    // 启动定期检查
    this.startPeriodicChecks();

    // 监听进程事件
    this.setupProcessEventListeners();
  }

  /**
   * 停止安全监控
   */
  stop() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('🔍 安全监控系统停止');
  }

  /**
   * 启动实时监控
   */
  startRealTimeMonitoring() {
    // 监控内存使用
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
      this.checkSystemHealth();
      this.cleanupOldData();
    }, 30000); // 30秒检查一次
  }

  /**
   * 启动定期检查
   */
  startPeriodicChecks() {
    // 每分钟重置速率限制器
    setInterval(() => {
      this.resetRateLimiters();
    }, 60000);

    // 每小时生成安全报告
    setInterval(() => {
      this.generateSecurityReport();
    }, 3600000);
  }

  /**
   * 设置进程事件监听器
   */
  setupProcessEventListeners() {
    // 监听未捕获异常
    process.on('uncaughtException', (error) => {
      this.recordSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, {
        type: 'uncaught_exception',
        error: error.message,
        stack: error.stack
      });
    });

    // 监听未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      this.recordSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, {
        type: 'unhandled_rejection',
        reason: reason?.toString(),
        promise: promise?.toString()
      });
    });

    // 监听警告
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning') {
        this.recordSecurityEvent(SECURITY_EVENTS.RESOURCE_ABUSE, {
          type: 'max_listeners_exceeded',
          warning: warning.message
        });
      }
    });
  }

  /**
   * 检查内存使用
   */
  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const maxUsage = globalSecurityManager.getConfig('memory.maxUsage');
    
    // 更新峰值使用量
    if (usage.heapUsed > this.metrics.memoryPeakUsage) {
      this.metrics.memoryPeakUsage = usage.heapUsed;
    }

    // 检查内存阈值
    if (usage.heapUsed > maxUsage * 0.9) { // 90%阈值
      this.recordSecurityEvent(SECURITY_EVENTS.MEMORY_THRESHOLD_EXCEEDED, {
        currentUsage: usage.heapUsed,
        maxUsage: maxUsage,
        percentage: (usage.heapUsed / maxUsage * 100).toFixed(2)
      });
    }
  }

  /**
   * 检查系统健康状态
   */
  checkSystemHealth() {
    const now = Date.now();
    const timeSinceReset = now - this.metrics.lastResetTime;
    
    // 检查错误率
    if (timeSinceReset > 60000) { // 1分钟后开始检查
      const errorRate = this.metrics.errorCount / this.metrics.totalRequests;
      const threshold = globalSecurityManager.getConfig('monitoring.alertThresholds.errorRate') || 0.1;
      
      if (errorRate > threshold) {
        this.recordSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, {
          type: 'high_error_rate',
          errorRate: errorRate.toFixed(3),
          threshold: threshold,
          totalRequests: this.metrics.totalRequests,
          errorCount: this.metrics.errorCount
        });
      }
    }
  }

  /**
   * 清理旧数据
   */
  cleanupOldData() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24小时

    // 清理旧的可疑活动记录
    this.suspiciousActivities = this.suspiciousActivities.filter(
      activity => now - activity.timestamp < maxAge
    );
  }

  /**
   * 重置速率限制器
   */
  resetRateLimiters() {
    for (const [key, limiter] of this.rateLimiters.entries()) {
      limiter.requests = 0;
      limiter.lastReset = Date.now();
    }
  }

  /**
   * 检查速率限制
   * @param {string} identifier - 标识符（IP、用户ID等）
   * @param {number} limit - 限制数量
   * @returns {boolean} 是否允许请求
   */
  checkRateLimit(identifier, limit = null) {
    const maxRequests = limit || globalSecurityManager.getConfig('network.maxRequestsPerMinute') || 1000;
    
    if (!this.rateLimiters.has(identifier)) {
      this.rateLimiters.set(identifier, {
        requests: 0,
        lastReset: Date.now()
      });
    }

    const limiter = this.rateLimiters.get(identifier);
    limiter.requests++;

    if (limiter.requests > maxRequests) {
      this.recordSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
        identifier: identifier,
        requests: limiter.requests,
        limit: maxRequests
      });
      return false;
    }

    return true;
  }

  /**
   * 记录安全事件
   * @param {string} eventType - 事件类型
   * @param {Object} details - 事件详情
   */
  recordSecurityEvent(eventType, details) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      details: details,
      severity: this.getEventSeverity(eventType)
    };

    // 添加到可疑活动列表
    this.suspiciousActivities.push(event);

    // 发出事件
    this.emit('securityEvent', event);

    // 记录日志
    const logLevel = event.severity === 'critical' ? 'error' : 'warn';
    console[logLevel](`🚨 安全事件 [${eventType}]:`, details);

    // 检查是否需要自动响应
    this.checkAutoResponse(event);
  }

  /**
   * 获取事件严重程度
   * @param {string} eventType - 事件类型
   * @returns {string} 严重程度
   */
  getEventSeverity(eventType) {
    const severityMap = {
      [SECURITY_EVENTS.UNAUTHORIZED_ACCESS]: 'critical',
      [SECURITY_EVENTS.RESOURCE_ABUSE]: 'high',
      [SECURITY_EVENTS.RATE_LIMIT_EXCEEDED]: 'medium',
      [SECURITY_EVENTS.MEMORY_THRESHOLD_EXCEEDED]: 'high',
      [SECURITY_EVENTS.FILE_OPERATION_BLOCKED]: 'medium',
      [SECURITY_EVENTS.NETWORK_ANOMALY]: 'medium',
      [SECURITY_EVENTS.SUSPICIOUS_ACTIVITY]: 'high'
    };

    return severityMap[eventType] || 'low';
  }

  /**
   * 检查自动响应
   * @param {Object} event - 安全事件
   */
  checkAutoResponse(event) {
    switch (event.type) {
      case SECURITY_EVENTS.MEMORY_THRESHOLD_EXCEEDED:
        // 触发垃圾回收
        if (global.gc) {
          global.gc();
          console.log('🧹 自动触发垃圾回收');
        }
        break;

      case SECURITY_EVENTS.RATE_LIMIT_EXCEEDED:
        // 可以实施临时封禁等措施
        console.log(`🚫 速率限制触发: ${event.details.identifier}`);
        break;
    }
  }

  /**
   * 生成安全报告
   */
  generateSecurityReport() {
    const now = Date.now();
    const reportPeriod = 3600000; // 1小时
    const recentEvents = this.suspiciousActivities.filter(
      event => now - event.timestamp < reportPeriod
    );

    const report = {
      timestamp: now,
      period: '1 hour',
      metrics: { ...this.metrics },
      eventSummary: this.summarizeEvents(recentEvents),
      recommendations: this.generateRecommendations(recentEvents)
    };

    console.log('📊 安全报告:', JSON.stringify(report, null, 2));
    this.emit('securityReport', report);

    return report;
  }

  /**
   * 汇总事件
   * @param {Array} events - 事件列表
   * @returns {Object} 事件汇总
   */
  summarizeEvents(events) {
    const summary = {};
    
    for (const event of events) {
      if (!summary[event.type]) {
        summary[event.type] = 0;
      }
      summary[event.type]++;
    }

    return summary;
  }

  /**
   * 生成建议
   * @param {Array} events - 事件列表
   * @returns {Array} 建议列表
   */
  generateRecommendations(events) {
    const recommendations = [];
    const eventCounts = this.summarizeEvents(events);

    if (eventCounts[SECURITY_EVENTS.MEMORY_THRESHOLD_EXCEEDED] > 5) {
      recommendations.push('考虑增加内存限制或优化内存使用');
    }

    if (eventCounts[SECURITY_EVENTS.RATE_LIMIT_EXCEEDED] > 10) {
      recommendations.push('考虑调整速率限制策略或实施更严格的访问控制');
    }

    if (eventCounts[SECURITY_EVENTS.SUSPICIOUS_ACTIVITY] > 3) {
      recommendations.push('建议进行详细的安全审计');
    }

    return recommendations;
  }

  /**
   * 获取监控统计
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.metrics,
      isMonitoring: this.isMonitoring,
      activeLimiters: this.rateLimiters.size,
      recentEvents: this.suspiciousActivities.length,
      uptime: Date.now() - this.metrics.lastResetTime
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.metrics = {
      totalRequests: 0,
      blockedRequests: 0,
      errorCount: 0,
      memoryPeakUsage: 0,
      lastResetTime: Date.now()
    };
    
    this.suspiciousActivities = [];
    this.rateLimiters.clear();
    
    console.log('📊 安全监控统计已重置');
  }
}

// 创建全局安全监控器实例
export const globalSecurityMonitor = new SecurityMonitor();

export default globalSecurityMonitor;
