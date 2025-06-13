/**
 * 资源管理器
 * 统一管理系统资源，防止资源泄漏和过度使用
 */

/**
 * 资源类型枚举
 */
export const ResourceType = {
  TIMER: 'timer',
  LISTENER: 'listener',
  STREAM: 'stream',
  CONNECTION: 'connection',
  CACHE: 'cache',
  WORKER: 'worker'
};

/**
 * 资源管理器类
 */
export class ResourceManager {
  constructor() {
    this.resources = new Map();
    this.resourceCounters = new Map();
    this.cleanupHandlers = new Map();
    this.maxResources = new Map();
    this.isShuttingDown = false;
    
    // 设置默认资源限制
    this.setResourceLimit(ResourceType.TIMER, 1000);
    this.setResourceLimit(ResourceType.LISTENER, 100);
    this.setResourceLimit(ResourceType.STREAM, 50);
    this.setResourceLimit(ResourceType.CONNECTION, 200);
    this.setResourceLimit(ResourceType.CACHE, 10);
    this.setResourceLimit(ResourceType.WORKER, 16);
    
    // 注册进程退出处理
    this.registerExitHandlers();
  }

  /**
   * 注册资源
   * @param {string} type - 资源类型
   * @param {string} id - 资源ID
   * @param {any} resource - 资源对象
   * @param {Function} cleanupFn - 清理函数
   * @returns {boolean} 是否注册成功
   */
  register(type, id, resource, cleanupFn) {
    if (this.isShuttingDown) {
      console.warn('⚠️ 系统正在关闭，拒绝注册新资源');
      return false;
    }

    // 检查资源限制
    if (!this.checkResourceLimit(type)) {
      console.warn(`⚠️ 资源类型 ${type} 已达到限制`);
      return false;
    }

    // 生成唯一资源键
    const resourceKey = `${type}:${id}`;
    
    if (this.resources.has(resourceKey)) {
      console.warn(`⚠️ 资源已存在: ${resourceKey}`);
      return false;
    }

    // 注册资源
    this.resources.set(resourceKey, {
      type,
      id,
      resource,
      cleanupFn,
      createdAt: Date.now(),
      lastAccessed: Date.now()
    });

    // 更新计数器
    const currentCount = this.resourceCounters.get(type) || 0;
    this.resourceCounters.set(type, currentCount + 1);

    console.log(`📝 注册资源: ${resourceKey} (总数: ${currentCount + 1})`);
    return true;
  }

  /**
   * 注销资源
   * @param {string} type - 资源类型
   * @param {string} id - 资源ID
   * @returns {boolean} 是否注销成功
   */
  unregister(type, id) {
    const resourceKey = `${type}:${id}`;
    const resourceInfo = this.resources.get(resourceKey);
    
    if (!resourceInfo) {
      console.warn(`⚠️ 资源不存在: ${resourceKey}`);
      return false;
    }

    try {
      // 执行清理函数
      if (resourceInfo.cleanupFn && typeof resourceInfo.cleanupFn === 'function') {
        resourceInfo.cleanupFn(resourceInfo.resource);
      }

      // 移除资源
      this.resources.delete(resourceKey);

      // 更新计数器
      const currentCount = this.resourceCounters.get(type) || 0;
      this.resourceCounters.set(type, Math.max(0, currentCount - 1));

      console.log(`🗑️ 注销资源: ${resourceKey} (剩余: ${Math.max(0, currentCount - 1)})`);
      return true;

    } catch (error) {
      console.error(`❌ 注销资源失败: ${resourceKey}`, error);
      return false;
    }
  }

  /**
   * 获取资源
   * @param {string} type - 资源类型
   * @param {string} id - 资源ID
   * @returns {any} 资源对象
   */
  get(type, id) {
    const resourceKey = `${type}:${id}`;
    const resourceInfo = this.resources.get(resourceKey);
    
    if (resourceInfo) {
      resourceInfo.lastAccessed = Date.now();
      return resourceInfo.resource;
    }
    
    return null;
  }

  /**
   * 检查资源限制
   * @param {string} type - 资源类型
   * @returns {boolean} 是否在限制内
   */
  checkResourceLimit(type) {
    const currentCount = this.resourceCounters.get(type) || 0;
    const maxCount = this.maxResources.get(type) || Infinity;
    
    return currentCount < maxCount;
  }

  /**
   * 设置资源限制
   * @param {string} type - 资源类型
   * @param {number} limit - 限制数量
   */
  setResourceLimit(type, limit) {
    this.maxResources.set(type, limit);
    console.log(`🔧 设置资源限制: ${type} = ${limit}`);
  }

  /**
   * 获取资源统计
   * @returns {Object} 资源统计信息
   */
  getStats() {
    const stats = {
      timestamp: new Date().toISOString(),
      totalResources: this.resources.size,
      byType: {},
      limits: {},
      oldResources: []
    };

    // 按类型统计
    for (const [type, count] of this.resourceCounters.entries()) {
      stats.byType[type] = {
        count,
        limit: this.maxResources.get(type) || Infinity,
        usage: this.maxResources.get(type) ? 
          (count / this.maxResources.get(type) * 100).toFixed(2) + '%' : 'unlimited'
      };
    }

    // 查找长时间未访问的资源
    const now = Date.now();
    const oldThreshold = 30 * 60 * 1000; // 30分钟

    for (const [key, info] of this.resources.entries()) {
      if (now - info.lastAccessed > oldThreshold) {
        stats.oldResources.push({
          key,
          type: info.type,
          age: Math.round((now - info.createdAt) / 1000 / 60) + ' minutes',
          lastAccessed: Math.round((now - info.lastAccessed) / 1000 / 60) + ' minutes ago'
        });
      }
    }

    return stats;
  }

  /**
   * 清理指定类型的所有资源
   * @param {string} type - 资源类型
   * @returns {number} 清理的资源数量
   */
  cleanupByType(type) {
    let cleanedCount = 0;
    const toCleanup = [];

    // 收集需要清理的资源
    for (const [key, info] of this.resources.entries()) {
      if (info.type === type) {
        toCleanup.push({ key, info });
      }
    }

    // 执行清理
    for (const { key, info } of toCleanup) {
      try {
        if (info.cleanupFn && typeof info.cleanupFn === 'function') {
          info.cleanupFn(info.resource);
        }
        this.resources.delete(key);
        cleanedCount++;
      } catch (error) {
        console.error(`❌ 清理资源失败: ${key}`, error);
      }
    }

    // 重置计数器
    this.resourceCounters.set(type, 0);

    console.log(`🧹 清理 ${type} 类型资源: ${cleanedCount} 个`);
    return cleanedCount;
  }

  /**
   * 清理长时间未使用的资源
   * @param {number} maxAge - 最大年龄（毫秒）
   * @returns {number} 清理的资源数量
   */
  cleanupOldResources(maxAge = 30 * 60 * 1000) { // 默认30分钟
    let cleanedCount = 0;
    const now = Date.now();
    const toCleanup = [];

    // 收集需要清理的资源
    for (const [key, info] of this.resources.entries()) {
      if (now - info.lastAccessed > maxAge) {
        toCleanup.push({ key, info });
      }
    }

    // 执行清理
    for (const { key, info } of toCleanup) {
      try {
        if (info.cleanupFn && typeof info.cleanupFn === 'function') {
          info.cleanupFn(info.resource);
        }
        this.resources.delete(key);
        
        // 更新计数器
        const currentCount = this.resourceCounters.get(info.type) || 0;
        this.resourceCounters.set(info.type, Math.max(0, currentCount - 1));
        
        cleanedCount++;
      } catch (error) {
        console.error(`❌ 清理旧资源失败: ${key}`, error);
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 清理长时间未使用的资源: ${cleanedCount} 个`);
    }

    return cleanedCount;
  }

  /**
   * 清理所有资源
   * @returns {number} 清理的资源数量
   */
  cleanupAll() {
    console.log('🧹 开始清理所有资源...');
    
    let cleanedCount = 0;
    const errors = [];

    for (const [key, info] of this.resources.entries()) {
      try {
        if (info.cleanupFn && typeof info.cleanupFn === 'function') {
          info.cleanupFn(info.resource);
        }
        cleanedCount++;
      } catch (error) {
        errors.push({ key, error: error.message });
        console.error(`❌ 清理资源失败: ${key}`, error);
      }
    }

    // 清空所有资源
    this.resources.clear();
    this.resourceCounters.clear();

    console.log(`🧹 资源清理完成: ${cleanedCount} 个成功, ${errors.length} 个失败`);
    
    if (errors.length > 0) {
      console.warn('⚠️ 清理失败的资源:', errors);
    }

    return cleanedCount;
  }

  /**
   * 注册进程退出处理器
   */
  registerExitHandlers() {
    const exitHandler = () => {
      if (!this.isShuttingDown) {
        this.isShuttingDown = true;
        console.log('🔄 检测到进程退出，开始清理资源...');
        this.cleanupAll();
      }
    };

    // 注册各种退出信号
    process.on('exit', exitHandler);
    process.on('SIGINT', exitHandler);
    process.on('SIGTERM', exitHandler);
    process.on('SIGUSR1', exitHandler);
    process.on('SIGUSR2', exitHandler);
    
    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      console.error('❌ 未捕获的异常:', error);
      exitHandler();
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ 未处理的Promise拒绝:', reason);
      exitHandler();
      process.exit(1);
    });
  }

  /**
   * 启动定期清理任务
   * @param {number} interval - 清理间隔（毫秒）
   */
  startPeriodicCleanup(interval = 5 * 60 * 1000) { // 默认5分钟
    const cleanupTimer = setInterval(() => {
      if (!this.isShuttingDown) {
        this.cleanupOldResources();
      }
    }, interval);

    // 注册定时器资源
    this.register(ResourceType.TIMER, 'periodic-cleanup', cleanupTimer, (timer) => {
      clearInterval(timer);
    });

    console.log(`⏰ 启动定期清理任务，间隔: ${interval / 1000} 秒`);
  }
}

// 创建全局资源管理器实例
export const globalResourceManager = new ResourceManager();

// 启动定期清理
globalResourceManager.startPeriodicCleanup();

export default globalResourceManager;
