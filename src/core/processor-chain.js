/**
 * 处理器链系统
 * 借鉴Sub-Store的责任链模式，支持链式处理节点
 */

/**
 * 处理器基类
 */
export class BaseProcessor {
  constructor(name, type = 'operator') {
    this.name = name;
    this.type = type; // 'filter' | 'operator' | 'transformer'
    this.disabled = false;
    this.required = false;
  }

  /**
   * 处理节点数组
   * @param {Object[]} nodes - 节点数组
   * @param {Object} context - 处理上下文
   * @returns {Promise<Object[]>} 处理后的节点数组
   */
  async process(nodes, context = {}) {
    throw new Error('Processor process method must be implemented');
  }

  /**
   * 启用处理器
   */
  enable() {
    this.disabled = false;
    return this;
  }

  /**
   * 禁用处理器
   */
  disable() {
    this.disabled = true;
    return this;
  }

  /**
   * 设置为必需处理器
   */
  setRequired(required = true) {
    this.required = required;
    return this;
  }
}

/**
 * 处理器链管理器
 */
export class ProcessorChain {
  constructor() {
    this.processors = [];
    this.stats = {
      totalProcessed: 0,
      successfulProcessors: 0,
      failedProcessors: 0,
      processingTime: 0
    };
  }

  /**
   * 添加处理器
   * @param {BaseProcessor} processor - 处理器实例
   * @returns {ProcessorChain} 返回自身，支持链式调用
   */
  add(processor) {
    if (!(processor instanceof BaseProcessor)) {
      throw new Error('Processor must extend BaseProcessor');
    }
    
    this.processors.push(processor);
    console.log(`🔧 添加处理器: ${processor.name} (${processor.type})`);
    return this;
  }

  /**
   * 移除处理器
   * @param {string} name - 处理器名称
   * @returns {ProcessorChain} 返回自身
   */
  remove(name) {
    const index = this.processors.findIndex(p => p.name === name);
    if (index !== -1) {
      this.processors.splice(index, 1);
      console.log(`🗑️ 移除处理器: ${name}`);
    }
    return this;
  }

  /**
   * 执行处理器链
   * @param {Object[]} nodes - 初始节点数组
   * @param {Object} context - 处理上下文
   * @returns {Promise<Object[]>} 处理后的节点数组
   */
  async process(nodes, context = {}) {
    const startTime = Date.now();
    let result = [...nodes];
    
    this.stats.totalProcessed++;
    
    console.log(`🔄 开始处理器链，初始节点数: ${result.length}`);

    for (const processor of this.processors) {
      if (processor.disabled) {
        console.log(`⏭️ 跳过已禁用的处理器: ${processor.name}`);
        continue;
      }

      const processorStartTime = Date.now();
      const beforeCount = result.length;

      try {
        result = await this.applyProcessor(processor, result, context);
        const afterCount = result.length;
        const processingTime = Date.now() - processorStartTime;

        console.log(`✅ ${processor.name}: ${beforeCount} → ${afterCount} (${processingTime}ms)`);
        this.stats.successfulProcessors++;

      } catch (error) {
        const processingTime = Date.now() - processorStartTime;
        console.error(`❌ ${processor.name} 处理失败 (${processingTime}ms):`, error.message);
        
        this.stats.failedProcessors++;
        
        if (processor.required) {
          throw new Error(`必需处理器 ${processor.name} 失败: ${error.message}`);
        }
      }
    }

    this.stats.processingTime = Date.now() - startTime;
    console.log(`🎉 处理器链完成，最终节点数: ${result.length}，总耗时: ${this.stats.processingTime}ms`);

    return result;
  }

  /**
   * 应用单个处理器
   * @param {BaseProcessor} processor - 处理器
   * @param {Object[]} nodes - 节点数组
   * @param {Object} context - 处理上下文
   * @returns {Promise<Object[]>} 处理后的节点数组
   */
  async applyProcessor(processor, nodes, context) {
    // 根据处理器类型选择不同的处理方式
    switch (processor.type) {
      case 'filter':
        return await this.applyFilter(processor, nodes, context);
      case 'operator':
        return await this.applyOperator(processor, nodes, context);
      case 'transformer':
        return await this.applyTransformer(processor, nodes, context);
      default:
        return await processor.process(nodes, context);
    }
  }

  /**
   * 应用过滤器
   * @param {BaseProcessor} filter - 过滤器
   * @param {Object[]} nodes - 节点数组
   * @param {Object} context - 处理上下文
   * @returns {Promise<Object[]>} 过滤后的节点数组
   */
  async applyFilter(filter, nodes, context) {
    return await filter.process(nodes, context);
  }

  /**
   * 应用操作器
   * @param {BaseProcessor} operator - 操作器
   * @param {Object[]} nodes - 节点数组
   * @param {Object} context - 处理上下文
   * @returns {Promise<Object[]>} 操作后的节点数组
   */
  async applyOperator(operator, nodes, context) {
    return await operator.process(nodes, context);
  }

  /**
   * 应用转换器
   * @param {BaseProcessor} transformer - 转换器
   * @param {Object[]} nodes - 节点数组
   * @param {Object} context - 处理上下文
   * @returns {Promise<Object[]>} 转换后的节点数组
   */
  async applyTransformer(transformer, nodes, context) {
    return await transformer.process(nodes, context);
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      averageProcessingTime: this.stats.totalProcessed > 0 ? 
        (this.stats.processingTime / this.stats.totalProcessed).toFixed(2) + 'ms' : '0ms',
      successRate: this.stats.totalProcessed > 0 ? 
        (this.stats.successfulProcessors / (this.stats.successfulProcessors + this.stats.failedProcessors) * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalProcessed: 0,
      successfulProcessors: 0,
      failedProcessors: 0,
      processingTime: 0
    };
  }

  /**
   * 获取所有处理器
   * @returns {BaseProcessor[]} 处理器数组
   */
  getProcessors() {
    return [...this.processors];
  }

  /**
   * 按类型获取处理器
   * @param {string} type - 处理器类型
   * @returns {BaseProcessor[]} 指定类型的处理器数组
   */
  getProcessorsByType(type) {
    return this.processors.filter(p => p.type === type);
  }

  /**
   * 清空所有处理器
   */
  clear() {
    this.processors = [];
    this.resetStats();
    return this;
  }

  /**
   * 克隆处理器链
   * @returns {ProcessorChain} 新的处理器链实例
   */
  clone() {
    const newChain = new ProcessorChain();
    newChain.processors = [...this.processors];
    return newChain;
  }
}

/**
 * 过滤器处理器适配器
 */
export class FilterProcessor extends BaseProcessor {
  constructor(filter, options = {}) {
    super(`Filter: ${filter.name}`, 'filter');
    this.filter = filter;
    this.options = options;
  }

  async process(nodes, context = {}) {
    return this.filter.filter(nodes, this.options);
  }
}

/**
 * 去重处理器
 */
export class DeduplicationProcessor extends BaseProcessor {
  constructor(options = {}) {
    super('Deduplication Processor', 'operator');
    this.options = options;
  }

  async process(nodes, context = {}) {
    const { handleDuplicateNodes } = await import('../utils/deduplication.js');
    return handleDuplicateNodes(nodes, this.options);
  }
}

/**
 * 排序处理器
 */
export class SortProcessor extends BaseProcessor {
  constructor(options = {}) {
    super('Sort Processor', 'operator');
    this.options = options;
  }

  async process(nodes, context = {}) {
    const { RegexSorter } = await import('../utils/regex.js');
    
    if (this.options.regexPatterns && this.options.regexPatterns.length > 0) {
      const sorter = new RegexSorter(this.options.regexPatterns, this.options.order);
      return sorter.sort(nodes);
    }

    // 默认按名称排序
    return nodes.sort((a, b) => {
      const nameA = a.name || '';
      const nameB = b.name || '';
      return this.options.order === 'desc' ? 
        (nameA < nameB ? 1 : -1) : 
        (nameA < nameB ? -1 : 1);
    });
  }
}

/**
 * 重命名处理器
 */
export class RenameProcessor extends BaseProcessor {
  constructor(rules = []) {
    super('Rename Processor', 'transformer');
    this.rules = rules;
  }

  async process(nodes, context = {}) {
    if (this.rules.length === 0) {
      return nodes;
    }

    const { RegexRenamer } = await import('../utils/regex.js');
    const renamer = new RegexRenamer(this.rules);
    return renamer.renameAll(nodes);
  }
}
