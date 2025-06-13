/**
 * 全局监听器管理器
 * 避免重复添加进程监听器，防止内存泄漏警告
 */

/**
 * 监听器管理器
 */
export class ListenerManager {
  constructor() {
    this.listeners = new Map();
    this.setupComplete = false;
  }

  /**
   * 添加进程监听器
   * @param {string} event - 事件名称
   * @param {Function} handler - 处理函数
   * @param {string} source - 来源标识
   */
  addProcessListener(event, handler, source = 'unknown') {
    const key = `${event}:${source}`;
    
    // 避免重复添加
    if (this.listeners.has(key)) {
      return;
    }

    // 包装处理函数以便追踪
    const wrappedHandler = (...args) => {
      try {
        handler(...args);
      } catch (error) {
        console.error(`监听器错误 [${source}]:`, error);
      }
    };

    process.on(event, wrappedHandler);
    this.listeners.set(key, {
      event,
      handler: wrappedHandler,
      source,
      originalHandler: handler
    });

    console.debug(`✅ 添加监听器: ${event} (${source})`);
  }

  /**
   * 移除进程监听器
   * @param {string} event - 事件名称
   * @param {string} source - 来源标识
   */
  removeProcessListener(event, source = 'unknown') {
    const key = `${event}:${source}`;
    const listenerInfo = this.listeners.get(key);

    if (listenerInfo) {
      process.removeListener(event, listenerInfo.handler);
      this.listeners.delete(key);
      console.debug(`🗑️ 移除监听器: ${event} (${source})`);
    }
  }

  /**
   * 设置通用的进程监听器
   */
  setupCommonListeners() {
    if (this.setupComplete) return;

    // 增加最大监听器数量限制
    process.setMaxListeners(20);

    // 进程退出清理
    this.addProcessListener('exit', () => {
      this.cleanup();
    }, 'global-cleanup');

    // 进程中断信号
    this.addProcessListener('SIGINT', () => {
      console.log('\n🛑 收到中断信号，正在清理...');
      this.cleanup();
      process.exit(0);
    }, 'sigint-handler');

    // 进程终止信号
    this.addProcessListener('SIGTERM', () => {
      console.log('\n🛑 收到终止信号，正在清理...');
      this.cleanup();
      process.exit(0);
    }, 'sigterm-handler');

    this.setupComplete = true;
    console.log('📋 全局监听器管理器已初始化');
  }

  /**
   * 清理所有监听器
   */
  cleanup() {
    console.log('🧹 清理所有监听器...');
    
    for (const [key, listenerInfo] of this.listeners.entries()) {
      if (listenerInfo.source !== 'global-cleanup') {
        process.removeListener(listenerInfo.event, listenerInfo.handler);
      }
    }
    
    this.listeners.clear();
    this.setupComplete = false;
  }

  /**
   * 获取监听器统计信息
   */
  getStats() {
    const stats = {
      total: this.listeners.size,
      byEvent: {},
      bySource: {}
    };

    for (const [key, listenerInfo] of this.listeners.entries()) {
      // 按事件统计
      if (!stats.byEvent[listenerInfo.event]) {
        stats.byEvent[listenerInfo.event] = 0;
      }
      stats.byEvent[listenerInfo.event]++;

      // 按来源统计
      if (!stats.bySource[listenerInfo.source]) {
        stats.bySource[listenerInfo.source] = 0;
      }
      stats.bySource[listenerInfo.source]++;
    }

    return stats;
  }

  /**
   * 打印监听器状态
   */
  printStatus() {
    const stats = this.getStats();
    console.log('📊 监听器状态:');
    console.log(`  总数: ${stats.total}`);
    console.log('  按事件分布:', stats.byEvent);
    console.log('  按来源分布:', stats.bySource);
  }
}

// 创建全局实例
export const globalListenerManager = new ListenerManager();

// 自动设置通用监听器
globalListenerManager.setupCommonListeners();

// 导出便捷方法
export const addProcessListener = (event, handler, source) => 
  globalListenerManager.addProcessListener(event, handler, source);

export const removeProcessListener = (event, source) => 
  globalListenerManager.removeProcessListener(event, source);

export const getListenerStats = () => globalListenerManager.getStats();

export const printListenerStatus = () => globalListenerManager.printStatus();
