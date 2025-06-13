/**
 * 生产器注册管理系统
 * 借鉴Sub-Store的Producer架构，支持多平台输出
 */

/**
 * 生产器基类
 */
export class BaseProducer {
  constructor(name, platform, type = 'BATCH') {
    this.name = name;
    this.platform = platform;
    this.type = type; // 'SINGLE' | 'BATCH'
  }

  /**
   * 生产输出内容
   * @param {Object[]|Object} data - 节点数据
   * @param {Object} options - 生产选项
   * @returns {string} 生产的内容
   */
  produce(data, options = {}) {
    throw new Error('Producer produce method must be implemented');
  }

  /**
   * 验证节点数据
   * @param {Object} node - 节点对象
   * @returns {boolean} 是否有效
   */
  validateNode(node) {
    return node && node.server && node.port && node.type;
  }
}

/**
 * 生产器注册管理器
 */
export class ProducerRegistry {
  constructor() {
    this.producers = new Map();
    this.stats = {
      totalProductions: 0,
      successfulProductions: 0,
      failedProductions: 0
    };
  }

  /**
   * 注册生产器
   * @param {string} platform - 平台名称
   * @param {BaseProducer} producer - 生产器实例
   */
  register(platform, producer) {
    if (!(producer instanceof BaseProducer)) {
      throw new Error('Producer must extend BaseProducer');
    }
    
    this.producers.set(platform.toLowerCase(), producer);
    console.log(`📤 注册生产器: ${producer.name} (${platform})`);
  }

  /**
   * 生产输出
   * @param {Object[]} nodes - 节点数组
   * @param {string} platform - 目标平台
   * @param {Object} options - 生产选项
   * @returns {string} 生产的内容
   */
  produce(nodes, platform, options = {}) {
    this.stats.totalProductions++;

    const producer = this.producers.get(platform.toLowerCase());
    if (!producer) {
      this.stats.failedProductions++;
      throw new Error(`Unsupported platform: ${platform}`);
    }

    try {
      const result = producer.type === 'SINGLE' ?
        this.produceSingle(nodes, producer, options) :
        producer.produce(nodes, options);
      
      this.stats.successfulProductions++;
      return result;
    } catch (error) {
      this.stats.failedProductions++;
      throw new Error(`Production failed for ${platform}: ${error.message}`);
    }
  }

  /**
   * 单节点生产模式
   * @param {Object[]} nodes - 节点数组
   * @param {BaseProducer} producer - 生产器
   * @param {Object} options - 选项
   * @returns {string} 生产的内容
   */
  produceSingle(nodes, producer, options) {
    const results = [];
    
    for (const node of nodes) {
      try {
        if (producer.validateNode(node)) {
          const result = producer.produce(node, options);
          if (result && result.trim()) {
            results.push(result);
          }
        } else {
          console.warn(`⚠️ 跳过无效节点: ${node.name || 'Unknown'}`);
        }
      } catch (error) {
        console.error(`❌ 节点生产失败: ${node.name || 'Unknown'}`, error.message);
      }
    }

    return results.join('\n');
  }

  /**
   * 获取支持的平台列表
   * @returns {string[]} 平台名称数组
   */
  getSupportedPlatforms() {
    return Array.from(this.producers.keys());
  }

  /**
   * 检查是否支持平台
   * @param {string} platform - 平台名称
   * @returns {boolean} 是否支持
   */
  isSupported(platform) {
    return this.producers.has(platform.toLowerCase());
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalProductions > 0 ? 
        (this.stats.successfulProductions / this.stats.totalProductions * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalProductions: 0,
      successfulProductions: 0,
      failedProductions: 0
    };
  }
}

/**
 * Clash生产器
 */
export class ClashProducer extends BaseProducer {
  constructor() {
    super('Clash Producer', 'clash', 'BATCH');
  }

  produce(nodes, options = {}) {
    const config = {
      proxies: [],
      'proxy-groups': [
        {
          name: '🚀 节点选择',
          type: 'select',
          proxies: ['♻️ 自动选择', 'DIRECT']
        },
        {
          name: '♻️ 自动选择',
          type: 'url-test',
          proxies: [],
          url: 'http://www.gstatic.com/generate_204',
          interval: 300
        }
      ]
    };

    // 生成代理配置
    for (const node of nodes) {
      if (!this.validateNode(node)) continue;

      const proxy = this.nodeToClashProxy(node);
      if (proxy) {
        config.proxies.push(proxy);
        config['proxy-groups'][0].proxies.push(proxy.name);
        config['proxy-groups'][1].proxies.push(proxy.name);
      }
    }

    return JSON.stringify(config, null, 2);
  }

  nodeToClashProxy(node) {
    const base = {
      name: node.name,
      server: node.server,
      port: node.port
    };

    switch (node.type) {
      case 'vmess':
        return {
          ...base,
          type: 'vmess',
          uuid: node.uuid,
          alterId: node.alterId || 0,
          cipher: node.cipher || 'auto',
          network: node.network || 'tcp',
          tls: node.tls?.enabled || false
        };

      case 'trojan':
        return {
          ...base,
          type: 'trojan',
          password: node.password,
          sni: node.sni || node.server
        };

      case 'ss':
        return {
          ...base,
          type: 'ss',
          cipher: node.method,
          password: node.password
        };

      default:
        console.warn(`⚠️ Clash不支持的协议类型: ${node.type}`);
        return null;
    }
  }
}

/**
 * V2Ray生产器
 */
export class V2RayProducer extends BaseProducer {
  constructor() {
    super('V2Ray Producer', 'v2ray', 'BATCH');
  }

  produce(nodes, options = {}) {
    const config = {
      outbounds: [
        {
          tag: 'proxy',
          protocol: 'vmess',
          settings: {
            vnext: []
          }
        },
        {
          tag: 'direct',
          protocol: 'freedom'
        }
      ]
    };

    // 生成出站配置
    for (const node of nodes) {
      if (!this.validateNode(node)) continue;

      const outbound = this.nodeToV2RayOutbound(node);
      if (outbound) {
        config.outbounds[0].settings.vnext.push(outbound);
      }
    }

    return JSON.stringify(config, null, 2);
  }

  nodeToV2RayOutbound(node) {
    switch (node.type) {
      case 'vmess':
        return {
          address: node.server,
          port: node.port,
          users: [{
            id: node.uuid,
            alterId: node.alterId || 0,
            security: node.cipher || 'auto'
          }]
        };

      default:
        console.warn(`⚠️ V2Ray配置暂不支持: ${node.type}`);
        return null;
    }
  }
}

/**
 * 订阅链接生产器
 */
export class SubscriptionProducer extends BaseProducer {
  constructor() {
    super('Subscription Producer', 'subscription', 'SINGLE');
  }

  produce(node, options = {}) {
    if (!this.validateNode(node)) {
      throw new Error('Invalid node for subscription');
    }

    switch (node.type) {
      case 'vmess':
        return this.generateVMessLink(node);
      case 'trojan':
        return this.generateTrojanLink(node);
      case 'ss':
        return this.generateSSLink(node);
      default:
        throw new Error(`Unsupported protocol for subscription: ${node.type}`);
    }
  }

  generateVMessLink(node) {
    const config = {
      v: '2',
      ps: node.name,
      add: node.server,
      port: node.port.toString(),
      id: node.uuid,
      aid: (node.alterId || 0).toString(),
      scy: node.cipher || 'auto',
      net: node.network || 'tcp',
      tls: node.tls?.enabled ? 'tls' : ''
    };

    return 'vmess://' + btoa(JSON.stringify(config));
  }

  generateTrojanLink(node) {
    const url = new URL(`trojan://${node.password}@${node.server}:${node.port}`);
    if (node.sni) {
      url.searchParams.set('sni', node.sni);
    }
    url.hash = encodeURIComponent(node.name);
    return url.toString();
  }

  generateSSLink(node) {
    const auth = btoa(`${node.method}:${node.password}`);
    const url = new URL(`ss://${auth}@${node.server}:${node.port}`);
    url.hash = encodeURIComponent(node.name);
    return url.toString();
  }
}

// 创建全局生产器注册表
export const globalProducerRegistry = new ProducerRegistry();

// 注册默认生产器
globalProducerRegistry.register('clash', new ClashProducer());
globalProducerRegistry.register('v2ray', new V2RayProducer());
globalProducerRegistry.register('subscription', new SubscriptionProducer());
