/**
 * 智能日志管理器
 * 支持日志级别控制、文件轮转、性能优化
 */

import fs from 'fs';
import path from 'path';

/**
 * 日志级别枚举
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

/**
 * 日志级别名称映射
 */
const LOG_LEVEL_NAMES = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL'
};

/**
 * 智能日志管理器
 */
export class SmartLogger {
  constructor(options = {}) {
    this.options = {
      level: LogLevel.INFO,
      enableFileLogging: false,
      logDir: './logs',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      enableRotation: true,
      enableConsole: true,
      enablePerformanceLog: false,
      errorLogSeparate: true,
      ...options
    };

    this.stats = {
      totalLogs: 0,
      errorCount: 0,
      warnCount: 0,
      lastLogTime: null,
      logRateLimit: new Map() // 日志频率限制
    };

    this.initializeLogger();
  }

  /**
   * 初始化日志器
   */
  initializeLogger() {
    if (this.options.enableFileLogging) {
      this.ensureLogDirectory();
    }
  }

  /**
   * 确保日志目录存在
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.options.logDir)) {
      fs.mkdirSync(this.options.logDir, { recursive: true });
    }
  }

  /**
   * 检查是否应该记录日志
   * @param {number} level - 日志级别
   * @returns {boolean} 是否应该记录
   */
  shouldLog(level) {
    return level >= this.options.level;
  }

  /**
   * 频率限制检查
   * @param {string} key - 日志键
   * @param {number} maxPerMinute - 每分钟最大次数
   * @returns {boolean} 是否允许记录
   */
  checkRateLimit(key, maxPerMinute = 60) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const rateKey = `${key}_${minute}`;
    
    const count = this.stats.logRateLimit.get(rateKey) || 0;
    if (count >= maxPerMinute) {
      return false;
    }
    
    this.stats.logRateLimit.set(rateKey, count + 1);
    
    // 清理过期的频率限制记录
    if (this.stats.logRateLimit.size > 1000) {
      const cutoff = minute - 2; // 保留最近2分钟
      for (const [key] of this.stats.logRateLimit) {
        if (key.endsWith(`_${cutoff}`) || key.endsWith(`_${cutoff - 1}`)) {
          this.stats.logRateLimit.delete(key);
        }
      }
    }
    
    return true;
  }

  /**
   * 格式化日志消息
   * @param {number} level - 日志级别
   * @param {string} message - 消息
   * @param {Object} context - 上下文
   * @returns {string} 格式化后的消息
   */
  formatMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level];
    const contextStr = Object.keys(context).length > 0 ? 
      ` [${JSON.stringify(context)}]` : '';
    
    return `[${timestamp}] [${levelName}] ${message}${contextStr}`;
  }

  /**
   * 写入文件日志
   * @param {string} formattedMessage - 格式化的消息
   * @param {number} level - 日志级别
   */
  writeToFile(formattedMessage, level) {
    if (!this.options.enableFileLogging) return;

    try {
      const filename = this.options.errorLogSeparate && level >= LogLevel.ERROR ?
        'error.log' : 'app.log';
      const filepath = path.join(this.options.logDir, filename);
      
      // 检查文件大小并轮转
      if (this.options.enableRotation && fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        if (stats.size > this.options.maxFileSize) {
          this.rotateLogFile(filepath);
        }
      }
      
      fs.appendFileSync(filepath, formattedMessage + '\n');
    } catch (error) {
      // 文件日志失败时输出到控制台
      console.error('日志写入失败:', error.message);
    }
  }

  /**
   * 轮转日志文件
   * @param {string} filepath - 文件路径
   */
  rotateLogFile(filepath) {
    try {
      const dir = path.dirname(filepath);
      const basename = path.basename(filepath, path.extname(filepath));
      const ext = path.extname(filepath);
      
      // 移动现有文件
      for (let i = this.options.maxFiles - 1; i >= 1; i--) {
        const oldFile = path.join(dir, `${basename}.${i}${ext}`);
        const newFile = path.join(dir, `${basename}.${i + 1}${ext}`);
        
        if (fs.existsSync(oldFile)) {
          if (i === this.options.maxFiles - 1) {
            fs.unlinkSync(oldFile); // 删除最老的文件
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }
      
      // 重命名当前文件
      const rotatedFile = path.join(dir, `${basename}.1${ext}`);
      fs.renameSync(filepath, rotatedFile);
    } catch (error) {
      console.error('日志轮转失败:', error.message);
    }
  }

  /**
   * 记录日志
   * @param {number} level - 日志级别
   * @param {string} message - 消息
   * @param {Object} context - 上下文
   * @param {Object} options - 选项
   */
  log(level, message, context = {}, options = {}) {
    if (!this.shouldLog(level)) return;

    // 频率限制检查
    const rateKey = options.rateKey || message.substring(0, 50);
    if (options.rateLimit && !this.checkRateLimit(rateKey, options.rateLimit)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, context);
    
    // 控制台输出
    if (this.options.enableConsole) {
      const consoleMethod = this.getConsoleMethod(level);
      consoleMethod(formattedMessage);
    }
    
    // 文件输出
    this.writeToFile(formattedMessage, level);
    
    // 更新统计
    this.updateStats(level);
  }

  /**
   * 获取控制台输出方法
   * @param {number} level - 日志级别
   * @returns {Function} 控制台方法
   */
  getConsoleMethod(level) {
    switch (level) {
      case LogLevel.DEBUG:
        return console.debug;
      case LogLevel.INFO:
        return console.info;
      case LogLevel.WARN:
        return console.warn;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        return console.error;
      default:
        return console.log;
    }
  }

  /**
   * 更新统计信息
   * @param {number} level - 日志级别
   */
  updateStats(level) {
    this.stats.totalLogs++;
    this.stats.lastLogTime = Date.now();
    
    if (level >= LogLevel.ERROR) {
      this.stats.errorCount++;
    } else if (level === LogLevel.WARN) {
      this.stats.warnCount++;
    }
  }

  /**
   * 便捷方法
   */
  debug(message, context, options) {
    this.log(LogLevel.DEBUG, message, context, options);
  }

  info(message, context, options) {
    this.log(LogLevel.INFO, message, context, options);
  }

  warn(message, context, options) {
    this.log(LogLevel.WARN, message, context, options);
  }

  error(message, context, options) {
    this.log(LogLevel.ERROR, message, context, options);
  }

  fatal(message, context, options) {
    this.log(LogLevel.FATAL, message, context, options);
  }

  /**
   * 性能日志
   * @param {string} operation - 操作名称
   * @param {number} duration - 持续时间（毫秒）
   * @param {Object} context - 上下文
   */
  performance(operation, duration, context = {}) {
    if (!this.options.enablePerformanceLog) return;
    
    this.info(`Performance: ${operation}`, {
      duration: `${duration}ms`,
      ...context
    }, { rateKey: `perf_${operation}`, rateLimit: 10 });
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 设置日志级别
   * @param {number} level - 新的日志级别
   */
  setLevel(level) {
    this.options.level = level;
    this.info(`日志级别设置为: ${LOG_LEVEL_NAMES[level]}`);
  }

  /**
   * 清理资源
   */
  cleanup() {
    // 清理频率限制缓存
    this.stats.logRateLimit.clear();
  }
}

// 创建全局日志实例
export const globalLogger = new SmartLogger({
  level: process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.INFO,
  enableFileLogging: process.env.NODE_ENV === 'production',
  enablePerformanceLog: process.env.NODE_ENV === 'development'
});

export default globalLogger;
