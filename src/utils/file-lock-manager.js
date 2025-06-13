/**
 * 文件级写入锁管理器
 * 防止并发写入同一文件导致的数据竞争和损坏
 * 支持超时、优先级队列和死锁检测
 */

import path from 'path';
import { EventEmitter } from 'events';

/**
 * 文件锁类
 */
export class FileLock {
  constructor(filePath, lockId, options = {}) {
    this.filePath = path.resolve(filePath);
    this.lockId = lockId;
    this.acquiredAt = Date.now();
    this.timeout = options.timeout || 30000; // 30秒默认超时
    this.priority = options.priority || 0;
    this.metadata = options.metadata || {};
    this.released = false;
  }

  /**
   * 释放锁
   */
  release() {
    if (!this.released) {
      this.released = true;
      this.releasedAt = Date.now();
      return true;
    }
    return false;
  }

  /**
   * 检查锁是否已超时
   */
  isExpired() {
    return Date.now() - this.acquiredAt > this.timeout;
  }

  /**
   * 获取锁的持有时间
   */
  getHoldTime() {
    const endTime = this.released ? this.releasedAt : Date.now();
    return endTime - this.acquiredAt;
  }
}

/**
 * 文件锁管理器类
 */
export class FileLockManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      defaultTimeout: 30000,      // 默认锁超时时间
      cleanupInterval: 5000,      // 清理间隔
      maxQueueSize: 100,          // 最大队列大小
      enableDeadlockDetection: true, // 启用死锁检测
      deadlockCheckInterval: 10000,  // 死锁检测间隔
      ...options
    };

    // 当前持有的锁 Map<filePath, FileLock>
    this.activeLocks = new Map();
    
    // 等待队列 Map<filePath, Array<QueueItem>>
    this.waitingQueues = new Map();
    
    // 锁统计信息
    this.stats = {
      totalLocks: 0,
      activeLocks: 0,
      queuedRequests: 0,
      timeouts: 0,
      deadlocks: 0,
      averageWaitTime: 0
    };

    // 启动清理定时器
    this.startCleanupTimer();
    
    // 启动死锁检测
    if (this.options.enableDeadlockDetection) {
      this.startDeadlockDetection();
    }
  }

  /**
   * 获取文件锁
   * @param {string} filePath - 文件路径
   * @param {Object} options - 锁选项
   * @returns {Promise<Object>} 锁对象和释放函数
   */
  async acquireLock(filePath, options = {}) {
    const normalizedPath = path.resolve(filePath);
    const lockOptions = { ...this.options, ...options };
    const lockId = this.generateLockId();
    const requestTime = Date.now();

    // 检查队列大小限制
    if (this.getQueueSize(normalizedPath) >= this.options.maxQueueSize) {
      throw new Error(`文件锁队列已满: ${normalizedPath}`);
    }

    // 如果文件当前没有锁，直接获取
    if (!this.activeLocks.has(normalizedPath)) {
      return this.grantLock(normalizedPath, lockId, lockOptions);
    }

    // 文件已被锁定，加入等待队列
    return this.queueLockRequest(normalizedPath, lockId, lockOptions, requestTime);
  }

  /**
   * 直接授予锁
   * @private
   */
  grantLock(filePath, lockId, options) {
    const lock = new FileLock(filePath, lockId, options);
    this.activeLocks.set(filePath, lock);
    this.stats.totalLocks++;
    this.stats.activeLocks++;

    const releaseFunction = () => {
      return this.releaseLock(filePath, lockId);
    };

    this.emit('lock:acquired', {
      filePath,
      lockId,
      acquiredAt: lock.acquiredAt
    });

    return {
      lock,
      release: releaseFunction,
      filePath,
      lockId,
      acquiredAt: lock.acquiredAt
    };
  }

  /**
   * 将锁请求加入队列
   * @private
   */
  queueLockRequest(filePath, lockId, options, requestTime) {
    return new Promise((resolve, reject) => {
      const queueItem = {
        lockId,
        options,
        requestTime,
        resolve,
        reject,
        timeout: null
      };

      // 设置超时
      if (options.timeout > 0) {
        queueItem.timeout = setTimeout(() => {
          this.removeFromQueue(filePath, lockId);
          this.stats.timeouts++;
          reject(new Error(`获取文件锁超时: ${filePath}`));
        }, options.timeout);
      }

      // 添加到队列
      if (!this.waitingQueues.has(filePath)) {
        this.waitingQueues.set(filePath, []);
      }

      const queue = this.waitingQueues.get(filePath);
      
      // 按优先级插入队列
      const insertIndex = this.findInsertPosition(queue, options.priority || 0);
      queue.splice(insertIndex, 0, queueItem);
      
      this.stats.queuedRequests++;

      this.emit('lock:queued', {
        filePath,
        lockId,
        queuePosition: insertIndex,
        queueSize: queue.length
      });
    });
  }

  /**
   * 查找插入位置（按优先级排序）
   * @private
   */
  findInsertPosition(queue, priority) {
    for (let i = 0; i < queue.length; i++) {
      if ((queue[i].options.priority || 0) < priority) {
        return i;
      }
    }
    return queue.length;
  }

  /**
   * 释放文件锁
   * @param {string} filePath - 文件路径
   * @param {string} lockId - 锁ID
   * @returns {boolean} 是否成功释放
   */
  releaseLock(filePath, lockId) {
    const normalizedPath = path.resolve(filePath);
    const lock = this.activeLocks.get(normalizedPath);

    if (!lock || lock.lockId !== lockId) {
      return false;
    }

    // 释放锁
    lock.release();
    this.activeLocks.delete(normalizedPath);
    this.stats.activeLocks--;

    this.emit('lock:released', {
      filePath: normalizedPath,
      lockId,
      holdTime: lock.getHoldTime()
    });

    // 处理等待队列
    this.processWaitingQueue(normalizedPath);

    return true;
  }

  /**
   * 处理等待队列
   * @private
   */
  processWaitingQueue(filePath) {
    const queue = this.waitingQueues.get(filePath);
    
    if (!queue || queue.length === 0) {
      return;
    }

    // 取出队列中的第一个请求
    const nextRequest = queue.shift();
    this.stats.queuedRequests--;

    // 清除超时定时器
    if (nextRequest.timeout) {
      clearTimeout(nextRequest.timeout);
    }

    // 计算等待时间
    const waitTime = Date.now() - nextRequest.requestTime;
    this.updateAverageWaitTime(waitTime);

    // 授予锁
    try {
      const lockResult = this.grantLock(filePath, nextRequest.lockId, nextRequest.options);
      nextRequest.resolve(lockResult);
    } catch (error) {
      nextRequest.reject(error);
    }

    // 如果队列为空，删除队列
    if (queue.length === 0) {
      this.waitingQueues.delete(filePath);
    }
  }

  /**
   * 从队列中移除请求
   * @private
   */
  removeFromQueue(filePath, lockId) {
    const queue = this.waitingQueues.get(filePath);
    if (!queue) return false;

    const index = queue.findIndex(item => item.lockId === lockId);
    if (index !== -1) {
      const item = queue[index];
      if (item.timeout) {
        clearTimeout(item.timeout);
      }
      queue.splice(index, 1);
      this.stats.queuedRequests--;
      
      if (queue.length === 0) {
        this.waitingQueues.delete(filePath);
      }
      return true;
    }
    return false;
  }

  /**
   * 获取队列大小
   * @private
   */
  getQueueSize(filePath) {
    const queue = this.waitingQueues.get(filePath);
    return queue ? queue.length : 0;
  }

  /**
   * 生成锁ID
   * @private
   */
  generateLockId() {
    return `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${process.pid}`;
  }

  /**
   * 更新平均等待时间
   * @private
   */
  updateAverageWaitTime(waitTime) {
    const alpha = 0.1; // 指数移动平均的平滑因子
    this.stats.averageWaitTime = this.stats.averageWaitTime * (1 - alpha) + waitTime * alpha;
  }

  /**
   * 启动清理定时器
   * @private
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredLocks();
    }, this.options.cleanupInterval);
  }

  /**
   * 清理过期锁
   * @private
   */
  cleanupExpiredLocks() {
    const expiredLocks = [];
    
    for (const [filePath, lock] of this.activeLocks.entries()) {
      if (lock.isExpired()) {
        expiredLocks.push({ filePath, lock });
      }
    }

    for (const { filePath, lock } of expiredLocks) {
      console.warn(`清理过期锁: ${filePath} (持有时间: ${lock.getHoldTime()}ms)`);
      this.releaseLock(filePath, lock.lockId);
      this.stats.timeouts++;
    }
  }

  /**
   * 启动死锁检测
   * @private
   */
  startDeadlockDetection() {
    this.deadlockTimer = setInterval(() => {
      this.detectDeadlocks();
    }, this.options.deadlockCheckInterval);
  }

  /**
   * 检测死锁
   * @private
   */
  detectDeadlocks() {
    // 简单的死锁检测：检查长时间等待的请求
    const now = Date.now();
    const deadlockThreshold = this.options.deadlockCheckInterval * 3;

    for (const [filePath, queue] of this.waitingQueues.entries()) {
      for (const item of queue) {
        if (now - item.requestTime > deadlockThreshold) {
          console.warn(`检测到可能的死锁: ${filePath}, 等待时间: ${now - item.requestTime}ms`);
          this.stats.deadlocks++;
          
          this.emit('deadlock:detected', {
            filePath,
            lockId: item.lockId,
            waitTime: now - item.requestTime
          });
        }
      }
    }
  }

  /**
   * 获取锁统计信息
   */
  getStats() {
    return {
      ...this.stats,
      activeLocks: this.activeLocks.size,
      queuedRequests: Array.from(this.waitingQueues.values())
        .reduce((total, queue) => total + queue.length, 0)
    };
  }

  /**
   * 获取锁状态
   */
  getLockStatus(filePath) {
    const normalizedPath = path.resolve(filePath);
    const lock = this.activeLocks.get(normalizedPath);
    const queue = this.waitingQueues.get(normalizedPath);

    return {
      isLocked: !!lock,
      lock: lock ? {
        lockId: lock.lockId,
        acquiredAt: lock.acquiredAt,
        holdTime: lock.getHoldTime(),
        isExpired: lock.isExpired()
      } : null,
      queueSize: queue ? queue.length : 0,
      queue: queue ? queue.map(item => ({
        lockId: item.lockId,
        requestTime: item.requestTime,
        waitTime: Date.now() - item.requestTime,
        priority: item.options.priority || 0
      })) : []
    };
  }

  /**
   * 强制释放所有锁
   */
  releaseAllLocks() {
    const releasedLocks = [];
    
    for (const [filePath, lock] of this.activeLocks.entries()) {
      if (this.releaseLock(filePath, lock.lockId)) {
        releasedLocks.push(filePath);
      }
    }

    return releasedLocks;
  }

  /**
   * 销毁锁管理器
   */
  destroy() {
    // 清理定时器
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    if (this.deadlockTimer) {
      clearInterval(this.deadlockTimer);
    }

    // 释放所有锁
    this.releaseAllLocks();

    // 清理等待队列
    for (const queue of this.waitingQueues.values()) {
      for (const item of queue) {
        if (item.timeout) {
          clearTimeout(item.timeout);
        }
        item.reject(new Error('锁管理器已销毁'));
      }
    }

    this.waitingQueues.clear();
    this.removeAllListeners();
  }
}

// 创建全局实例
export const globalFileLockManager = new FileLockManager();

// 导出便捷方法
export const acquireFileLock = (filePath, options) =>
  globalFileLockManager.acquireLock(filePath, options);

export const getFileLockStatus = (filePath) =>
  globalFileLockManager.getLockStatus(filePath);

export const getFileLockStats = () =>
  globalFileLockManager.getStats();
