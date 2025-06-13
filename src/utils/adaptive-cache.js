/**
 * 自适应缓存管理器
 * 根据使用模式和系统负载动态调整缓存策略
 */

/**
 * 缓存项元数据
 */
class CacheItem {
  constructor(value, ttl = 300000) {
    this.value = value;
    this.createdAt = Date.now();
    this.lastAccessed = Date.now();
    this.accessCount = 1;
    this.expiresAt = Date.now() + ttl;
    this.size = this.calculateSize(value);
    this.hitRate = 1.0; // 初始命中率
  }

  /**
   * 计算值的大小（粗略估算）
   */
  calculateSize(value) {
    if (typeof value === 'string') {
      return value.length * 2; // Unicode字符
    } else if (typeof value === 'object') {
      return JSON.stringify(value).length * 2;
    }
    return 64; // 默认大小
  }

  /**
   * 更新访问信息
   */
  updateAccess() {
    this.lastAccessed = Date.now();
    this.accessCount++;
  }

  /**
   * 检查是否过期
   */
  isExpired() {
    return Date.now() > this.expiresAt;
  }

  /**
   * 计算优先级分数（用于LRU淘汰）
   */
  getPriorityScore() {
    const age = Date.now() - this.lastAccessed;
    const frequency = this.accessCount;
    const recency = 1 / (age + 1);
    
    // 综合考虑频率和最近性
    return frequency * recency * this.hitRate;
  }
}

/**
 * 自适应缓存管理器
 */
export class AdaptiveCache {
  constructor(options = {}) {
    this.options = {
      maxSize: 1000,
      defaultTTL: 300000, // 5分钟
      adaptiveTTL: true,
      hitRateThreshold: 0.7,
      memoryBasedEviction: true,
      statisticsEnabled: true,
      compressionThreshold: 10240, // 10KB
      ...options
    };

    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSize: 0,
      avgTTL: this.options.defaultTTL,
      hitRate: 0,
      lastOptimization: Date.now()
    };

    this.accessPatterns = new Map(); // 访问模式分析
    this.setupOptimization();
  }

  /**
   * 设置定期优化
   */
  setupOptimization() {
    if (this.options.adaptiveTTL) {
      setInterval(() => {
        this.optimizeCache();
      }, 60000); // 每分钟优化一次
    }
  }

  /**
   * 获取缓存项
   * @param {string} key - 缓存键
   * @returns {any} 缓存值
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      this.recordAccess(key, false);
      return null;
    }

    if (item.isExpired()) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      this.recordAccess(key, false);
      return null;
    }

    item.updateAccess();
    this.stats.hits++;
    this.recordAccess(key, true);
    this.updateHitRate();
    
    return item.value;
  }

  /**
   * 设置缓存项
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} customTTL - 自定义TTL
   */
  set(key, value, customTTL = null) {
    const ttl = customTTL || this.calculateAdaptiveTTL(key);
    const item = new CacheItem(value, ttl);

    // 检查是否需要淘汰
    if (this.cache.size >= this.options.maxSize) {
      this.evictItems();
    }

    // 更新总大小
    const oldItem = this.cache.get(key);
    if (oldItem) {
      this.stats.totalSize -= oldItem.size;
    }
    this.stats.totalSize += item.size;

    this.cache.set(key, item);
  }

  /**
   * 计算自适应TTL
   * @param {string} key - 缓存键
   * @returns {number} TTL值
   */
  calculateAdaptiveTTL(key) {
    if (!this.options.adaptiveTTL) {
      return this.options.defaultTTL;
    }

    const pattern = this.accessPatterns.get(key);
    if (!pattern) {
      return this.options.defaultTTL;
    }

    // 根据访问频率调整TTL
    const avgInterval = pattern.totalTime / Math.max(1, pattern.accessCount - 1);
    const frequency = pattern.accessCount / pattern.totalTime;
    
    let adaptiveTTL = this.options.defaultTTL;
    
    if (frequency > 0.001) { // 高频访问
      adaptiveTTL *= 2; // 延长TTL
    } else if (frequency < 0.0001) { // 低频访问
      adaptiveTTL *= 0.5; // 缩短TTL
    }

    // 基于命中率调整
    if (pattern.hitRate > this.options.hitRateThreshold) {
      adaptiveTTL *= 1.5;
    } else if (pattern.hitRate < 0.3) {
      adaptiveTTL *= 0.7;
    }

    return Math.max(60000, Math.min(3600000, adaptiveTTL)); // 1分钟到1小时
  }

  /**
   * 记录访问模式
   * @param {string} key - 缓存键
   * @param {boolean} hit - 是否命中
   */
  recordAccess(key, hit) {
    if (!this.options.statisticsEnabled) return;

    const now = Date.now();
    let pattern = this.accessPatterns.get(key);
    
    if (!pattern) {
      pattern = {
        firstAccess: now,
        lastAccess: now,
        accessCount: 0,
        hitCount: 0,
        totalTime: 0,
        hitRate: 0
      };
      this.accessPatterns.set(key, pattern);
    }

    pattern.accessCount++;
    if (hit) pattern.hitCount++;
    pattern.totalTime = now - pattern.firstAccess;
    pattern.lastAccess = now;
    pattern.hitRate = pattern.hitCount / pattern.accessCount;

    // 清理过期的访问模式
    if (this.accessPatterns.size > this.options.maxSize * 2) {
      this.cleanupAccessPatterns();
    }
  }

  /**
   * 清理访问模式
   */
  cleanupAccessPatterns() {
    const cutoff = Date.now() - 3600000; // 1小时前
    for (const [key, pattern] of this.accessPatterns) {
      if (pattern.lastAccess < cutoff) {
        this.accessPatterns.delete(key);
      }
    }
  }

  /**
   * 淘汰缓存项
   */
  evictItems() {
    const itemsToEvict = Math.max(1, Math.floor(this.options.maxSize * 0.1)); // 淘汰10%
    const items = Array.from(this.cache.entries())
      .map(([key, item]) => ({ key, item, score: item.getPriorityScore() }))
      .sort((a, b) => a.score - b.score); // 分数低的先淘汰

    for (let i = 0; i < itemsToEvict && i < items.length; i++) {
      const { key, item } = items[i];
      this.cache.delete(key);
      this.stats.totalSize -= item.size;
      this.stats.evictions++;
    }
  }

  /**
   * 更新命中率
   */
  updateHitRate() {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * 优化缓存
   */
  optimizeCache() {
    const now = Date.now();
    
    // 清理过期项
    let expiredCount = 0;
    for (const [key, item] of this.cache) {
      if (item.isExpired()) {
        this.cache.delete(key);
        this.stats.totalSize -= item.size;
        expiredCount++;
      }
    }

    // 更新平均TTL
    if (this.options.adaptiveTTL) {
      this.updateAverageTTL();
    }

    // 基于内存压力调整
    if (this.options.memoryBasedEviction) {
      this.memoryBasedOptimization();
    }

    this.stats.lastOptimization = now;
    
    if (expiredCount > 0) {
      console.log(`🧹 缓存优化完成，清理 ${expiredCount} 个过期项`);
    }
  }

  /**
   * 更新平均TTL
   */
  updateAverageTTL() {
    const ttls = [];
    for (const item of this.cache.values()) {
      ttls.push(item.expiresAt - item.createdAt);
    }
    
    if (ttls.length > 0) {
      this.stats.avgTTL = ttls.reduce((sum, ttl) => sum + ttl, 0) / ttls.length;
    }
  }

  /**
   * 基于内存的优化
   */
  memoryBasedOptimization() {
    if (typeof process === 'undefined') return;

    const memoryUsage = process.memoryUsage();
    const memoryPressure = memoryUsage.heapUsed / memoryUsage.heapTotal;

    if (memoryPressure > 0.8) {
      // 高内存压力：积极淘汰
      const targetSize = Math.floor(this.cache.size * 0.7);
      while (this.cache.size > targetSize) {
        this.evictItems();
      }
      console.log(`🔥 内存压力过高，缓存大小调整至 ${this.cache.size}`);
    }
  }

  /**
   * 获取缓存统计
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.options.maxSize,
      memoryUsage: `${Math.round(this.stats.totalSize / 1024)}KB`,
      efficiency: this.stats.hitRate > 0.8 ? 'excellent' : 
                 this.stats.hitRate > 0.6 ? 'good' : 
                 this.stats.hitRate > 0.4 ? 'fair' : 'poor'
    };
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.accessPatterns.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSize: 0,
      avgTTL: this.options.defaultTTL,
      hitRate: 0,
      lastOptimization: Date.now()
    };
  }

  /**
   * 检查缓存健康状态
   * @returns {Object} 健康状态报告
   */
  getHealthStatus() {
    const stats = this.getStats();
    const issues = [];
    
    if (stats.hitRate < 0.5) {
      issues.push('命中率过低，建议检查缓存策略');
    }
    
    if (stats.size / stats.maxSize > 0.9) {
      issues.push('缓存使用率过高，可能需要增大容量');
    }
    
    if (stats.evictions > stats.hits * 0.1) {
      issues.push('淘汰率过高，建议优化TTL策略');
    }

    return {
      status: issues.length === 0 ? 'healthy' : 'warning',
      issues,
      recommendations: this.generateRecommendations(stats)
    };
  }

  /**
   * 生成优化建议
   * @param {Object} stats - 统计信息
   * @returns {Array} 建议列表
   */
  generateRecommendations(stats) {
    const recommendations = [];
    
    if (stats.hitRate < 0.6) {
      recommendations.push('考虑增加缓存大小或调整TTL策略');
    }
    
    if (stats.efficiency === 'poor') {
      recommendations.push('启用自适应TTL以提高缓存效率');
    }
    
    if (stats.size === stats.maxSize) {
      recommendations.push('缓存已满，建议增大maxSize配置');
    }
    
    return recommendations;
  }
}

// 创建全局自适应缓存实例
export const globalAdaptiveCache = new AdaptiveCache({
  maxSize: 2000,
  adaptiveTTL: true,
  statisticsEnabled: true,
  memoryBasedEviction: true
});

export default AdaptiveCache;
