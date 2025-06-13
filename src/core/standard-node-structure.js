/**
 * 标准化节点结构定义
 * 定义统一的代理节点输出格式，确保全链路数据完整性追踪
 */

import crypto from 'crypto';

/**
 * 节点字段类型枚举
 */
export const NodeFieldTypes = {
  // 核心连接参数
  CORE: 'core',
  // 扩展元数据
  META: 'meta',
  // 原始字符串备份
  RAW: 'raw',
  // 安全相关信息
  SECURITY: 'security'
};

/**
 * 安全验证状态枚举
 */
export const SecurityValidationStatus = {
  VALIDATED: 'validated',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  PENDING: 'pending'
};

/**
 * 节点处理状态枚举
 */
export const NodeProcessingStatus = {
  PARSED: 'parsed',
  VALIDATED: 'validated',
  PROCESSED: 'processed',
  DEDUPLICATED: 'deduplicated',
  STORED: 'stored'
};

/**
 * 标准化节点结构创建器
 */
export class StandardNodeStructure {
  /**
   * 创建标准化节点
   * @param {string} type - 协议类型
   * @param {Object} coreParams - 核心连接参数
   * @param {string} originalInput - 原始输入字符串
   * @param {Object} options - 创建选项
   * @returns {Object} 标准化节点对象
   */
  static createStandardNode(type, coreParams, originalInput, options = {}) {
    const timestamp = Date.now();
    const nodeId = this.generateNodeId(type, coreParams, timestamp);

    return {
      // 基础标识信息
      id: nodeId,
      type: type.toLowerCase(),
      name: coreParams.name || this.generateDefaultName(type, coreParams),
      
      // 核心连接参数（必需字段）
      core: this.createCoreSection(coreParams),
      
      // 扩展元数据（可选字段）
      meta: this.createMetaSection(options.meta || {}),
      
      // 原始字符串备份（用于完整性验证）
      raw: this.createRawSection(originalInput),
      
      // 安全相关信息（验证状态和校验和）
      security: this.createSecuritySection(originalInput, options.security || {}),
      
      // 处理历史记录
      processing: this.createProcessingSection(timestamp, options.processing || {})
    };
  }

  /**
   * 创建核心连接参数部分
   * @private
   */
  static createCoreSection(coreParams) {
    // 提取核心连接参数，移除元数据字段
    const core = {
      server: coreParams.server,
      port: coreParams.port
    };

    // 根据协议类型添加特定字段
    switch (coreParams.type?.toLowerCase()) {
      case 'vmess':
        Object.assign(core, {
          uuid: coreParams.uuid || coreParams.id,
          alterId: coreParams.alterId || coreParams.aid || 0,
          cipher: coreParams.cipher || coreParams.scy || 'auto',
          network: coreParams.network || coreParams.net || 'tcp'
        });
        break;
        
      case 'trojan':
        Object.assign(core, {
          password: coreParams.password,
          network: coreParams.network || 'tcp'
        });
        break;
        
      case 'shadowsocks':
      case 'ss':
        Object.assign(core, {
          method: coreParams.method || coreParams.cipher,
          password: coreParams.password
        });
        break;
        
      case 'vless':
        Object.assign(core, {
          uuid: coreParams.uuid || coreParams.id,
          flow: coreParams.flow,
          network: coreParams.network || 'tcp'
        });
        break;
        
      default:
        // 对于未知协议，保留所有非元数据字段
        Object.assign(core, this.extractCoreFields(coreParams));
    }

    return core;
  }

  /**
   * 创建元数据部分
   * @private
   */
  static createMetaSection(metaData) {
    return {
      // 传输层配置
      transport: metaData.transport || {},
      
      // TLS/安全配置
      tls: metaData.tls || {},
      
      // WebSocket配置
      websocket: metaData.websocket || {},
      
      // HTTP/2配置
      http2: metaData.http2 || {},
      
      // gRPC配置
      grpc: metaData.grpc || {},
      
      // 其他扩展配置
      extensions: metaData.extensions || {},
      
      // 地理位置信息
      geo: metaData.geo || {},
      
      // 性能指标
      performance: metaData.performance || {},
      
      // 自定义标签
      tags: metaData.tags || [],
      
      // 备注信息
      remarks: metaData.remarks || ''
    };
  }

  /**
   * 创建原始数据部分
   * @private
   */
  static createRawSection(originalInput) {
    return {
      // 原始输入字符串
      original: originalInput,
      
      // 原始数据长度
      length: originalInput ? originalInput.length : 0,
      
      // 原始数据校验和
      checksum: this.calculateChecksum(originalInput),
      
      // 编码信息
      encoding: 'utf8',
      
      // 保存时间戳
      savedAt: new Date().toISOString()
    };
  }

  /**
   * 创建安全信息部分
   * @private
   */
  static createSecuritySection(originalInput, securityData) {
    return {
      // 验证状态
      validated: securityData.validated !== false,
      
      // 验证时间戳
      validatedAt: new Date().toISOString(),
      
      // 校验和信息
      checksum: {
        algorithm: 'md5',
        value: this.calculateChecksum(originalInput),
        generatedAt: new Date().toISOString()
      },
      
      // 安全等级
      securityLevel: securityData.securityLevel || 'standard',
      
      // 验证错误（如果有）
      validationErrors: securityData.validationErrors || [],
      
      // 安全标记
      flags: securityData.flags || [],
      
      // 风险评估
      riskAssessment: securityData.riskAssessment || {
        level: 'low',
        factors: []
      }
    };
  }

  /**
   * 创建处理历史部分
   * @private
   */
  static createProcessingSection(timestamp, processingData) {
    return {
      // 创建时间戳
      createdAt: new Date(timestamp).toISOString(),
      
      // 最后更新时间戳
      updatedAt: new Date().toISOString(),
      
      // 处理状态
      status: NodeProcessingStatus.PARSED,
      
      // 处理历史
      history: processingData.history || [],
      
      // 处理器链记录
      processors: processingData.processors || [],
      
      // 性能指标
      performance: {
        parseTime: processingData.parseTime || 0,
        validationTime: processingData.validationTime || 0,
        totalTime: processingData.totalTime || 0
      },
      
      // 版本信息
      version: processingData.version || '1.0.0',
      
      // 处理器版本
      processorVersion: processingData.processorVersion || '1.0.0'
    };
  }

  /**
   * 生成节点ID
   * @private
   */
  static generateNodeId(type, coreParams, timestamp) {
    const idSource = `${type}_${coreParams.server}_${coreParams.port}_${timestamp}`;
    return crypto.createHash('sha256').update(idSource).digest('hex').substr(0, 16);
  }

  /**
   * 生成默认名称
   * @private
   */
  static generateDefaultName(type, coreParams) {
    const server = coreParams.server || 'unknown';
    const port = coreParams.port || '0';
    return `${type.toUpperCase()}_${server}_${port}`;
  }

  /**
   * 计算校验和
   * @private
   */
  static calculateChecksum(content) {
    if (!content) return '';
    return crypto.createHash('md5').update(content, 'utf8').digest('hex');
  }

  /**
   * 提取核心字段（用于未知协议）
   * @private
   */
  static extractCoreFields(params) {
    const metaFields = ['name', 'remarks', 'tags', 'geo', 'performance'];
    const core = {};
    
    for (const [key, value] of Object.entries(params)) {
      if (!metaFields.includes(key) && key !== 'type') {
        core[key] = value;
      }
    }
    
    return core;
  }

  /**
   * 验证标准节点结构
   * @param {Object} node - 节点对象
   * @returns {Object} 验证结果
   */
  static validateStandardNode(node) {
    const errors = [];
    const warnings = [];

    // 检查必需字段
    const requiredFields = ['id', 'type', 'core', 'meta', 'raw', 'security', 'processing'];
    for (const field of requiredFields) {
      if (!node.hasOwnProperty(field)) {
        errors.push(`缺少必需字段: ${field}`);
      }
    }

    // 检查核心字段
    if (node.core) {
      if (!node.core.server) {
        errors.push('核心字段缺少server');
      }
      if (!node.core.port) {
        errors.push('核心字段缺少port');
      }
    }

    // 检查安全字段
    if (node.security) {
      if (typeof node.security.validated !== 'boolean') {
        warnings.push('安全字段validated应为布尔值');
      }
      if (!node.security.checksum) {
        warnings.push('安全字段缺少checksum');
      }
    }

    // 检查原始数据字段
    if (node.raw) {
      if (!node.raw.original) {
        warnings.push('原始数据字段缺少original');
      }
      if (!node.raw.checksum) {
        warnings.push('原始数据字段缺少checksum');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: this.calculateValidationScore(errors.length, warnings.length)
    };
  }

  /**
   * 计算验证分数
   * @private
   */
  static calculateValidationScore(errorCount, warningCount) {
    const maxScore = 100;
    const errorPenalty = 20;
    const warningPenalty = 5;
    
    return Math.max(0, maxScore - (errorCount * errorPenalty) - (warningCount * warningPenalty));
  }

  /**
   * 更新节点处理状态
   * @param {Object} node - 节点对象
   * @param {string} status - 新状态
   * @param {Object} metadata - 元数据
   */
  static updateProcessingStatus(node, status, metadata = {}) {
    if (!node.processing) {
      node.processing = this.createProcessingSection(Date.now(), {});
    }

    node.processing.status = status;
    node.processing.updatedAt = new Date().toISOString();
    
    // 添加到历史记录
    node.processing.history.push({
      status,
      timestamp: new Date().toISOString(),
      metadata
    });

    return node;
  }

  /**
   * 添加处理器记录
   * @param {Object} node - 节点对象
   * @param {string} processorName - 处理器名称
   * @param {Object} result - 处理结果
   */
  static addProcessorRecord(node, processorName, result = {}) {
    if (!node.processing) {
      node.processing = this.createProcessingSection(Date.now(), {});
    }

    node.processing.processors.push({
      name: processorName,
      timestamp: new Date().toISOString(),
      duration: result.duration || 0,
      success: result.success !== false,
      metadata: result.metadata || {}
    });

    return node;
  }
}

// 导出便捷方法
export const createStandardNode = (type, coreParams, originalInput, options) =>
  StandardNodeStructure.createStandardNode(type, coreParams, originalInput, options);

export const validateStandardNode = (node) =>
  StandardNodeStructure.validateStandardNode(node);

export const updateNodeStatus = (node, status, metadata) =>
  StandardNodeStructure.updateProcessingStatus(node, status, metadata);

export const addProcessorRecord = (node, processorName, result) =>
  StandardNodeStructure.addProcessorRecord(node, processorName, result);
