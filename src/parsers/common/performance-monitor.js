/**
 * 融合优化的性能监控模块
 * 结合了两个性能监控模块的优点，提供更完善的性能监控功能
 * 包含：详细指标收集、批处理优化、并发控制、流式处理等
 */

// import { ParserErrorHandler } from './error-handler.js'; // 移除以避免循环依赖

/**
 * 线程安全的环形缓冲区实现
 * 用于高效存储固定大小的历史数据，避免数组动态扩容和切片操作
 */
class CircularBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.lock = false; // 简单的锁机制
  }

  /**
   * 获取锁
   * @private
   */
  async acquireLock() {
    let attempts = 0;
    const maxAttempts = 100;

    while (this.lock && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1));
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error('Failed to acquire buffer lock');
    }

    this.lock = true;
  }

  /**
   * 释放锁
   * @private
   */
  releaseLock() {
    this.lock = false;
  }

  /**
   * 线程安全地添加元素到缓冲区
   * @param {*} item - 要添加的元素
   */
  async add(item) {
    await this.acquireLock();

    try {
      this.buffer[this.tail] = item;
      this.tail = (this.tail + 1) % this.capacity;

      if (this.size < this.capacity) {
        this.size++;
      } else {
        // 缓冲区已满，移动头指针
        this.head = (this.head + 1) % this.capacity;
      }
    } finally {
      this.releaseLock();
    }
  }

  /**
   * 获取所有元素（按时间顺序）
   * @returns {Array} 元素数组
   */
  toArray() {
    if (this.size === 0) return [];

    const result = new Array(this.size);
    let index = 0;
    let current = this.head;

    for (let i = 0; i < this.size; i++) {
      result[index++] = this.buffer[current];
      current = (current + 1) % this.capacity;
    }

    return result;
  }

  /**
   * 根据时间范围过滤元素
   * @param {number} cutoffTime - 截止时间戳
   * @returns {Array} 过滤后的元素数组
   */
  filterByTime(cutoffTime) {
    const all = this.toArray();
    return all.filter(item => item.timestamp >= cutoffTime);
  }

  /**
   * 清空缓冲区
   */
  clear() {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }

  /**
   * 获取缓冲区大小
   * @returns {number} 当前元素数量
   */
  length() {
    return this.size;
  }
}

/**
 * 性能指标类型（融合版本）
 */
export const MetricTypes = {
  PARSE_TIME: 'parse_time',
  VALIDATION_TIME: 'validation_time',
  CONVERSION_TIME: 'conversion_time',
  CACHE_HIT_RATE: 'cache_hit_rate',
  MEMORY_USAGE: 'memory_usage',
  THROUGHPUT: 'throughput',
  ERROR_RATE: 'error_rate',
  // 来自utils版本的扩展指标
  BATCH_PROCESSING_TIME: 'batch_processing_time',
  CONCURRENCY_LEVEL: 'concurrency_level',
  STREAM_PROCESSING_TIME: 'stream_processing_time',
  GC_FREQUENCY: 'gc_frequency'
};

/**
 * 并发控制器（来自utils版本）
 * 控制并发任务数量，避免资源过度消耗
 */
export class ConcurrencyController {
  constructor(limit = 16) { // 提升默认并发限制
    this.limit = limit;
    this.running = 0;
    this.queue = [];
    this.priorityQueue = []; // 高优先级任务队列
    this.adaptiveMode = true; // 自适应模式
    this.performanceWindow = []; // 性能窗口
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      maxConcurrency: 0,
      averageWaitTime: 0,
      throughput: 0, // 吞吐量
      adaptiveAdjustments: 0, // 自适应调整次数
      optimalConcurrency: limit // 最优并发数
    };
    this.lastOptimization = Date.now();
  }

  /**
   * 添加任务到队列 - 防止死锁
   * @param {Function} task - 异步任务函数
   * @param {Object} options - 选项
   * @returns {Promise} 任务结果
   */
  async add(task, options = {}) {
    const timeout = options.timeout || 30000; // 默认30秒超时
    const priority = options.priority || 'normal';

    // 队列大小限制
    const maxQueueSize = 10000;
    if (this.queue.length >= maxQueueSize) {
      throw new Error(`Queue size limit exceeded: ${maxQueueSize}`);
    }

    return new Promise((resolve, reject) => {
      const taskWrapper = {
        task,
        resolve,
        reject,
        enqueueTime: Date.now(),
        timeout,
        priority,
        timeoutId: null
      };

      // 设置超时
      taskWrapper.timeoutId = setTimeout(() => {
        // 从队列中移除超时任务
        const index = this.queue.indexOf(taskWrapper);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }

        reject(new Error(`Task timeout after ${timeout}ms`));
      }, timeout);

      // 根据优先级插入队列
      if (priority === 'high') {
        this.priorityQueue = this.priorityQueue || [];
        this.priorityQueue.push(taskWrapper);
      } else {
        this.queue.push(taskWrapper);
      }

      this.stats.totalTasks++;
      this.process();
    });
  }

  /**
   * 处理队列 - 防止死锁
   */
  async process() {
    if (this.running >= this.limit) {
      return;
    }

    // 优先处理高优先级任务
    this.priorityQueue = this.priorityQueue || [];
    let taskWrapper = this.priorityQueue.shift() || this.queue.shift();

    if (!taskWrapper) {
      return;
    }

    this.running++;
    this.stats.maxConcurrency = Math.max(this.stats.maxConcurrency, this.running);

    // 清除超时定时器
    if (taskWrapper.timeoutId) {
      clearTimeout(taskWrapper.timeoutId);
    }

    const { task, resolve, reject, enqueueTime } = taskWrapper;
    const waitTime = Date.now() - enqueueTime;

    // 更新平均等待时间
    this.stats.averageWaitTime =
      (this.stats.averageWaitTime * this.stats.completedTasks + waitTime) /
      (this.stats.completedTasks + 1);

    try {
      const result = await task();
      resolve(result);
      this.stats.completedTasks++;
    } catch (error) {
      reject(error);
      this.stats.failedTasks++;
    } finally {
      this.running--;
      this.process(); // 处理下一个任务
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      runningTasks: this.running,
      successRate: this.stats.totalTasks > 0 ?
        (this.stats.completedTasks / this.stats.totalTasks * 100).toFixed(2) + '%' : '0%'
    };
  }
}

/**
 * 流式处理器（来自utils版本）
 * 处理大数据集时使用流式处理减少内存占用
 */
export class StreamProcessor {
  constructor(chunkSize = 1000) {
    this.chunkSize = chunkSize;
    this.stats = {
      totalChunks: 0,
      processedItems: 0,
      processingTime: 0,
      memoryPeaks: []
    };
  }

  /**
   * 流式处理大数据集
   * @param {Array} data - 数据数组
   * @param {Function} processor - 处理函数
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 处理结果
   */
  async processLargeDataset(data, processor, options = {}) {
    const startTime = Date.now();
    const results = [];
    const enableProgress = options.enableProgress !== false;

    console.log(`🌊 开始流式处理，数据量: ${data.length}，块大小: ${this.chunkSize}`);

    for (let i = 0; i < data.length; i += this.chunkSize) {
      const chunk = data.slice(i, i + this.chunkSize);

      try {
        const chunkResult = await processor(chunk);
        results.push(...chunkResult);

        this.stats.totalChunks++;
        this.stats.processedItems += chunk.length;

        // 记录内存峰值
        const memUsage = this.getMemoryUsage();
        this.stats.memoryPeaks.push(memUsage.heapUsed);

        if (enableProgress) {
          const progress = ((i + chunk.length) / data.length * 100).toFixed(1);
          console.log(`📊 流式处理进度: ${progress}% (${i + chunk.length}/${data.length})`);
        }

        // 适当延迟，避免阻塞事件循环
        if (this.stats.totalChunks % 10 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }

      } catch (error) {
        console.error(`❌ 流式处理块失败:`, error.message);
        throw error;
      }
    }

    this.stats.processingTime = Date.now() - startTime;
    console.log(`✅ 流式处理完成，耗时: ${this.stats.processingTime}ms`);

    return results;
  }

  /**
   * 获取内存使用情况
   */
  getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage();
    }
    return { heapUsed: 0, heapTotal: 0, external: 0 };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const avgMemory = this.stats.memoryPeaks.length > 0 ?
      this.stats.memoryPeaks.reduce((a, b) => a + b, 0) / this.stats.memoryPeaks.length : 0;

    return {
      ...this.stats,
      averageMemoryUsage: (avgMemory / 1024 / 1024).toFixed(2) + 'MB',
      throughput: this.stats.processingTime > 0 ?
        (this.stats.processedItems / this.stats.processingTime * 1000).toFixed(2) + ' items/sec' : '0 items/sec'
    };
  }
}

/**
 * 性能监控器类
 */
export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.sessions = new Map();
    this.startTime = Date.now();
    this.isEnabled = true;

    // 性能阈值配置
    this.thresholds = {
      [MetricTypes.PARSE_TIME]: 100, // 100ms
      [MetricTypes.VALIDATION_TIME]: 50, // 50ms
      [MetricTypes.CONVERSION_TIME]: 75, // 75ms
      [MetricTypes.CACHE_HIT_RATE]: 80, // 80%
      [MetricTypes.THROUGHPUT]: 100, // 100 ops/sec
      [MetricTypes.ERROR_RATE]: 5 // 5%
    };

    // 历史数据存储（最近1000条记录）
    this.historyLimit = 1000;
    this.history = {
      [MetricTypes.PARSE_TIME]: [],
      [MetricTypes.VALIDATION_TIME]: [],
      [MetricTypes.CONVERSION_TIME]: [],
      [MetricTypes.CACHE_HIT_RATE]: [],
      [MetricTypes.THROUGHPUT]: [],
      [MetricTypes.ERROR_RATE]: []
    };
  }

  /**
   * 启用性能监控
   */
  enable() {
    this.isEnabled = true;
  }

  /**
   * 禁用性能监控
   */
  disable() {
    this.isEnabled = false;
  }

  /**
   * 开始操作监控（便捷方法）
   * @param {string} operation - 操作名称
   * @param {Object} context - 上下文信息
   * @returns {Function} 结束监控的函数
   */
  startOperation(operation, context = {}) {
    if (!this.isEnabled) {
      return () => {}; // 返回空函数
    }

    const sessionId = `${operation}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    this.startSession(sessionId, operation, context);

    // 返回结束函数
    return (result = {}) => {
      return this.endSession(sessionId, result);
    };
  }

  /**
   * 开始性能测量会话
   * @param {string} sessionId - 会话ID
   * @param {string} operation - 操作类型
   * @param {Object} context - 上下文信息
   * @returns {string} 会话ID
   */
  startSession(sessionId, operation, context = {}) {
    if (!this.isEnabled) return sessionId;

    const session = {
      id: sessionId,
      operation,
      context,
      startTime: performance.now(),
      endTime: null,
      duration: null,
      metrics: {},
      memoryStart: this.getMemoryUsage()
    };

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  /**
   * 结束性能测量会话
   * @param {string} sessionId - 会话ID
   * @param {Object} result - 操作结果
   * @returns {Object} 性能报告
   */
  endSession(sessionId, result = {}) {
    if (!this.isEnabled) return null;

    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Performance session ${sessionId} not found`);
      return null;
    }

    session.endTime = performance.now();
    session.duration = session.endTime - session.startTime;
    session.memoryEnd = this.getMemoryUsage();
    session.memoryDelta = session.memoryEnd - session.memoryStart;
    session.result = result;

    // 记录指标
    this.recordMetric(this.getMetricTypeForOperation(session.operation), session.duration);

    // 生成报告
    const report = this.generateSessionReport(session);

    // 清理会话
    this.sessions.delete(sessionId);

    return report;
  }

  /**
   * 记录性能指标
   * @param {string} metricType - 指标类型
   * @param {number} value - 指标值
   * @param {Object} context - 上下文信息
   */
  recordMetric(metricType, value, context = {}) {
    if (!this.isEnabled) return;

    const timestamp = Date.now();
    const metric = {
      type: metricType,
      value,
      timestamp,
      context
    };

    // 存储到当前指标（使用环形缓冲区）
    if (!this.metrics.has(metricType)) {
      this.metrics.set(metricType, new CircularBuffer(this.historyLimit));
    }
    this.metrics.get(metricType).add(metric);

    // 存储到历史数据（使用环形缓冲区）
    if (!this.history[metricType]) {
      this.history[metricType] = new CircularBuffer(this.historyLimit);
    }
    this.history[metricType].add(metric);

    // 检查性能阈值（添加频率限制）
    this.checkThresholdWithRateLimit(metricType, value);
  }

  /**
   * 获取性能统计信息
   * @param {string} metricType - 指标类型（可选）
   * @param {number} timeRange - 时间范围（毫秒，可选）
   * @returns {Object} 统计信息
   */
  getStats(metricType = null, timeRange = null) {
    const now = Date.now();
    const cutoffTime = timeRange ? now - timeRange : 0;

    if (metricType) {
      return this.getMetricStats(metricType, cutoffTime);
    }

    // 返回所有指标的统计信息
    const allStats = {};
    for (const type of Object.values(MetricTypes)) {
      allStats[type] = this.getMetricStats(type, cutoffTime);
    }

    return {
      overall: allStats,
      uptime: now - this.startTime,
      activeSessions: this.sessions.size,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取单个指标的统计信息（环形缓冲区优化版本）
   * @param {string} metricType - 指标类型
   * @param {number} cutoffTime - 截止时间
   * @returns {Object} 指标统计
   */
  getMetricStats(metricType, cutoffTime = 0) {
    const buffer = this.history[metricType];
    if (!buffer || buffer.length() === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        avg: 0,
        median: 0,
        p95: 0,
        p99: 0,
        threshold: this.thresholds[metricType] || 0,
        exceedsThreshold: false
      };
    }

    // 使用环形缓冲区的高效时间过滤
    const filteredMetrics = cutoffTime > 0 ?
      buffer.filterByTime(cutoffTime) :
      buffer.toArray();

    if (filteredMetrics.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        avg: 0,
        median: 0,
        p95: 0,
        p99: 0,
        threshold: this.thresholds[metricType] || 0,
        exceedsThreshold: false
      };
    }

    const values = filteredMetrics.map(m => m.value).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const min = values[0];
    const max = values[count - 1];
    const median = this.getPercentile(values, 50);
    const p95 = this.getPercentile(values, 95);
    const p99 = this.getPercentile(values, 99);
    const threshold = this.thresholds[metricType] || 0;
    const exceedsThreshold = threshold > 0 && avg > threshold;

    return {
      count,
      min,
      max,
      avg: parseFloat(avg.toFixed(2)),
      median,
      p95,
      p99,
      threshold,
      exceedsThreshold,
      trend: this.calculateTrend(filteredMetrics),
      bufferUtilization: parseFloat((buffer.length() / buffer.capacity * 100).toFixed(1))
    };
  }

  /**
   * 计算百分位数
   * @param {Array} values - 已排序的数值数组
   * @param {number} percentile - 百分位数
   * @returns {number} 百分位数值
   */
  getPercentile(values, percentile) {
    if (values.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[Math.max(0, Math.min(index, values.length - 1))];
  }

  /**
   * 计算趋势
   * @param {Array} metrics - 指标数组
   * @returns {string} 趋势方向
   */
  calculateTrend(metrics) {
    if (metrics.length < 2) return 'stable';

    const recentCount = Math.min(10, Math.floor(metrics.length / 2));
    const recent = metrics.slice(-recentCount);
    const previous = metrics.slice(-recentCount * 2, -recentCount);

    if (previous.length === 0) return 'stable';

    const recentAvg = recent.reduce((sum, m) => sum + m.value, 0) / recent.length;
    const previousAvg = previous.reduce((sum, m) => sum + m.value, 0) / previous.length;

    const change = (recentAvg - previousAvg) / previousAvg;

    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  /**
   * 检查性能阈值（带频率限制）
   * @param {string} metricType - 指标类型
   * @param {number} value - 指标值
   */
  checkThresholdWithRateLimit(metricType, value) {
    const threshold = this.thresholds[metricType];
    if (!threshold || value <= threshold) return;

    const now = Date.now();
    const warningKey = `${metricType}_warning`;

    // 频率限制：每个指标类型最多每30秒警告一次
    if (!this.lastWarningTime) {
      this.lastWarningTime = new Map();
    }

    const lastWarning = this.lastWarningTime.get(warningKey) || 0;
    if (now - lastWarning < 30000) { // 30秒内不重复警告
      return;
    }

    this.lastWarningTime.set(warningKey, now);

    console.warn(`Performance threshold exceeded for ${metricType}: ${value} > ${threshold}`);

    // 记录性能警告（简化版本，避免循环依赖）
    console.warn(`Performance warning: ${metricType} exceeded threshold`, {
      metricType, value, threshold, timestamp: new Date().toISOString()
    });
  }

  /**
   * 检查性能阈值（向后兼容方法）
   * @param {string} metricType - 指标类型
   * @param {number} value - 指标值
   */
  checkThreshold(metricType, value) {
    return this.checkThresholdWithRateLimit(metricType, value);
  }

  /**
   * 根据操作类型获取对应的指标类型
   * @param {string} operation - 操作类型
   * @returns {string} 指标类型
   */
  getMetricTypeForOperation(operation) {
    const operationMap = {
      'parse': MetricTypes.PARSE_TIME,
      'validate': MetricTypes.VALIDATION_TIME,
      'convert': MetricTypes.CONVERSION_TIME,
      'toClash': MetricTypes.CONVERSION_TIME,
      'fromClash': MetricTypes.CONVERSION_TIME,
      'generate': MetricTypes.CONVERSION_TIME
    };

    return operationMap[operation] || MetricTypes.PARSE_TIME;
  }

  /**
   * 生成会话报告
   * @param {Object} session - 会话对象
   * @returns {Object} 会话报告
   */
  generateSessionReport(session) {
    const metricType = this.getMetricTypeForOperation(session.operation);
    const threshold = this.thresholds[metricType] || 0;
    const exceedsThreshold = threshold > 0 && session.duration > threshold;

    return {
      sessionId: session.id,
      operation: session.operation,
      duration: parseFloat(session.duration.toFixed(2)),
      memoryDelta: session.memoryDelta,
      threshold,
      exceedsThreshold,
      performance: exceedsThreshold ? 'poor' : session.duration < threshold * 0.5 ? 'excellent' : 'good',
      context: session.context,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取内存使用情况
   * @returns {number} 内存使用量（字节）
   */
  getMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return performance.memory.usedJSHeapSize;
    }

    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }

    return 0;
  }

  /**
   * 生成性能报告
   * @param {Object} options - 报告选项
   * @returns {Object} 性能报告
   */
  generateReport(options = {}) {
    const timeRange = options.timeRange || 3600000; // 默认1小时
    const includeHistory = options.includeHistory || false;

    const stats = this.getStats(null, timeRange);
    const report = {
      summary: {
        uptime: stats.uptime,
        activeSessions: stats.activeSessions,
        timestamp: stats.timestamp
      },
      metrics: stats.overall,
      recommendations: this.generateRecommendations(stats.overall),
      alerts: this.generateAlerts(stats.overall)
    };

    if (includeHistory) {
      report.history = this.history;
    }

    return report;
  }

  /**
   * 生成性能优化建议
   * @param {Object} stats - 统计信息
   * @returns {Array} 建议列表
   */
  generateRecommendations(stats) {
    const recommendations = [];

    // 解析时间建议
    if (stats[MetricTypes.PARSE_TIME]?.exceedsThreshold) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: '解析时间过长，建议优化解析算法或增加缓存'
      });
    }

    // 缓存命中率建议
    if (stats[MetricTypes.CACHE_HIT_RATE]?.avg < 70) {
      recommendations.push({
        type: 'cache',
        priority: 'medium',
        message: '缓存命中率较低，建议调整缓存策略或增加缓存大小'
      });
    }

    // 错误率建议
    if (stats[MetricTypes.ERROR_RATE]?.avg > 3) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        message: '错误率较高，建议检查输入数据质量和错误处理逻辑'
      });
    }

    return recommendations;
  }

  /**
   * 生成性能警报
   * @param {Object} stats - 统计信息
   * @returns {Array} 警报列表
   */
  generateAlerts(stats) {
    const alerts = [];

    Object.entries(stats).forEach(([metricType, stat]) => {
      if (stat.exceedsThreshold) {
        alerts.push({
          type: 'threshold_exceeded',
          metricType,
          value: stat.avg,
          threshold: stat.threshold,
          severity: stat.avg > stat.threshold * 2 ? 'critical' : 'warning',
          timestamp: new Date().toISOString()
        });
      }
    });

    return alerts;
  }

  /**
   * 清除历史数据（环形缓冲区优化版本）
   * @param {string} metricType - 指标类型（可选）
   */
  clearHistory(metricType = null) {
    if (metricType) {
      if (this.history[metricType]) {
        this.history[metricType].clear();
      }
      if (this.metrics.has(metricType)) {
        this.metrics.get(metricType).clear();
      }
    } else {
      Object.keys(this.history).forEach(type => {
        if (this.history[type] && typeof this.history[type].clear === 'function') {
          this.history[type].clear();
        }
      });
      this.metrics.forEach(buffer => {
        if (buffer && typeof buffer.clear === 'function') {
          buffer.clear();
        }
      });
    }
  }

  /**
   * 设置性能阈值
   * @param {string} metricType - 指标类型
   * @param {number} threshold - 阈值
   */
  setThreshold(metricType, threshold) {
    this.thresholds[metricType] = threshold;
  }
}

// 全局性能监控实例
export const globalPerformanceMonitor = new PerformanceMonitor();

/**
 * 批处理优化器（来自utils版本）
 * 优化大批量数据处理性能
 */
export class BatchOptimizer {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 10000; // 增大默认批次大小
    this.maxMemoryUsage = options.maxMemoryUsage || 512 * 1024 * 1024; // 512MB（大幅提升）
    this.enableWorkerThreads = options.enableWorkerThreads || false;
    this.adaptiveBatching = options.adaptiveBatching !== false; // 默认启用自适应批处理
    this.minBatchSize = options.minBatchSize || 1000;
    this.maxBatchSize = options.maxBatchSize || 50000;
    this.stats = {
      totalBatches: 0,
      totalItems: 0,
      processingTime: 0,
      memoryPeaks: [],
      avgBatchSize: 0,
      adaptiveAdjustments: 0
    };
  }

  /**
   * 智能批处理
   * 根据内存使用情况动态调整批次大小
   * @param {Array} data - 数据数组
   * @param {Function} processor - 处理函数
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 处理结果
   */
  async smartBatchProcess(data, processor, options = {}) {
    const startTime = Date.now();
    const results = [];
    let currentBatchSize = this.batchSize;
    let processedCount = 0;

    console.log(`🚀 开始智能批处理，数据量: ${data.length}`);

    while (processedCount < data.length) {
      // 动态调整批次大小
      const memBefore = this.getMemoryUsage();
      if (memBefore.heapUsed > this.maxMemoryUsage * 0.8) {
        currentBatchSize = Math.max(100, Math.floor(currentBatchSize * 0.7));
        console.log(`⚠️ 内存使用过高，调整批次大小为: ${currentBatchSize}`);
      }

      const batch = data.slice(processedCount, processedCount + currentBatchSize);

      try {
        const batchResult = await processor(batch);
        results.push(...batchResult);

        processedCount += batch.length;
        this.stats.totalBatches++;
        this.stats.totalItems += batch.length;

        const memAfter = this.getMemoryUsage();
        this.stats.memoryPeaks.push(memAfter.heapUsed);

        // 智能垃圾回收
        if (this.stats.totalBatches % 5 === 0) {
          await this.performSmartGC();
        }

        const progress = (processedCount / data.length * 100).toFixed(1);
        console.log(`✅ 批次 ${this.stats.totalBatches} 完成，进度: ${progress}% (${processedCount}/${data.length})`);

      } catch (error) {
        console.error(`❌ 批次处理失败:`, error.message);
        throw error;
      }
    }

    this.stats.processingTime = Date.now() - startTime;
    console.log(`🎉 智能批处理完成，总耗时: ${this.stats.processingTime}ms`);

    return results;
  }

  /**
   * 智能垃圾回收管理
   * @param {string} priority - 优先级 ('normal' | 'critical')
   * @returns {Promise<boolean>} 是否执行了垃圾回收
   */
  async performSmartGC(priority = 'normal') {
    // 初始化GC管理器
    if (!this.gcManager) {
      this.gcManager = {
        lastGCTime: 0,
        gcInterval: 60000, // 最小1分钟间隔
        gcCount: 0,
        maxGCPerHour: 10, // 每小时最多10次GC
        gcStats: {
          totalGCs: 0,
          totalGCTime: 0,
          averageGCTime: 0
        }
      };
    }

    if (!global.gc) {
      return false;
    }

    const now = Date.now();
    const manager = this.gcManager;

    // 频率限制检查
    if (priority !== 'critical') {
      // 时间间隔检查
      if (now - manager.lastGCTime < manager.gcInterval) {
        return false;
      }

      // 每小时频率限制
      const hourAgo = now - 3600000;
      if (manager.gcCount >= manager.maxGCPerHour && manager.lastGCTime > hourAgo) {
        console.warn('⚠️ GC频率限制：已达到每小时最大次数');
        return false;
      }
    }

    try {
      const startTime = performance.now();

      // 使用异步方式执行GC，避免阻塞
      await new Promise(resolve => {
        setImmediate(() => {
          global.gc();
          resolve();
        });
      });

      const gcTime = performance.now() - startTime;

      // 更新统计
      manager.lastGCTime = now;
      manager.gcCount++;
      manager.gcStats.totalGCs++;
      manager.gcStats.totalGCTime += gcTime;
      manager.gcStats.averageGCTime = manager.gcStats.totalGCTime / manager.gcStats.totalGCs;

      // 重置每小时计数器
      if (now - manager.lastGCTime > 3600000) {
        manager.gcCount = 1;
      }

      console.log(`🧹 智能GC完成 (${priority})，耗时: ${gcTime.toFixed(2)}ms`);
      return true;

    } catch (error) {
      console.warn('⚠️ 智能GC失败:', error.message);
      return false;
    }
  }

  /**
   * 获取内存使用情况
   */
  getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage();
    }
    return { heapUsed: 0, heapTotal: 0, external: 0 };
  }

  /**
   * 获取优化统计
   */
  getOptimizationStats() {
    const avgMemory = this.stats.memoryPeaks.length > 0 ?
      this.stats.memoryPeaks.reduce((a, b) => a + b, 0) / this.stats.memoryPeaks.length : 0;

    return {
      ...this.stats,
      averageMemoryUsage: (avgMemory / 1024 / 1024).toFixed(2) + 'MB',
      throughput: this.stats.processingTime > 0 ?
        (this.stats.totalItems / this.stats.processingTime * 1000).toFixed(2) + ' items/sec' : '0 items/sec',
      averageBatchSize: this.stats.totalBatches > 0 ?
        Math.round(this.stats.totalItems / this.stats.totalBatches) : 0
    };
  }
}

/**
 * 性能优化管理器（来自utils版本）
 * 集成所有性能优化工具的统一管理器
 */
export class PerformanceOptimizer {
  constructor(options = {}) {
    this.streamProcessor = new StreamProcessor(options.chunkSize);
    this.concurrencyController = new ConcurrencyController(options.concurrencyLimit);
    this.batchOptimizer = new BatchOptimizer(options.batchOptions);
    this.monitor = new PerformanceMonitor();

    this.config = {
      enableCaching: options.enableCaching !== false,
      enableBatching: options.enableBatching !== false,
      enableConcurrency: options.enableConcurrency !== false,
      autoGC: options.autoGC !== false,
      ...options
    };
  }

  /**
   * 优化大数据集处理
   * @param {Array} data - 数据数组
   * @param {Function} processor - 处理函数
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 处理结果
   */
  async optimizeDataProcessing(data, processor, options = {}) {
    const endMonitor = this.monitor.startOperation('DataProcessing');

    try {
      let result;

      if (data.length > 10000 && this.config.enableBatching) {
        // 大数据集使用批处理优化
        console.log('🚀 使用批处理优化模式');
        result = await this.batchOptimizer.smartBatchProcess(data, processor, options);
      } else if (data.length > 1000) {
        // 中等数据集使用流式处理
        console.log('🌊 使用流式处理模式');
        result = await this.streamProcessor.processLargeDataset(data, processor, options);
      } else {
        // 小数据集直接处理
        console.log('⚡ 使用直接处理模式');
        result = await processor(data);
      }

      return result;
    } finally {
      endMonitor();
    }
  }

  /**
   * 内存优化清理
   */
  async optimizeMemory() {
    const endMonitor = this.monitor.startOperation('MemoryOptimization');

    try {
      // 智能垃圾回收
      if (this.config.autoGC) {
        await this.performSmartGC();
      }

      console.log('🧹 内存优化完成');
    } finally {
      endMonitor();
    }
  }

  /**
   * 获取综合性能报告
   * @returns {Object} 性能报告
   */
  getPerformanceReport() {
    return {
      monitor: this.monitor.getReport(),
      concurrency: this.concurrencyController.getStats(),
      batch: this.batchOptimizer.getOptimizationStats(),
      stream: this.streamProcessor.getStats(),
      config: this.config
    };
  }
}

// 全局实例（融合版本）
export const globalPerformanceOptimizer = new PerformanceOptimizer();

// 便捷函数（融合版本）
export const startPerformanceSession = (operation, context) => {
  const sessionId = `${operation}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  return globalPerformanceMonitor.startSession(sessionId, operation, context);
};

export const endPerformanceSession = (sessionId, result) => {
  return globalPerformanceMonitor.endSession(sessionId, result);
};

export const recordPerformanceMetric = (metricType, value, context) => {
  return globalPerformanceMonitor.recordMetric(metricType, value, context);
};

export const getPerformanceStats = (metricType, timeRange) => {
  return globalPerformanceMonitor.getStats(metricType, timeRange);
};

export const generatePerformanceReport = (options) => {
  return globalPerformanceMonitor.generateReport(options);
};

// 优化处理便捷函数
export const optimizeDataProcessing = (data, processor, options) => {
  return globalPerformanceOptimizer.optimizeDataProcessing(data, processor, options);
};

export const optimizeMemory = () => {
  return globalPerformanceOptimizer.optimizeMemory();
};
