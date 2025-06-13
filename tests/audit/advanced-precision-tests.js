/**
 * 高级精准度测试实现
 */

import { generateFullNodeKey, DeduplicationEngine, findDuplicateNodes } from '../../src/utils/deduplication.js';

/**
 * 边界情况精准度测试
 */
export class EdgeCasePrecisionTests {
  
  /**
   * 测试空值和默认值处理
   */
  static testNullAndDefaultValues() {
    const testCases = [
      {
        node1: { server: 'test.com', port: 443, type: 'vmess', uuid: 'uuid1' },
        node2: { server: 'test.com', port: 443, type: 'vmess', uuid: 'uuid1', alterId: null },
        shouldMatch: true,
        description: '缺失字段 vs null值'
      },
      {
        node1: { server: 'test.com', port: 443, type: 'vmess', uuid: 'uuid1', alterId: 0 },
        node2: { server: 'test.com', port: 443, type: 'vmess', uuid: 'uuid1', alterId: undefined },
        shouldMatch: false, // 显式0和undefined应该区分
        description: '显式0 vs undefined'
      },
      {
        node1: { server: 'test.com', port: 443, type: 'trojan', password: 'pass', sni: '' },
        node2: { server: 'test.com', port: 443, type: 'trojan', password: 'pass' },
        shouldMatch: true,
        description: '空字符串 vs 缺失字段'
      }
    ];
    
    return this.runEdgeCaseTests('空值和默认值处理', testCases);
  }

  /**
   * 测试特殊字符处理
   */
  static testSpecialCharacters() {
    const testCases = [
      {
        node1: { server: 'test.com', port: 443, type: 'ss', password: 'pass@123#$%' },
        node2: { server: 'test.com', port: 443, type: 'ss', password: 'pass@123#$%' },
        shouldMatch: true,
        description: '特殊字符密码'
      },
      {
        node1: { server: 'test.com', port: 443, type: 'vmess', uuid: 'uuid-with-dashes' },
        node2: { server: 'test.com', port: 443, type: 'vmess', uuid: 'uuid_with_underscores' },
        shouldMatch: false,
        description: '连字符 vs 下划线'
      },
      {
        node1: { server: 'test.com', port: 443, type: 'trojan', password: 'pass\nwith\nnewlines' },
        node2: { server: 'test.com', port: 443, type: 'trojan', password: 'pass with newlines' },
        shouldMatch: false,
        description: '换行符处理'
      }
    ];
    
    return this.runEdgeCaseTests('特殊字符处理', testCases);
  }

  /**
   * 测试Unicode字符处理
   */
  static testUnicodeCharacters() {
    const testCases = [
      {
        node1: { server: 'test.com', port: 443, type: 'ss', password: '密码123' },
        node2: { server: 'test.com', port: 443, type: 'ss', password: '密码123' },
        shouldMatch: true,
        description: '中文字符'
      },
      {
        node1: { server: 'test.com', port: 443, type: 'vmess', uuid: 'uuid-🔑-test' },
        node2: { server: 'test.com', port: 443, type: 'vmess', uuid: 'uuid-🔑-test' },
        shouldMatch: true,
        description: 'Emoji字符'
      },
      {
        node1: { server: 'тест.com', port: 443, type: 'trojan', password: 'пароль' },
        node2: { server: 'тест.com', port: 443, type: 'trojan', password: 'пароль' },
        shouldMatch: true,
        description: '俄文字符'
      }
    ];
    
    return this.runEdgeCaseTests('Unicode字符处理', testCases);
  }

  /**
   * 测试IPv6地址标准化
   */
  static testIPv6Normalization() {
    const testCases = [
      {
        node1: { server: '2001:0db8:85a3:0000:0000:8a2e:0370:7334', port: 443, type: 'vmess', uuid: 'uuid1' },
        node2: { server: '2001:db8:85a3::8a2e:370:7334', port: 443, type: 'vmess', uuid: 'uuid1' },
        shouldMatch: true,
        description: 'IPv6地址压缩形式'
      },
      {
        node1: { server: '[2001:db8::1]', port: 443, type: 'trojan', password: 'pass' },
        node2: { server: '2001:db8::1', port: 443, type: 'trojan', password: 'pass' },
        shouldMatch: true,
        description: 'IPv6地址方括号'
      }
    ];
    
    return this.runEdgeCaseTests('IPv6地址标准化', testCases);
  }

  /**
   * 测试极长字段处理
   */
  static testExtremelyLongFields() {
    const longString = 'a'.repeat(10000);
    const testCases = [
      {
        node1: { server: 'test.com', port: 443, type: 'ss', password: longString },
        node2: { server: 'test.com', port: 443, type: 'ss', password: longString },
        shouldMatch: true,
        description: '极长密码字段'
      }
    ];
    
    return this.runEdgeCaseTests('极长字段处理', testCases);
  }

  /**
   * 运行边界情况测试
   */
  static runEdgeCaseTests(testName, testCases) {
    let allPassed = true;
    const details = [];
    let passedCount = 0;
    
    for (const testCase of testCases) {
      try {
        const key1 = generateFullNodeKey(testCase.node1);
        const key2 = generateFullNodeKey(testCase.node2);
        const matches = key1 === key2;
        
        if (matches === testCase.shouldMatch) {
          passedCount++;
        } else {
          allPassed = false;
          details.push(`${testCase.description}: 预期${testCase.shouldMatch ? '匹配' : '不匹配'}，实际${matches ? '匹配' : '不匹配'}`);
        }
      } catch (error) {
        allPassed = false;
        details.push(`${testCase.description}: 执行异常 - ${error.message}`);
      }
    }
    
    return {
      passed: allPassed,
      reason: allPassed ? `${testName}测试全部通过` : `${testName}测试存在问题`,
      details: details.join('; '),
      metrics: { 
        testName,
        totalTests: testCases.length, 
        passedTests: passedCount,
        accuracy: (passedCount / testCases.length * 100).toFixed(1) + '%'
      }
    };
  }
}

/**
 * 大规模数据精准度测试
 */
export class LargeScalePrecisionTests {
  
  /**
   * 测试万级节点精准度
   */
  static testTenThousandNodesPrecision() {
    const startTime = performance.now();
    
    // 生成10000个测试节点
    const nodes = this.generateLargeTestDataset(10000);
    
    try {
      const duplicateInfo = findDuplicateNodes(nodes);
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      // 验证结果的合理性
      const duplicateRate = (duplicateInfo.totalDuplicates / nodes.length * 100);
      const avgGroupSize = duplicateInfo.totalDuplicates / duplicateInfo.groups.length;
      
      const passed = processingTime < 10000 && duplicateRate < 50 && avgGroupSize < 10;
      
      return {
        passed,
        reason: passed ? '万级节点处理正常' : '万级节点处理存在问题',
        details: `处理时间: ${processingTime.toFixed(2)}ms, 重复率: ${duplicateRate.toFixed(1)}%, 平均组大小: ${avgGroupSize.toFixed(1)}`,
        metrics: {
          nodeCount: nodes.length,
          processingTime: processingTime,
          duplicateRate: duplicateRate,
          avgGroupSize: avgGroupSize
        }
      };
    } catch (error) {
      return {
        passed: false,
        reason: `万级节点处理异常: ${error.message}`,
        details: error.stack,
        metrics: { nodeCount: nodes.length, error: error.message }
      };
    }
  }

  /**
   * 测试重复率分布
   */
  static testDuplicateRateDistribution() {
    const testSizes = [100, 500, 1000, 5000];
    const results = [];
    
    for (const size of testSizes) {
      const nodes = this.generateLargeTestDataset(size);
      const duplicateInfo = findDuplicateNodes(nodes);
      const duplicateRate = (duplicateInfo.totalDuplicates / nodes.length * 100);
      
      results.push({
        size,
        duplicateRate,
        groupCount: duplicateInfo.groups.length
      });
    }
    
    // 检查重复率是否在合理范围内
    const allRatesReasonable = results.every(r => r.duplicateRate >= 0 && r.duplicateRate <= 80);
    
    return {
      passed: allRatesReasonable,
      reason: allRatesReasonable ? '重复率分布正常' : '重复率分布异常',
      details: results.map(r => `${r.size}节点: ${r.duplicateRate.toFixed(1)}%重复`).join(', '),
      metrics: { results }
    };
  }

  /**
   * 测试内存压力下的精准度
   */
  static testPrecisionUnderMemoryPressure() {
    const initialMemory = process.memoryUsage();
    
    // 创建大量节点数据
    const largeDataset = this.generateLargeTestDataset(50000);
    
    try {
      const startTime = performance.now();
      const duplicateInfo = findDuplicateNodes(largeDataset);
      const endTime = performance.now();
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const processingTime = endTime - startTime;
      
      // 检查内存使用和处理时间是否合理
      const memoryReasonable = memoryIncrease < 500 * 1024 * 1024; // 500MB
      const timeReasonable = processingTime < 30000; // 30秒
      
      const passed = memoryReasonable && timeReasonable;
      
      return {
        passed,
        reason: passed ? '内存压力测试通过' : '内存压力测试失败',
        details: `内存增长: ${(memoryIncrease / 1024 / 1024).toFixed(1)}MB, 处理时间: ${processingTime.toFixed(0)}ms`,
        metrics: {
          memoryIncrease: memoryIncrease,
          processingTime: processingTime,
          nodeCount: largeDataset.length,
          duplicateCount: duplicateInfo.totalDuplicates
        }
      };
    } catch (error) {
      return {
        passed: false,
        reason: `内存压力测试异常: ${error.message}`,
        details: error.stack,
        metrics: { error: error.message }
      };
    }
  }

  /**
   * 生成大规模测试数据集
   */
  static generateLargeTestDataset(size) {
    const nodes = [];
    const protocols = ['vmess', 'vless', 'trojan', 'ss', 'hysteria2'];
    const servers = ['server1.com', 'server2.com', 'server3.com', 'server4.com', 'server5.com'];
    const ports = [443, 80, 8080, 8443, 1080];
    
    for (let i = 0; i < size; i++) {
      const protocol = protocols[i % protocols.length];
      const server = servers[i % servers.length];
      const port = ports[i % ports.length];
      
      let node = {
        name: `test-node-${i}`,
        server: server,
        port: port,
        type: protocol
      };
      
      // 根据协议添加特定字段
      switch (protocol) {
        case 'vmess':
        case 'vless':
          node.uuid = `uuid-${i % 100}`; // 创建一些重复的UUID
          break;
        case 'trojan':
          node.password = `password-${i % 50}`; // 创建一些重复的密码
          break;
        case 'ss':
          node.password = `ss-password-${i % 30}`;
          node.method = 'aes-256-gcm';
          break;
        case 'hysteria2':
          node.password = `hy2-password-${i % 20}`;
          break;
      }
      
      nodes.push(node);
    }
    
    return nodes;
  }
}
