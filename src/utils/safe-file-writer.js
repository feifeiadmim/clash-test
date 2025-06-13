/**
 * 安全文件写入器
 * 集成原子性写入和文件锁机制，确保并发安全和数据完整性
 */

import { AtomicFileWriter } from './atomic-file-writer.js';
import { FileLockManager } from './file-lock-manager.js';
import { BaseError, ErrorTypes, ErrorSeverity } from '../parsers/common/error-handler.js';

/**
 * 文件处理错误类
 */
class FileProcessError extends BaseError {
  constructor(message, operation = null, filePath = null, details = null) {
    super(message, ErrorTypes.FILE_ERROR, details, ErrorSeverity.HIGH);
    this.operation = operation;
    this.filePath = filePath;
  }
}

/**
 * 安全文件写入器类
 * 结合原子性写入和文件锁，提供最高级别的文件写入安全性
 */
export class SafeFileWriter {
  constructor(options = {}) {
    this.atomicWriter = new AtomicFileWriter(options.atomic || {});
    this.lockManager = new FileLockManager(options.lock || {});
    
    this.options = {
      defaultLockTimeout: 30000,
      defaultLockPriority: 0,
      enableMetrics: true,
      ...options
    };

    // 写入统计
    this.stats = {
      totalWrites: 0,
      successfulWrites: 0,
      failedWrites: 0,
      lockTimeouts: 0,
      averageWriteTime: 0,
      averageLockWaitTime: 0
    };
  }

  /**
   * 安全写入文件（带锁保护的原子性写入）
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @param {Object} options - 写入选项
   * @returns {Promise<Object>} 写入结果
   */
  async writeFileSafe(filePath, content, options = {}) {
    const startTime = Date.now();
    this.stats.totalWrites++;

    const writeOptions = {
      lockTimeout: this.options.defaultLockTimeout,
      lockPriority: this.options.defaultLockPriority,
      ...options
    };

    let lockResult = null;

    try {
      // 获取文件锁
      const lockStartTime = Date.now();
      lockResult = await this.lockManager.acquireLock(filePath, {
        timeout: writeOptions.lockTimeout,
        priority: writeOptions.lockPriority,
        metadata: {
          operation: 'write',
          contentSize: Buffer.byteLength(content, 'utf8'),
          timestamp: new Date().toISOString()
        }
      });

      const lockWaitTime = Date.now() - lockStartTime;
      this.updateAverageLockWaitTime(lockWaitTime);

      // 执行原子性写入
      const writeResult = await this.atomicWriter.writeFileAtomic(
        filePath,
        content,
        writeOptions
      );

      // 更新统计
      const totalTime = Date.now() - startTime;
      this.updateAverageWriteTime(totalTime);
      this.stats.successfulWrites++;

      return {
        ...writeResult,
        lockInfo: {
          lockId: lockResult.lockId,
          lockWaitTime,
          lockAcquiredAt: lockResult.acquiredAt
        },
        timing: {
          totalTime,
          lockWaitTime,
          writeTime: totalTime - lockWaitTime
        }
      };

    } catch (error) {
      this.stats.failedWrites++;
      
      if (error.message.includes('超时')) {
        this.stats.lockTimeouts++;
      }

      throw new FileProcessError(
        `安全文件写入失败: ${error.message}`,
        filePath,
        {
          lockId: lockResult?.lockId,
          error: error.message,
          stats: this.getStats()
        }
      );
    } finally {
      // 确保释放锁
      if (lockResult) {
        lockResult.release();
      }
    }
  }

  /**
   * 批量安全写入
   * @param {Array} writeOperations - 写入操作数组
   * @param {Object} options - 批量写入选项
   * @returns {Promise<Object>} 批量写入结果
   */
  async batchWriteSafe(writeOperations, options = {}) {
    const batchOptions = {
      concurrency: 5,
      continueOnError: true,
      ...options
    };

    const results = [];
    const errors = [];
    const semaphore = new Semaphore(batchOptions.concurrency);

    const writePromises = writeOperations.map(async (operation, index) => {
      await semaphore.acquire();
      
      try {
        const result = await this.writeFileSafe(
          operation.filePath,
          operation.content,
          operation.options
        );
        
        results.push({
          index,
          filePath: operation.filePath,
          result
        });
      } catch (error) {
        const errorInfo = {
          index,
          filePath: operation.filePath,
          error: error.message
        };
        
        errors.push(errorInfo);
        
        if (!batchOptions.continueOnError) {
          throw error;
        }
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(writePromises);

    return {
      successful: results,
      failed: errors,
      totalCount: writeOperations.length,
      successCount: results.length,
      failureCount: errors.length,
      stats: this.getStats()
    };
  }

  /**
   * 带重试的安全写入
   * @param {string} filePath - 文件路径
   * @param {string} content - 内容
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 写入结果
   */
  async writeFileSafeWithRetry(filePath, content, options = {}) {
    const retryOptions = {
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2,
      ...options
    };

    let lastError;
    
    for (let attempt = 1; attempt <= retryOptions.maxRetries; attempt++) {
      try {
        return await this.writeFileSafe(filePath, content, {
          ...options,
          attempt
        });
      } catch (error) {
        lastError = error;
        
        if (attempt === retryOptions.maxRetries) {
          break;
        }

        const delay = retryOptions.retryDelay * Math.pow(retryOptions.backoffMultiplier, attempt - 1);
        console.warn(`写入失败，第${attempt}次重试 (${retryOptions.maxRetries}): ${error.message}`);
        console.warn(`等待 ${delay}ms 后重试...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * 检查文件写入状态
   * @param {string} filePath - 文件路径
   * @returns {Object} 文件状态
   */
  getFileStatus(filePath) {
    const lockStatus = this.lockManager.getLockStatus(filePath);
    
    return {
      ...lockStatus,
      canWrite: !lockStatus.isLocked,
      estimatedWaitTime: lockStatus.queueSize * this.stats.averageLockWaitTime
    };
  }

  /**
   * 更新平均写入时间
   * @private
   */
  updateAverageWriteTime(writeTime) {
    const alpha = 0.1;
    this.stats.averageWriteTime = this.stats.averageWriteTime * (1 - alpha) + writeTime * alpha;
  }

  /**
   * 更新平均锁等待时间
   * @private
   */
  updateAverageLockWaitTime(waitTime) {
    const alpha = 0.1;
    this.stats.averageLockWaitTime = this.stats.averageLockWaitTime * (1 - alpha) + waitTime * alpha;
  }

  /**
   * 获取写入统计
   */
  getStats() {
    return {
      ...this.stats,
      lockStats: this.lockManager.getStats(),
      successRate: this.stats.totalWrites > 0 ? 
        (this.stats.successfulWrites / this.stats.totalWrites * 100).toFixed(2) + '%' : '0%',
      timeoutRate: this.stats.totalWrites > 0 ?
        (this.stats.lockTimeouts / this.stats.totalWrites * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalWrites: 0,
      successfulWrites: 0,
      failedWrites: 0,
      lockTimeouts: 0,
      averageWriteTime: 0,
      averageLockWaitTime: 0
    };
  }

  /**
   * 销毁写入器
   */
  destroy() {
    this.lockManager.destroy();
  }
}

/**
 * 安全信号量类（用于控制并发，防止内存泄漏）
 */
class Semaphore {
  constructor(permits) {
    this.permits = permits;
    this.waiting = [];
    this.maxWaitingSize = 1000; // 最大等待队列大小
    this.timeouts = new Map(); // 超时管理
  }

  async acquire(timeout = 30000) {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    // 检查等待队列大小
    if (this.waiting.length >= this.maxWaitingSize) {
      throw new Error(`Semaphore waiting queue full: ${this.maxWaitingSize}`);
    }

    return new Promise((resolve, reject) => {
      const waitingItem = {
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.waiting.push(waitingItem);

      // 设置超时
      const timeoutId = setTimeout(() => {
        // 从等待队列中移除
        const index = this.waiting.indexOf(waitingItem);
        if (index !== -1) {
          this.waiting.splice(index, 1);
        }

        // 清理超时记录
        this.timeouts.delete(waitingItem);

        reject(new Error(`Semaphore acquire timeout after ${timeout}ms`));
      }, timeout);

      // 记录超时ID
      this.timeouts.set(waitingItem, timeoutId);
    });
  }

  release() {
    this.permits++;

    if (this.waiting.length > 0) {
      this.permits--;
      const waitingItem = this.waiting.shift();

      // 清理超时
      const timeoutId = this.timeouts.get(waitingItem);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.timeouts.delete(waitingItem);
      }

      waitingItem.resolve();
    }
  }

  /**
   * 清理过期的等待项
   */
  cleanup() {
    const now = Date.now();
    const maxWaitTime = 60000; // 1分钟最大等待时间

    const expiredItems = [];
    for (const item of this.waiting) {
      if (now - item.timestamp > maxWaitTime) {
        expiredItems.push(item);
      }
    }

    for (const item of expiredItems) {
      const index = this.waiting.indexOf(item);
      if (index !== -1) {
        this.waiting.splice(index, 1);
      }

      // 清理超时
      const timeoutId = this.timeouts.get(item);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.timeouts.delete(item);
      }

      // 拒绝过期的Promise
      item.reject(new Error('Semaphore acquire expired'));
    }
  }

  /**
   * 销毁信号量，清理所有资源
   */
  destroy() {
    // 清理所有超时
    for (const timeoutId of this.timeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.timeouts.clear();

    // 拒绝所有等待的Promise
    for (const item of this.waiting) {
      item.reject(new Error('Semaphore destroyed'));
    }
    this.waiting.length = 0;

    this.permits = 0;
  }
}

// 创建全局实例
export const globalSafeFileWriter = new SafeFileWriter();

// 导出便捷方法
export const writeFileSafe = (filePath, content, options) =>
  globalSafeFileWriter.writeFileSafe(filePath, content, options);

export const writeFileSafeWithRetry = (filePath, content, options) =>
  globalSafeFileWriter.writeFileSafeWithRetry(filePath, content, options);

export const batchWriteSafe = (writeOperations, options) =>
  globalSafeFileWriter.batchWriteSafe(writeOperations, options);

export const getFileWriteStatus = (filePath) =>
  globalSafeFileWriter.getFileStatus(filePath);

export const getFileWriteStats = () =>
  globalSafeFileWriter.getStats();
