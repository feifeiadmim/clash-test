/**
 * 配置化评分引擎
 * 提供插件式评分规则系统，支持协议专属评分策略
 */

/**
 * 评分策略接口
 * 所有评分策略都必须实现此接口
 */
export class ScoringStrategy {
  constructor(name, weight = 1.0) {
    this.name = name;
    this.weight = weight;
    this.enabled = true;
  }

  /**
   * 计算节点评分
   * @param {Object} node - 节点信息
   * @param {Object} context - 评分上下文
   * @returns {number} 评分（0-100）
   */
  calculateScore(node, context = {}) {
    throw new Error('ScoringStrategy.calculateScore must be implemented');
  }

  /**
   * 验证节点是否适用此策略
   * @param {Object} node - 节点信息
   * @returns {boolean} 是否适用
   */
  isApplicable(node) {
    return true;
  }

  /**
   * 获取策略描述
   * @returns {string} 策略描述
   */
  getDescription() {
    return `${this.name} scoring strategy`;
  }
}

/**
 * 基础完整性评分策略
 */
export class CompletenessStrategy extends ScoringStrategy {
  constructor(weight = 1.0) {
    super('Completeness', weight);
    this.requiredFields = ['server', 'port', 'type'];
    this.optionalFields = ['name', 'uuid', 'password'];
  }

  calculateScore(node, context = {}) {
    let score = 0;
    const totalFields = this.requiredFields.length + this.optionalFields.length;

    // 必需字段检查（权重更高）
    for (const field of this.requiredFields) {
      if (node[field] && String(node[field]).trim()) {
        score += 60 / this.requiredFields.length; // 必需字段占60分
      }
    }

    // 可选字段检查
    for (const field of this.optionalFields) {
      if (node[field] && String(node[field]).trim()) {
        score += 40 / this.optionalFields.length; // 可选字段占40分
      }
    }

    return Math.min(100, score);
  }
}

/**
 * VMess协议专属评分策略
 */
export class VMessStrategy extends ScoringStrategy {
  constructor(weight = 1.0) {
    super('VMess', weight);
  }

  isApplicable(node) {
    return node.type === 'vmess';
  }

  calculateScore(node, context = {}) {
    let score = 0;

    // UUID格式验证（30分）
    if (node.uuid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.uuid)) {
      score += 30;
    }

    // 加密方式评分（20分）
    const cipherScore = this.getCipherScore(node.cipher || node.security);
    score += cipherScore * 0.2;

    // 传输层配置（25分）
    const networkScore = this.getNetworkScore(node);
    score += networkScore * 0.25;

    // TLS配置（25分）
    const tlsScore = this.getTlsScore(node);
    score += tlsScore * 0.25;

    return Math.min(100, score);
  }

  getCipherScore(cipher) {
    const cipherRanking = {
      'aes-128-gcm': 100,
      'chacha20-poly1305': 95,
      'aes-256-gcm': 90,
      'auto': 70,
      'none': 30
    };
    return cipherRanking[cipher] || 50;
  }

  getNetworkScore(node) {
    const network = node.network || 'tcp';
    const networkRanking = {
      'ws': 100,
      'h2': 95,
      'grpc': 90,
      'tcp': 80,
      'kcp': 70,
      'quic': 85
    };
    
    let score = networkRanking[network] || 60;
    
    // 传输层配置完整性加分
    if (node.transport) {
      if (node.transport.path) score += 10;
      if (node.transport.host) score += 10;
    }
    
    return Math.min(100, score);
  }

  getTlsScore(node) {
    if (!node.tls || !node.tls.enabled) return 30;
    
    let score = 70; // 基础TLS分数
    
    if (node.tls.serverName) score += 15;
    if (node.tls.alpn) score += 10;
    if (node.tls.fingerprint) score += 5;
    
    return Math.min(100, score);
  }
}

/**
 * Trojan协议专属评分策略
 */
export class TrojanStrategy extends ScoringStrategy {
  constructor(weight = 1.0) {
    super('Trojan', weight);
  }

  isApplicable(node) {
    return node.type === 'trojan';
  }

  calculateScore(node, context = {}) {
    let score = 0;

    // 密码强度（40分）
    const passwordScore = this.getPasswordScore(node.password);
    score += passwordScore * 0.4;

    // SNI配置（30分）
    if (node.sni || node.host) {
      score += 30;
    }

    // 传输层配置（30分）
    const networkScore = this.getNetworkScore(node);
    score += networkScore * 0.3;

    return Math.min(100, score);
  }

  getPasswordScore(password) {
    if (!password) return 0;
    
    let score = 50; // 基础分数
    
    if (password.length >= 16) score += 20;
    if (/[A-Z]/.test(password)) score += 10;
    if (/[a-z]/.test(password)) score += 10;
    if (/[0-9]/.test(password)) score += 10;
    
    return Math.min(100, score);
  }

  getNetworkScore(node) {
    const network = node.network || 'tcp';
    return network === 'ws' ? 100 : network === 'tcp' ? 80 : 60;
  }
}

/**
 * 配置化评分引擎
 */
export class ConfigurableScoringEngine {
  constructor() {
    this.strategies = new Map();
    this.globalConfig = {
      enableWeighting: true,
      defaultWeight: 1.0,
      maxScore: 100,
      minScore: 0
    };
    this.protocolConfigs = new Map();
    
    // 注册默认策略
    this.registerDefaultStrategies();
  }

  /**
   * 注册评分策略
   * @param {ScoringStrategy} strategy - 评分策略实例
   * @param {string} protocolType - 协议类型（可选，用于协议专属策略）
   */
  registerStrategy(strategy, protocolType = 'global') {
    if (!(strategy instanceof ScoringStrategy)) {
      throw new Error('Strategy must extend ScoringStrategy');
    }

    if (!this.strategies.has(protocolType)) {
      this.strategies.set(protocolType, []);
    }

    this.strategies.get(protocolType).push(strategy);
    console.log(`📝 注册评分策略: ${strategy.name} (${protocolType})`);
  }

  /**
   * 注册默认策略
   */
  registerDefaultStrategies() {
    // 全局策略
    this.registerStrategy(new CompletenessStrategy(1.0), 'global');
    
    // 协议专属策略
    this.registerStrategy(new VMessStrategy(1.0), 'vmess');
    this.registerStrategy(new TrojanStrategy(1.0), 'trojan');
  }

  /**
   * 设置协议配置
   * @param {string} protocolType - 协议类型
   * @param {Object} config - 配置对象
   */
  setProtocolConfig(protocolType, config) {
    this.protocolConfigs.set(protocolType, {
      ...this.protocolConfigs.get(protocolType),
      ...config
    });
  }

  /**
   * 计算节点评分
   * @param {Object} node - 节点信息
   * @param {Object} options - 评分选项
   * @returns {Object} 评分结果
   */
  calculateScore(node, options = {}) {
    const protocolType = node.type || 'unknown';
    const context = {
      protocolType,
      config: this.protocolConfigs.get(protocolType) || {},
      ...options.context
    };

    const results = {
      totalScore: 0,
      maxPossibleScore: 0,
      strategyResults: [],
      protocolType,
      timestamp: Date.now()
    };

    // 获取适用的策略
    const applicableStrategies = this.getApplicableStrategies(node, protocolType);
    
    if (applicableStrategies.length === 0) {
      console.warn(`⚠️ 没有找到适用于 ${protocolType} 的评分策略`);
      return results;
    }

    let totalWeight = 0;
    let weightedScore = 0;

    // 执行评分策略
    for (const strategy of applicableStrategies) {
      if (!strategy.enabled) continue;

      try {
        const score = strategy.calculateScore(node, context);
        const weight = strategy.weight;
        
        weightedScore += score * weight;
        totalWeight += weight;

        results.strategyResults.push({
          strategyName: strategy.name,
          score: Math.round(score * 100) / 100,
          weight,
          weightedScore: Math.round(score * weight * 100) / 100
        });

      } catch (error) {
        console.error(`❌ 评分策略 ${strategy.name} 执行失败:`, error.message);
      }
    }

    // 计算最终评分
    if (totalWeight > 0) {
      results.totalScore = Math.round((weightedScore / totalWeight) * 100) / 100;
      results.maxPossibleScore = this.globalConfig.maxScore;
    }

    // 应用全局限制
    results.totalScore = Math.max(
      this.globalConfig.minScore,
      Math.min(this.globalConfig.maxScore, results.totalScore)
    );

    return results;
  }

  /**
   * 获取适用的评分策略
   * @param {Object} node - 节点信息
   * @param {string} protocolType - 协议类型
   * @returns {Array} 适用的策略数组
   */
  getApplicableStrategies(node, protocolType) {
    const strategies = [];

    // 添加全局策略
    const globalStrategies = this.strategies.get('global') || [];
    strategies.push(...globalStrategies.filter(s => s.isApplicable(node)));

    // 添加协议专属策略
    const protocolStrategies = this.strategies.get(protocolType) || [];
    strategies.push(...protocolStrategies.filter(s => s.isApplicable(node)));

    return strategies;
  }

  /**
   * 批量评分
   * @param {Array} nodes - 节点数组
   * @param {Object} options - 评分选项
   * @returns {Array} 评分结果数组
   */
  batchScore(nodes, options = {}) {
    return nodes.map(node => ({
      node,
      scoring: this.calculateScore(node, options)
    }));
  }

  /**
   * 获取评分引擎统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const stats = {
      totalStrategies: 0,
      strategiesByProtocol: {},
      globalConfig: this.globalConfig
    };

    for (const [protocolType, strategies] of this.strategies) {
      stats.strategiesByProtocol[protocolType] = {
        count: strategies.length,
        enabled: strategies.filter(s => s.enabled).length,
        strategies: strategies.map(s => ({
          name: s.name,
          weight: s.weight,
          enabled: s.enabled
        }))
      };
      stats.totalStrategies += strategies.length;
    }

    return stats;
  }
}

// 全局评分引擎实例
export const globalScoringEngine = new ConfigurableScoringEngine();
