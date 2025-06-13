/**
 * 批量处理优化器
 * 提供高性能的批量解析、验证和转换功能
 * 支持并行处理、进度监控和错误恢复
 */

import { ParserErrorHandler, ErrorTypes, ErrorSeverity } from './error-handler.js';
import { NodeValidator } from './validator.js';
import { CacheManager } from './cache.js';

/**
 * 批量处理配置
 */
export const BatchConfig = {
  DEFAULT_BATCH_SIZE: 100,
  DEFAULT_CONCURRENCY: 4,
  DEFAULT_TIMEOUT: 300000, // 5分钟（增加超时时间以处理大文件）
  MAX_BATCH_SIZE: 1000,
  MAX_CONCURRENCY: 16
};

/**
 * 批量处理结果类型
 */
export const BatchResultType = {
  SUCCESS: 'success',
  PARTIAL_SUCCESS: 'partial_success',
  FAILURE: 'failure'
};

/**
 * 批量处理器类
 */
export class BatchProcessor {
  constructor(options = {}) {
    this.batchSize = Math.min(options.batchSize || BatchConfig.DEFAULT_BATCH_SIZE, BatchConfig.MAX_BATCH_SIZE);
    this.concurrency = Math.min(options.concurrency || BatchConfig.DEFAULT_CONCURRENCY, BatchConfig.MAX_CONCURRENCY);
    this.timeout = options.timeout || BatchConfig.DEFAULT_TIMEOUT;
    this.enableCache = options.enableCache !== false;
    this.enableProgress = options.enableProgress !== false;

    // 统计信息
    this.stats = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      cached: 0,
      startTime: null,
      endTime: null
    };

    // 进度回调
    this.progressCallback = options.onProgress || null;
  }

  /**
   * 批量解析URL列表
   * @param {Array} urls - URL列表
   * @param {Object} parsers - 解析器映射 {protocol: parseFunction}
   * @returns {Promise<Object>} 批量处理结果
   */
  async batchParse(urls, parsers) {
    if (!Array.isArray(urls) || urls.length === 0) {
      throw new Error('URLs must be a non-empty array');
    }

    if (!parsers || typeof parsers !== 'object') {
      throw new Error('Parsers must be an object mapping protocols to parse functions');
    }

    this.resetStats();
    this.stats.startTime = Date.now();

    const results = {
      type: BatchResultType.SUCCESS,
      total: urls.length,
      successful: [],
      failed: [],
      errors: [],
      stats: null
    };

    try {
      // 分批处理
      const batches = this.createBatches(urls);
      let processedCount = 0;

      for (const batch of batches) {
        const batchResults = await this.processBatch(batch, (url) => this.parseUrl(url, parsers));

        // 合并结果
        results.successful.push(...batchResults.successful);
        results.failed.push(...batchResults.failed);
        results.errors.push(...batchResults.errors);

        processedCount += batch.length;

        // 更新进度
        if (this.enableProgress && this.progressCallback) {
          this.progressCallback({
            processed: processedCount,
            total: urls.length,
            percentage: (processedCount / urls.length * 100).toFixed(1)
          });
        }
      }

      // 确定结果类型
      if (results.failed.length === 0) {
        results.type = BatchResultType.SUCCESS;
      } else if (results.successful.length > 0) {
        results.type = BatchResultType.PARTIAL_SUCCESS;
      } else {
        results.type = BatchResultType.FAILURE;
      }

    } catch (error) {
      results.type = BatchResultType.FAILURE;
      results.errors.push({
        type: 'batch_error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      this.stats.endTime = Date.now();
      results.stats = this.getStats();
    }

    return results;
  }

  /**
   * 批量验证节点列表
   * @param {Array} nodes - 节点列表
   * @param {string} protocol - 协议名称（可选，如果节点包含type字段）
   * @returns {Promise<Object>} 批量验证结果
   */
  async batchValidate(nodes, protocol = null) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error('Nodes must be a non-empty array');
    }

    this.resetStats();
    this.stats.startTime = Date.now();

    const results = {
      type: BatchResultType.SUCCESS,
      total: nodes.length,
      valid: [],
      invalid: [],
      errors: [],
      stats: null
    };

    try {
      const batches = this.createBatches(nodes);
      let processedCount = 0;

      for (const batch of batches) {
        const batchResults = await this.processBatch(batch, (node) => this.validateNode(node, protocol));

        // 合并结果
        results.valid.push(...batchResults.successful);
        results.invalid.push(...batchResults.failed);
        results.errors.push(...batchResults.errors);

        processedCount += batch.length;

        // 更新进度
        if (this.enableProgress && this.progressCallback) {
          this.progressCallback({
            processed: processedCount,
            total: nodes.length,
            percentage: (processedCount / nodes.length * 100).toFixed(1)
          });
        }
      }

      // 确定结果类型
      if (results.invalid.length === 0) {
        results.type = BatchResultType.SUCCESS;
      } else if (results.valid.length > 0) {
        results.type = BatchResultType.PARTIAL_SUCCESS;
      } else {
        results.type = BatchResultType.FAILURE;
      }

    } catch (error) {
      results.type = BatchResultType.FAILURE;
      results.errors.push({
        type: 'batch_error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      this.stats.endTime = Date.now();
      results.stats = this.getStats();
    }

    return results;
  }

  /**
   * 批量转换节点格式
   * @param {Array} nodes - 节点列表
   * @param {Function} converter - 转换函数
   * @returns {Promise<Object>} 批量转换结果
   */
  async batchConvert(nodes, converter) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error('Nodes must be a non-empty array');
    }

    if (typeof converter !== 'function') {
      throw new Error('Converter must be a function');
    }

    this.resetStats();
    this.stats.startTime = Date.now();

    const results = {
      type: BatchResultType.SUCCESS,
      total: nodes.length,
      converted: [],
      failed: [],
      errors: [],
      stats: null
    };

    try {
      const batches = this.createBatches(nodes);
      let processedCount = 0;

      for (const batch of batches) {
        const batchResults = await this.processBatch(batch, converter);

        // 合并结果
        results.converted.push(...batchResults.successful);
        results.failed.push(...batchResults.failed);
        results.errors.push(...batchResults.errors);

        processedCount += batch.length;

        // 更新进度
        if (this.enableProgress && this.progressCallback) {
          this.progressCallback({
            processed: processedCount,
            total: nodes.length,
            percentage: (processedCount / nodes.length * 100).toFixed(1)
          });
        }
      }

      // 确定结果类型
      if (results.failed.length === 0) {
        results.type = BatchResultType.SUCCESS;
      } else if (results.converted.length > 0) {
        results.type = BatchResultType.PARTIAL_SUCCESS;
      } else {
        results.type = BatchResultType.FAILURE;
      }

    } catch (error) {
      results.type = BatchResultType.FAILURE;
      results.errors.push({
        type: 'batch_error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      this.stats.endTime = Date.now();
      results.stats = this.getStats();
    }

    return results;
  }

  /**
   * 创建批次
   * @param {Array} items - 要分批的项目
   * @returns {Array} 批次数组
   */
  createBatches(items) {
    const batches = [];
    for (let i = 0; i < items.length; i += this.batchSize) {
      batches.push(items.slice(i, i + this.batchSize));
    }
    return batches;
  }

  /**
   * 处理单个批次
   * @param {Array} batch - 批次数据
   * @param {Function} processor - 处理函数
   * @returns {Promise<Object>} 批次处理结果
   */
  async processBatch(batch, processor) {
    const results = {
      successful: [],
      failed: [],
      errors: []
    };

    // 创建并发任务
    const tasks = batch.map((item, index) =>
      this.processItem(item, index, processor)
    );

    // 限制并发数
    const chunks = this.createConcurrencyChunks(tasks);

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(chunk);

      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.successful.push(result.value.data);
            this.stats.successful++;
          } else {
            results.failed.push(result.value.data);
            this.stats.failed++;
          }
        } else {
          results.errors.push({
            type: 'processing_error',
            message: result.reason.message,
            index: index,
            timestamp: new Date().toISOString()
          });
          this.stats.failed++;
        }
        this.stats.totalProcessed++;
      });
    }

    return results;
  }

  /**
   * 处理单个项目
   * @param {any} item - 要处理的项目
   * @param {number} index - 项目索引
   * @param {Function} processor - 处理函数
   * @returns {Promise<Object>} 处理结果
   */
  async processItem(item, index, processor) {
    try {
      const result = await Promise.race([
        processor(item),
        this.createTimeoutPromise()
      ]);

      if (result !== null && result !== undefined) {
        return { success: true, data: { item, result, index } };
      } else {
        return { success: false, data: { item, error: 'Processing returned null/undefined', index } };
      }
    } catch (error) {
      return { success: false, data: { item, error: error.message, index } };
    }
  }

  /**
   * 创建超时Promise
   * @returns {Promise} 超时Promise
   */
  createTimeoutPromise() {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Processing timeout')), this.timeout);
    });
  }

  /**
   * 创建并发控制块
   * @param {Array} tasks - 任务数组
   * @returns {Array} 并发控制块数组
   */
  createConcurrencyChunks(tasks) {
    const chunks = [];
    for (let i = 0; i < tasks.length; i += this.concurrency) {
      chunks.push(tasks.slice(i, i + this.concurrency));
    }
    return chunks;
  }

  /**
   * 解析单个URL
   * @param {string} url - URL
   * @param {Object} parsers - 解析器映射
   * @returns {Object|null} 解析结果
   */
  parseUrl(url, parsers) {
    try {
      // 检测协议
      const protocol = this.detectProtocol(url);
      if (!protocol || !parsers[protocol]) {
        throw new Error(`Unsupported protocol: ${protocol}`);
      }

      // 使用对应的解析器
      return parsers[protocol](url);
    } catch (error) {
      ParserErrorHandler.logError('BATCH', 'parse', error, { url });
      return null;
    }
  }

  /**
   * 验证单个节点
   * @param {Object} node - 节点对象
   * @param {string} protocol - 协议名称
   * @returns {Object|null} 验证结果
   */
  validateNode(node, protocol) {
    try {
      const nodeProtocol = protocol || node.type;
      if (!nodeProtocol) {
        throw new Error('Protocol not specified and node.type is missing');
      }

      const validation = NodeValidator.validateNode(node, nodeProtocol.toUpperCase());
      return validation.isValid ? node : null;
    } catch (error) {
      ParserErrorHandler.logError('BATCH', 'validate', error, { node });
      return null;
    }
  }

  /**
   * 检测URL协议
   * @param {string} url - URL
   * @returns {string|null} 协议名称
   */
  detectProtocol(url) {
    if (!url || typeof url !== 'string') return null;

    const protocolMatch = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
    if (!protocolMatch) return null;

    const protocol = protocolMatch[1].toLowerCase();

    // 协议映射
    const protocolMap = {
      'ss': 'shadowsocks',
      'vmess': 'vmess',
      'vless': 'vless',
      'trojan': 'trojan',
      'hysteria2': 'hysteria2',
      'hy2': 'hysteria2'
    };

    return protocolMap[protocol] || protocol;
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      cached: 0,
      startTime: null,
      endTime: null
    };
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const duration = this.stats.endTime - this.stats.startTime;
    return {
      ...this.stats,
      duration,
      throughput: duration > 0 ? (this.stats.totalProcessed / duration * 1000).toFixed(2) : 0,
      successRate: this.stats.totalProcessed > 0 ?
        (this.stats.successful / this.stats.totalProcessed * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * 处理单个批次
   * @param {Array} batch - 批次数据
   * @param {Function} processor - 处理函数
   * @returns {Promise<Object>} 批次处理结果
   */
  async processBatch(batch, processor) {
    const results = {
      successful: [],
      failed: [],
      errors: []
    };

    // 创建并发任务
    const tasks = batch.map((item, index) =>
      this.processItem(item, index, processor)
    );

    // 限制并发数
    const chunks = this.createConcurrencyChunks(tasks);

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(chunk);

      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.successful.push(result.value.data);
            this.stats.successful++;
          } else {
            results.failed.push(result.value.data);
            this.stats.failed++;
          }
        } else {
          results.errors.push({
            type: 'processing_error',
            message: result.reason.message,
            index: index,
            timestamp: new Date().toISOString()
          });
          this.stats.failed++;
        }
        this.stats.totalProcessed++;
      });
    }

    return results;
  }

  /**
   * 处理单个项目
   * @param {any} item - 要处理的项目
   * @param {number} index - 项目索引
   * @param {Function} processor - 处理函数
   * @returns {Promise<Object>} 处理结果
   */
  async processItem(item, index, processor) {
    try {
      const result = await Promise.race([
        processor(item),
        this.createTimeoutPromise()
      ]);

      if (result !== null && result !== undefined) {
        return { success: true, data: { item, result, index } };
      } else {
        return { success: false, data: { item, error: 'Processing returned null/undefined', index } };
      }
    } catch (error) {
      return { success: false, data: { item, error: error.message, index } };
    }
  }

  /**
   * 创建超时Promise
   * @returns {Promise} 超时Promise
   */
  createTimeoutPromise() {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Processing timeout')), this.timeout);
    });
  }

  /**
   * 创建并发控制块
   * @param {Array} tasks - 任务数组
   * @returns {Array} 并发控制块数组
   */
  createConcurrencyChunks(tasks) {
    const chunks = [];
    for (let i = 0; i < tasks.length; i += this.concurrency) {
      chunks.push(tasks.slice(i, i + this.concurrency));
    }
    return chunks;
  }

  /**
   * 解析单个URL
   * @param {string} url - URL
   * @param {Object} parsers - 解析器映射
   * @returns {Object|null} 解析结果
   */
  parseUrl(url, parsers) {
    try {
      // 检测协议
      const protocol = this.detectProtocol(url);
      if (!protocol || !parsers[protocol]) {
        throw new Error(`Unsupported protocol: ${protocol}`);
      }

      // 使用对应的解析器
      return parsers[protocol](url);
    } catch (error) {
      ParserErrorHandler.logError('BATCH', 'parse', error, { url });
      return null;
    }
  }

  /**
   * 验证单个节点
   * @param {Object} node - 节点对象
   * @param {string} protocol - 协议名称
   * @returns {Object|null} 验证结果
   */
  validateNode(node, protocol) {
    try {
      const nodeProtocol = protocol || node.type;
      if (!nodeProtocol) {
        throw new Error('Protocol not specified and node.type is missing');
      }

      const validation = NodeValidator.validateNode(node, nodeProtocol.toUpperCase());
      return validation.isValid ? node : null;
    } catch (error) {
      ParserErrorHandler.logError('BATCH', 'validate', error, { node });
      return null;
    }
  }

  /**
   * 检测URL协议
   * @param {string} url - URL
   * @returns {string|null} 协议名称
   */
  detectProtocol(url) {
    if (!url || typeof url !== 'string') return null;

    const protocolMatch = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
    if (!protocolMatch) return null;

    const protocol = protocolMatch[1].toLowerCase();

    // 协议映射
    const protocolMap = {
      'ss': 'shadowsocks',
      'vmess': 'vmess',
      'vless': 'vless',
      'trojan': 'trojan',
      'hysteria2': 'hysteria2',
      'hy2': 'hysteria2'
    };

    return protocolMap[protocol] || protocol;
  }
}

// 导出便捷函数
export const batchParse = (urls, parsers, options = {}) => {
  const processor = new BatchProcessor(options);
  return processor.batchParse(urls, parsers);
};

export const batchValidate = (nodes, protocol, options = {}) => {
  const processor = new BatchProcessor(options);
  return processor.batchValidate(nodes, protocol);
};

export const batchConvert = (nodes, converter, options = {}) => {
  const processor = new BatchProcessor(options);
  return processor.batchConvert(nodes, converter);
};


