/**
 * 性能与精准度平衡测试
 */

import { generateFullNodeKey, DeduplicationEngine } from '../../src/utils/deduplication.js';

/**
 * 性能精准度测试类
 */
export class PerformancePrecisionTests {
  
  /**
   * 测试键生成性能
   */
  static testKeyGenerationPerformance() {
    const testNode = {
      name: 'performance-test',
      server: 'performance.example.com',
      port: 443,
      type: 'vmess',
      uuid: 'performance-uuid-123',
      alterId: 0,
      security: 'auto',
      network: 'ws',
      path: '/performance',
      host: 'performance.example.com',
      tls: {
        enabled: true,
        serverName: 'performance.example.com',
        allowInsecure: false,
        alpn: ['h2', 'http/1.1']
      }
    };
    
    const iterations = 10000;
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      generateFullNodeKey(testNode);
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    
    // 性能标准：平均每个键生成应该在0.01ms以内
    const passed = avgTime < 0.01;
    
    return {
      passed,
      reason: passed ? '键生成性能达标' : '键生成性能不达标',
      details: `${iterations}次生成耗时${totalTime.toFixed(2)}ms，平均${avgTime.toFixed(4)}ms/次`,
      metrics: {
        iterations,
        totalTime,
        avgTime,
        keysPerSecond: Math.round(1000 / avgTime)
      }
    };
  }

  /**
   * 测试去重算法性能
   */
  static testDeduplicationPerformance() {
    const testSizes = [100, 500, 1000, 5000];
    const results = [];
    const engine = new DeduplicationEngine();
    
    for (const size of testSizes) {
      const nodes = this.generatePerformanceTestNodes(size);
      
      const startTime = performance.now();
      const deduplicatedNodes = engine.deduplicate(nodes, { strategy: 'full', action: 'delete' });
      const endTime = performance.now();
      
      const processingTime = endTime - startTime;
      const nodesPerSecond = Math.round(size / (processingTime / 1000));
      
      results.push({
        size,
        processingTime,
        nodesPerSecond,
        originalCount: nodes.length,
        deduplicatedCount: deduplicatedNodes.length,
        removedCount: nodes.length - deduplicatedNodes.length
      });
    }
    
    // 性能标准：应该能够处理至少1000个节点/秒
    const allMeetStandard = results.every(r => r.nodesPerSecond >= 1000);
    
    return {
      passed: allMeetStandard,
      reason: allMeetStandard ? '去重算法性能达标' : '去重算法性能不达标',
      details: results.map(r => `${r.size}节点: ${r.processingTime.toFixed(1)}ms (${r.nodesPerSecond}节点/秒)`).join(', '),
      metrics: { results }
    };
  }

  /**
   * 测试精准度与速度权衡
   */
  static testPrecisionSpeedTradeoff() {
    const testCases = [
      {
        name: '简单节点',
        nodes: this.generateSimpleNodes(1000),
        expectedAccuracy: 100
      },
      {
        name: '复杂节点',
        nodes: this.generateComplexNodes(1000),
        expectedAccuracy: 95
      },
      {
        name: '边界情况节点',
        nodes: this.generateEdgeCaseNodes(500),
        expectedAccuracy: 90
      }
    ];
    
    const results = [];
    const engine = new DeduplicationEngine();
    
    for (const testCase of testCases) {
      const startTime = performance.now();
      
      // 执行去重
      const deduplicatedNodes = engine.deduplicate(testCase.nodes, { strategy: 'full', action: 'delete' });
      
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      // 计算精准度（这里简化为去重率的合理性检查）
      const duplicateRate = ((testCase.nodes.length - deduplicatedNodes.length) / testCase.nodes.length) * 100;
      const accuracyScore = this.calculateAccuracyScore(testCase.nodes, deduplicatedNodes);
      
      results.push({
        name: testCase.name,
        processingTime,
        duplicateRate,
        accuracyScore,
        expectedAccuracy: testCase.expectedAccuracy,
        meetsExpectation: accuracyScore >= testCase.expectedAccuracy
      });
    }
    
    const allMeetExpectations = results.every(r => r.meetsExpectation);
    
    return {
      passed: allMeetExpectations,
      reason: allMeetExpectations ? '精准度与速度权衡合理' : '精准度与速度权衡存在问题',
      details: results.map(r => `${r.name}: ${r.accuracyScore.toFixed(1)}%精准度, ${r.processingTime.toFixed(1)}ms`).join('; '),
      metrics: { results }
    };
  }

  /**
   * 生成性能测试节点
   */
  static generatePerformanceTestNodes(count) {
    const nodes = [];
    const protocols = ['vmess', 'vless', 'trojan', 'ss'];
    
    for (let i = 0; i < count; i++) {
      const protocol = protocols[i % protocols.length];
      const duplicateGroup = Math.floor(i / 10); // 每10个节点中有重复
      
      let node = {
        name: `perf-test-${i}`,
        server: `server${duplicateGroup % 5}.example.com`,
        port: 443,
        type: protocol
      };
      
      switch (protocol) {
        case 'vmess':
        case 'vless':
          node.uuid = `uuid-${duplicateGroup}`;
          break;
        case 'trojan':
          node.password = `password-${duplicateGroup}`;
          break;
        case 'ss':
          node.password = `ss-password-${duplicateGroup}`;
          node.method = 'aes-256-gcm';
          break;
      }
      
      nodes.push(node);
    }
    
    return nodes;
  }

  /**
   * 生成简单节点
   */
  static generateSimpleNodes(count) {
    const nodes = [];
    
    for (let i = 0; i < count; i++) {
      nodes.push({
        name: `simple-${i}`,
        server: `simple${i % 10}.com`,
        port: 443,
        type: 'vmess',
        uuid: `simple-uuid-${i % 50}` // 创建一些重复
      });
    }
    
    return nodes;
  }

  /**
   * 生成复杂节点
   */
  static generateComplexNodes(count) {
    const nodes = [];
    
    for (let i = 0; i < count; i++) {
      nodes.push({
        name: `complex-${i}`,
        server: `complex${i % 20}.com`,
        port: 443,
        type: 'vmess',
        uuid: `complex-uuid-${i % 30}`,
        network: 'ws',
        path: `/path${i % 5}`,
        host: `complex${i % 20}.com`,
        tls: {
          enabled: true,
          serverName: `complex${i % 20}.com`,
          allowInsecure: i % 2 === 0,
          alpn: i % 3 === 0 ? ['h2'] : ['http/1.1']
        },
        headers: {
          'User-Agent': `Agent-${i % 3}`
        }
      });
    }
    
    return nodes;
  }

  /**
   * 生成边界情况节点
   */
  static generateEdgeCaseNodes(count) {
    const nodes = [];
    
    for (let i = 0; i < count; i++) {
      const node = {
        name: `edge-${i}`,
        server: `edge${i % 10}.com`,
        port: i % 2 === 0 ? 443 : '443', // 混合数字和字符串
        type: i % 2 === 0 ? 'VMess' : 'vmess', // 混合大小写
        uuid: `edge-uuid-${i % 20}`
      };
      
      // 随机添加一些可选字段
      if (i % 3 === 0) {
        node.alterId = null;
      }
      if (i % 4 === 0) {
        node.security = '';
      }
      if (i % 5 === 0) {
        node.network = undefined;
      }
      
      nodes.push(node);
    }
    
    return nodes;
  }

  /**
   * 计算精准度评分
   */
  static calculateAccuracyScore(originalNodes, deduplicatedNodes) {
    // 简化的精准度计算
    // 实际应用中需要更复杂的逻辑来验证去重的正确性
    
    const duplicateRate = ((originalNodes.length - deduplicatedNodes.length) / originalNodes.length) * 100;
    
    // 基于去重率的合理性来评估精准度
    if (duplicateRate >= 0 && duplicateRate <= 5) {
      return 100; // 低重复率，可能精准度很高
    } else if (duplicateRate <= 20) {
      return 95; // 中等重复率
    } else if (duplicateRate <= 50) {
      return 85; // 较高重复率
    } else {
      return 70; // 极高重复率，可能存在过度去重
    }
  }

  /**
   * 内存使用测试
   */
  static testMemoryUsage() {
    const initialMemory = process.memoryUsage();
    
    // 创建大量节点进行测试
    const largeDataset = this.generatePerformanceTestNodes(10000);
    const engine = new DeduplicationEngine();
    
    const beforeDedup = process.memoryUsage();
    const deduplicatedNodes = engine.deduplicate(largeDataset, { strategy: 'full', action: 'delete' });
    const afterDedup = process.memoryUsage();
    
    const memoryIncrease = afterDedup.heapUsed - initialMemory.heapUsed;
    const peakMemory = Math.max(beforeDedup.heapUsed, afterDedup.heapUsed) - initialMemory.heapUsed;
    
    // 内存使用标准：处理10000个节点不应超过100MB
    const memoryEfficient = memoryIncrease < 100 * 1024 * 1024;
    
    return {
      passed: memoryEfficient,
      reason: memoryEfficient ? '内存使用效率达标' : '内存使用效率不达标',
      details: `处理${largeDataset.length}个节点，内存增长${(memoryIncrease / 1024 / 1024).toFixed(1)}MB，峰值${(peakMemory / 1024 / 1024).toFixed(1)}MB`,
      metrics: {
        nodeCount: largeDataset.length,
        memoryIncrease: memoryIncrease,
        peakMemory: peakMemory,
        deduplicatedCount: deduplicatedNodes.length
      }
    };
  }
}
