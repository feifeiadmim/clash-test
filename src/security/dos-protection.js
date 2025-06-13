/**
 * DoS防护系统
 * 提供多层次的拒绝服务攻击防护机制
 */

import { globalSecurityMonitor, SECURITY_EVENTS } from './security-monitor.js';
import { globalSecurityManager } from '../config/security.js';

/**
 * 令牌桶算法实现
 */
class TokenBucket {
  constructor(capacity, refillRate, refillPeriod = 1000) {
    this.capacity = capacity; // 桶容量
    this.tokens = capacity; // 当前令牌数
    this.refillRate = refillRate; // 每次补充的令牌数
    this.refillPeriod = refillPeriod; // 补充周期（毫秒）
    this.lastRefill = Date.now();
  }

  /**
   * 尝试消费令牌
   * @param {number} tokens - 需要的令牌数
   * @returns {boolean} 是否成功消费
   */
  consume(tokens = 1) {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }

  /**
   * 补充令牌
   */
  refill() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor(timePassed / this.refillPeriod) * this.refillRate;
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * 获取当前状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    this.refill();
    return {
      tokens: this.tokens,
      capacity: this.capacity,
      utilization: ((this.capacity - this.tokens) / this.capacity * 100).toFixed(2)
    };
  }
}

/**
 * 滑动窗口计数器
 */
class SlidingWindowCounter {
  constructor(windowSize = 60000, bucketCount = 60) {
    this.windowSize = windowSize; // 窗口大小（毫秒）
    this.bucketCount = bucketCount; // 桶数量
    this.bucketSize = windowSize / bucketCount; // 每个桶的时间跨度
    this.buckets = new Array(bucketCount).fill(0);
    this.lastUpdate = Date.now();
  }

  /**
   * 记录事件
   * @param {number} count - 事件数量
   */
  record(count = 1) {
    this.updateBuckets();
    const currentBucket = Math.floor(Date.now() / this.bucketSize) % this.bucketCount;
    this.buckets[currentBucket] += count;
  }

  /**
   * 获取当前窗口内的总计数
   * @returns {number} 总计数
   */
  getCount() {
    this.updateBuckets();
    return this.buckets.reduce((sum, count) => sum + count, 0);
  }

  /**
   * 更新桶状态
   */
  updateBuckets() {
    const now = Date.now();
    const bucketsToReset = Math.floor((now - this.lastUpdate) / this.bucketSize);
    
    if (bucketsToReset > 0) {
      const currentBucket = Math.floor(now / this.bucketSize) % this.bucketCount;
      
      for (let i = 0; i < Math.min(bucketsToReset, this.bucketCount); i++) {
        const bucketIndex = (currentBucket - i + this.bucketCount) % this.bucketCount;
        this.buckets[bucketIndex] = 0;
      }
      
      this.lastUpdate = now;
    }
  }
}

/**
 * DoS防护管理器
 */
export class DosProtectionManager {
  constructor() {
    this.enabled = false;
    this.rateLimiters = new Map(); // IP级别的速率限制器
    this.globalLimiter = null; // 全局速率限制器
    this.connectionTracker = new Map(); // 连接跟踪
    this.suspiciousIPs = new Set(); // 可疑IP列表
    this.blockedIPs = new Set(); // 被封禁的IP列表
    this.circuitBreakers = new Map(); // 熔断器
    
    // 统计信息
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      rateLimitedRequests: 0,
      circuitBreakerTrips: 0,
      lastReset: Date.now()
    };
  }

  /**
   * 初始化DoS防护
   * @param {Object} config - 配置选项
   */
  initialize(config = {}) {
    const defaultConfig = {
      globalRateLimit: 1000, // 全局每分钟请求限制
      perIPRateLimit: 100, // 每IP每分钟请求限制
      burstLimit: 20, // 突发请求限制
      windowSize: 60000, // 窗口大小（1分钟）
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 50, // 熔断器阈值
      blockDuration: 300000, // 封禁时长（5分钟）
      enableAdaptiveThrottling: true
    };

    this.config = { ...defaultConfig, ...config };
    
    // 初始化全局限制器
    this.globalLimiter = new TokenBucket(
      this.config.globalRateLimit,
      Math.floor(this.config.globalRateLimit / 60), // 每秒补充
      1000
    );

    this.enabled = true;
    console.log('🛡️ DoS防护系统已启用');

    // 启动清理任务
    this.startCleanupTasks();
  }

  /**
   * 检查请求是否被允许
   * @param {string} identifier - 请求标识符（通常是IP地址）
   * @param {Object} context - 请求上下文
   * @returns {Object} 检查结果
   */
  checkRequest(identifier, context = {}) {
    if (!this.enabled) {
      return { allowed: true, reason: 'protection_disabled' };
    }

    this.stats.totalRequests++;

    // 检查IP是否被封禁
    if (this.blockedIPs.has(identifier)) {
      this.stats.blockedRequests++;
      return { 
        allowed: false, 
        reason: 'ip_blocked',
        retryAfter: this.getBlockTimeRemaining(identifier)
      };
    }

    // 检查全局速率限制
    if (!this.globalLimiter.consume()) {
      this.stats.rateLimitedRequests++;
      globalSecurityMonitor.recordSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
        type: 'global_rate_limit',
        identifier: 'global',
        limit: this.config.globalRateLimit
      });
      return { 
        allowed: false, 
        reason: 'global_rate_limit',
        retryAfter: 1000
      };
    }

    // 检查每IP速率限制
    const ipLimitResult = this.checkIPRateLimit(identifier);
    if (!ipLimitResult.allowed) {
      this.stats.rateLimitedRequests++;
      return ipLimitResult;
    }

    // 检查熔断器
    if (this.config.enableCircuitBreaker) {
      const circuitBreakerResult = this.checkCircuitBreaker(identifier, context);
      if (!circuitBreakerResult.allowed) {
        return circuitBreakerResult;
      }
    }

    // 检查可疑行为
    this.analyzeBehavior(identifier, context);

    return { allowed: true, reason: 'passed_all_checks' };
  }

  /**
   * 检查IP级别的速率限制
   * @param {string} ip - IP地址
   * @returns {Object} 检查结果
   */
  checkIPRateLimit(ip) {
    if (!this.rateLimiters.has(ip)) {
      this.rateLimiters.set(ip, {
        bucket: new TokenBucket(
          this.config.burstLimit,
          Math.floor(this.config.perIPRateLimit / 60),
          1000
        ),
        counter: new SlidingWindowCounter(this.config.windowSize),
        firstSeen: Date.now()
      });
    }

    const limiter = this.rateLimiters.get(ip);
    limiter.counter.record();

    // 检查突发限制
    if (!limiter.bucket.consume()) {
      globalSecurityMonitor.recordSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
        type: 'burst_limit',
        identifier: ip,
        limit: this.config.burstLimit
      });
      return { 
        allowed: false, 
        reason: 'burst_limit_exceeded',
        retryAfter: 1000
      };
    }

    // 检查窗口内总请求数
    const requestCount = limiter.counter.getCount();
    if (requestCount > this.config.perIPRateLimit) {
      globalSecurityMonitor.recordSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
        type: 'ip_rate_limit',
        identifier: ip,
        requests: requestCount,
        limit: this.config.perIPRateLimit
      });
      
      // 标记为可疑IP
      this.suspiciousIPs.add(ip);
      
      return { 
        allowed: false, 
        reason: 'ip_rate_limit_exceeded',
        retryAfter: this.config.windowSize
      };
    }

    return { allowed: true };
  }

  /**
   * 检查熔断器状态
   * @param {string} identifier - 标识符
   * @param {Object} context - 上下文
   * @returns {Object} 检查结果
   */
  checkCircuitBreaker(identifier, context) {
    const service = context.service || 'default';
    const key = `${identifier}:${service}`;

    if (!this.circuitBreakers.has(key)) {
      this.circuitBreakers.set(key, {
        state: 'closed', // closed, open, half-open
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0
      });
    }

    const breaker = this.circuitBreakers.get(key);
    const now = Date.now();

    switch (breaker.state) {
      case 'open':
        if (now >= breaker.nextAttemptTime) {
          breaker.state = 'half-open';
          return { allowed: true, reason: 'circuit_breaker_half_open' };
        }
        return { 
          allowed: false, 
          reason: 'circuit_breaker_open',
          retryAfter: breaker.nextAttemptTime - now
        };

      case 'half-open':
      case 'closed':
        return { allowed: true, reason: 'circuit_breaker_closed' };

      default:
        return { allowed: true, reason: 'circuit_breaker_unknown' };
    }
  }

  /**
   * 记录请求结果（用于熔断器）
   * @param {string} identifier - 标识符
   * @param {Object} context - 上下文
   * @param {boolean} success - 是否成功
   */
  recordRequestResult(identifier, context, success) {
    if (!this.config.enableCircuitBreaker) {
      return;
    }

    const service = context.service || 'default';
    const key = `${identifier}:${service}`;
    const breaker = this.circuitBreakers.get(key);

    if (!breaker) {
      return;
    }

    if (success) {
      breaker.failureCount = 0;
      if (breaker.state === 'half-open') {
        breaker.state = 'closed';
      }
    } else {
      breaker.failureCount++;
      breaker.lastFailureTime = Date.now();

      if (breaker.failureCount >= this.config.circuitBreakerThreshold) {
        breaker.state = 'open';
        breaker.nextAttemptTime = Date.now() + this.config.blockDuration;
        this.stats.circuitBreakerTrips++;

        globalSecurityMonitor.recordSecurityEvent(SECURITY_EVENTS.RESOURCE_ABUSE, {
          type: 'circuit_breaker_trip',
          identifier: identifier,
          service: service,
          failureCount: breaker.failureCount
        });
      }
    }
  }

  /**
   * 分析行为模式
   * @param {string} identifier - 标识符
   * @param {Object} context - 上下文
   */
  analyzeBehavior(identifier, context) {
    const limiter = this.rateLimiters.get(identifier);
    if (!limiter) {
      return;
    }

    const requestCount = limiter.counter.getCount();
    const timeActive = Date.now() - limiter.firstSeen;

    // 检测异常高频请求
    if (requestCount > this.config.perIPRateLimit * 0.8 && timeActive < 10000) {
      this.suspiciousIPs.add(identifier);
      globalSecurityMonitor.recordSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, {
        type: 'high_frequency_requests',
        identifier: identifier,
        requestCount: requestCount,
        timeActive: timeActive
      });
    }

    // 检测持续的高负载
    if (this.suspiciousIPs.has(identifier) && requestCount > this.config.perIPRateLimit * 1.5) {
      this.blockIP(identifier, 'repeated_violations');
    }
  }

  /**
   * 封禁IP
   * @param {string} ip - IP地址
   * @param {string} reason - 封禁原因
   */
  blockIP(ip, reason) {
    this.blockedIPs.add(ip);
    
    // 设置解封时间
    setTimeout(() => {
      this.unblockIP(ip);
    }, this.config.blockDuration);

    globalSecurityMonitor.recordSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
      type: 'ip_blocked',
      identifier: ip,
      reason: reason,
      duration: this.config.blockDuration
    });

    console.log(`🚫 IP已封禁: ${ip} (原因: ${reason})`);
  }

  /**
   * 解封IP
   * @param {string} ip - IP地址
   */
  unblockIP(ip) {
    this.blockedIPs.delete(ip);
    this.suspiciousIPs.delete(ip);
    console.log(`✅ IP已解封: ${ip}`);
  }

  /**
   * 获取封禁剩余时间
   * @param {string} ip - IP地址
   * @returns {number} 剩余时间（毫秒）
   */
  getBlockTimeRemaining(ip) {
    // 简化实现，实际应该记录封禁时间
    return this.config.blockDuration;
  }

  /**
   * 启动清理任务
   */
  startCleanupTasks() {
    // 每5分钟清理过期的限制器
    setInterval(() => {
      this.cleanupExpiredLimiters();
    }, 300000);

    // 每小时重置统计
    setInterval(() => {
      this.resetStats();
    }, 3600000);
  }

  /**
   * 清理过期的限制器
   */
  cleanupExpiredLimiters() {
    const now = Date.now();
    const maxAge = 3600000; // 1小时

    for (const [ip, limiter] of this.rateLimiters.entries()) {
      if (now - limiter.firstSeen > maxAge && limiter.counter.getCount() === 0) {
        this.rateLimiters.delete(ip);
      }
    }

    console.log(`🧹 清理了 ${this.rateLimiters.size} 个过期限制器`);
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      rateLimitedRequests: 0,
      circuitBreakerTrips: 0,
      lastReset: Date.now()
    };
  }

  /**
   * 获取防护状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      enabled: this.enabled,
      stats: { ...this.stats },
      activeLimiters: this.rateLimiters.size,
      blockedIPs: this.blockedIPs.size,
      suspiciousIPs: this.suspiciousIPs.size,
      circuitBreakers: this.circuitBreakers.size,
      globalLimiterStatus: this.globalLimiter?.getStatus()
    };
  }
}

// 创建全局DoS防护管理器实例
export const globalDosProtection = new DosProtectionManager();

export default globalDosProtection;
