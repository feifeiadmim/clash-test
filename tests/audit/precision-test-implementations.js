/**
 * 精准度测试具体实现
 */

import { generateFullNodeKey } from '../../src/utils/deduplication.js';

/**
 * 基础精准度测试实现
 */
export class BasicPrecisionTests {
  
  /**
   * 测试完全相同节点识别
   */
  static testIdenticalNodes() {
    const node1 = {
      name: 'test-node-1',
      server: 'example.com',
      port: 443,
      type: 'vmess',
      uuid: 'test-uuid-123',
      alterId: 0,
      security: 'auto'
    };
    
    const node2 = {
      name: 'test-node-2', // 不同的名称
      server: 'example.com',
      port: 443,
      type: 'vmess',
      uuid: 'test-uuid-123',
      alterId: 0,
      security: 'auto'
    };
    
    const key1 = generateFullNodeKey(node1);
    const key2 = generateFullNodeKey(node2);
    
    const passed = key1 === key2;
    
    return {
      passed,
      reason: passed ? '完全相同的配置被正确识别为重复' : '相同配置的节点未被识别为重复',
      details: `键1: ${key1}, 键2: ${key2}`,
      metrics: { keyLength: key1.length, identical: passed }
    };
  }

  /**
   * 测试字段顺序无关性
   */
  static testFieldOrderIndependence() {
    const node1 = {
      server: 'example.com',
      port: 443,
      type: 'trojan',
      password: 'password123',
      sni: 'example.com'
    };
    
    const node2 = {
      type: 'trojan',
      password: 'password123',
      server: 'example.com',
      sni: 'example.com',
      port: 443
    };
    
    const key1 = generateFullNodeKey(node1);
    const key2 = generateFullNodeKey(node2);
    
    const passed = key1 === key2;
    
    return {
      passed,
      reason: passed ? '字段顺序不影响去重判断' : '字段顺序影响了去重判断',
      details: `键1: ${key1}, 键2: ${key2}`,
      metrics: { orderIndependent: passed }
    };
  }

  /**
   * 测试大小写标准化
   */
  static testCaseNormalization() {
    const testCases = [
      {
        node1: { server: 'Example.Com', port: 443, type: 'VMess', uuid: 'UUID-123' },
        node2: { server: 'example.com', port: 443, type: 'vmess', uuid: 'uuid-123' },
        shouldMatch: true,
        description: '服务器域名和协议类型大小写'
      },
      {
        node1: { server: 'test.com', port: 443, type: 'ss', method: 'AES-256-GCM', password: 'PASS' },
        node2: { server: 'test.com', port: 443, type: 'ss', method: 'aes-256-gcm', password: 'pass' },
        shouldMatch: true,
        description: '加密方法和密码大小写'
      }
    ];
    
    let allPassed = true;
    const details = [];
    
    for (const testCase of testCases) {
      const key1 = generateFullNodeKey(testCase.node1);
      const key2 = generateFullNodeKey(testCase.node2);
      const matches = key1 === key2;
      
      if (matches !== testCase.shouldMatch) {
        allPassed = false;
        details.push(`${testCase.description}: 预期${testCase.shouldMatch ? '匹配' : '不匹配'}，实际${matches ? '匹配' : '不匹配'}`);
      }
    }
    
    return {
      passed: allPassed,
      reason: allPassed ? '大小写标准化正确' : '大小写标准化存在问题',
      details: details.join('; '),
      metrics: { testCases: testCases.length, passed: allPassed }
    };
  }

  /**
   * 测试空格和trim处理
   */
  static testWhitespaceHandling() {
    const testCases = [
      {
        node1: { server: ' example.com ', port: 443, type: ' vmess ', uuid: ' uuid-123 ' },
        node2: { server: 'example.com', port: 443, type: 'vmess', uuid: 'uuid-123' },
        shouldMatch: true,
        description: '前后空格处理'
      },
      {
        node1: { server: 'example.com', port: 443, type: 'trojan', password: 'pass\t123' },
        node2: { server: 'example.com', port: 443, type: 'trojan', password: 'pass 123' },
        shouldMatch: false,
        description: 'Tab和空格应该被区分'
      }
    ];
    
    let allPassed = true;
    const details = [];
    
    for (const testCase of testCases) {
      const key1 = generateFullNodeKey(testCase.node1);
      const key2 = generateFullNodeKey(testCase.node2);
      const matches = key1 === key2;
      
      if (matches !== testCase.shouldMatch) {
        allPassed = false;
        details.push(`${testCase.description}: 预期${testCase.shouldMatch ? '匹配' : '不匹配'}，实际${matches ? '匹配' : '不匹配'}`);
      }
    }
    
    return {
      passed: allPassed,
      reason: allPassed ? '空格处理正确' : '空格处理存在问题',
      details: details.join('; '),
      metrics: { testCases: testCases.length, passed: allPassed }
    };
  }

  /**
   * 测试数值类型标准化
   */
  static testNumericTypeNormalization() {
    const testCases = [
      {
        node1: { server: 'example.com', port: 443, type: 'vmess', uuid: 'uuid', alterId: 0 },
        node2: { server: 'example.com', port: '443', type: 'vmess', uuid: 'uuid', alterId: '0' },
        shouldMatch: true,
        description: '数字和字符串形式的端口和alterId'
      },
      {
        node1: { server: 'example.com', port: 8080, type: 'ss', password: 'pass' },
        node2: { server: 'example.com', port: '8080', type: 'ss', password: 'pass' },
        shouldMatch: true,
        description: '端口号类型标准化'
      }
    ];
    
    let allPassed = true;
    const details = [];
    
    for (const testCase of testCases) {
      const key1 = generateFullNodeKey(testCase.node1);
      const key2 = generateFullNodeKey(testCase.node2);
      const matches = key1 === key2;
      
      if (matches !== testCase.shouldMatch) {
        allPassed = false;
        details.push(`${testCase.description}: 预期${testCase.shouldMatch ? '匹配' : '不匹配'}，实际${matches ? '匹配' : '不匹配'}`);
      }
    }
    
    return {
      passed: allPassed,
      reason: allPassed ? '数值类型标准化正确' : '数值类型标准化存在问题',
      details: details.join('; '),
      metrics: { testCases: testCases.length, passed: allPassed }
    };
  }
}

/**
 * 协议特定精准度测试
 */
export class ProtocolPrecisionTests {
  
  /**
   * VMess协议精准度测试
   */
  static testVMessPrecision() {
    const testCases = [
      {
        name: 'VMess基础配置',
        node1: {
          type: 'vmess',
          server: 'vmess.example.com',
          port: 443,
          uuid: 'vmess-uuid-123',
          alterId: 0,
          security: 'auto',
          network: 'tcp'
        },
        node2: {
          type: 'vmess',
          server: 'vmess.example.com',
          port: 443,
          uuid: 'vmess-uuid-123',
          alterId: 0,
          security: 'auto'
          // 缺少network字段，应该默认为tcp
        },
        shouldMatch: false, // 修复后应该区分显式和隐式
        description: '显式tcp vs 隐式tcp'
      },
      {
        name: 'VMess WebSocket配置',
        node1: {
          type: 'vmess',
          server: 'vmess.example.com',
          port: 443,
          uuid: 'vmess-uuid-123',
          network: 'ws',
          path: '/vmess',
          host: 'vmess.example.com'
        },
        node2: {
          type: 'vmess',
          server: 'vmess.example.com',
          port: 443,
          uuid: 'vmess-uuid-123',
          network: 'ws',
          path: '/vmess',
          host: 'vmess.example.com',
          headers: { 'User-Agent': 'Mozilla/5.0' }
        },
        shouldMatch: false,
        description: 'WebSocket headers差异'
      },
      {
        name: 'VMess TLS配置',
        node1: {
          type: 'vmess',
          server: 'vmess.example.com',
          port: 443,
          uuid: 'vmess-uuid-123',
          tls: true
        },
        node2: {
          type: 'vmess',
          server: 'vmess.example.com',
          port: 443,
          uuid: 'vmess-uuid-123',
          tls: { enabled: true }
        },
        shouldMatch: false, // 修复后应该区分布尔值和对象形式
        description: 'TLS布尔值 vs 对象形式'
      }
    ];
    
    return this.runProtocolTestCases('VMess', testCases);
  }

  /**
   * VLESS协议精准度测试
   */
  static testVLESSPrecision() {
    const testCases = [
      {
        name: 'VLESS基础配置',
        node1: {
          type: 'vless',
          server: 'vless.example.com',
          port: 443,
          uuid: 'vless-uuid-123',
          encryption: 'none'
        },
        node2: {
          type: 'vless',
          server: 'vless.example.com',
          port: 443,
          uuid: 'vless-uuid-123',
          encryption: 'none',
          flow: ''
        },
        shouldMatch: false, // 修复后应该区分
        description: '缺失flow vs 空flow'
      },
      {
        name: 'VLESS Reality配置',
        node1: {
          type: 'vless',
          server: 'vless.example.com',
          port: 443,
          uuid: 'vless-uuid-123',
          reality: {
            publicKey: 'pubkey123',
            shortId: 'short123'
          }
        },
        node2: {
          type: 'vless',
          server: 'vless.example.com',
          port: 443,
          uuid: 'vless-uuid-123',
          reality: {
            publicKey: 'pubkey123',
            shortId: 'short123',
            spiderX: '/spider'
          }
        },
        shouldMatch: false,
        description: 'Reality扩展配置差异'
      }
    ];
    
    return this.runProtocolTestCases('VLESS', testCases);
  }

  /**
   * Trojan协议精准度测试
   */
  static testTrojanPrecision() {
    const testCases = [
      {
        name: 'Trojan基础配置',
        node1: {
          type: 'trojan',
          server: 'trojan.example.com',
          port: 443,
          password: 'trojan-password',
          sni: 'trojan.example.com'
        },
        node2: {
          type: 'trojan',
          server: 'trojan.example.com',
          port: 443,
          password: 'trojan-password',
          host: 'trojan.example.com'
        },
        shouldMatch: false, // 修复后应该区分sni和host
        description: 'SNI vs Host字段'
      },
      {
        name: 'Trojan WebSocket配置',
        node1: {
          type: 'trojan',
          server: 'trojan.example.com',
          port: 443,
          password: 'trojan-password',
          network: 'ws'
        },
        node2: {
          type: 'trojan',
          server: 'trojan.example.com',
          port: 443,
          password: 'trojan-password',
          network: 'ws',
          wsSettings: {}
        },
        shouldMatch: false, // 修复后应该区分
        description: '无wsSettings vs 空wsSettings'
      }
    ];
    
    return this.runProtocolTestCases('Trojan', testCases);
  }

  /**
   * 运行协议测试用例
   */
  static runProtocolTestCases(protocolName, testCases) {
    let allPassed = true;
    const details = [];
    let passedCount = 0;
    
    for (const testCase of testCases) {
      const key1 = generateFullNodeKey(testCase.node1);
      const key2 = generateFullNodeKey(testCase.node2);
      const matches = key1 === key2;
      
      if (matches === testCase.shouldMatch) {
        passedCount++;
      } else {
        allPassed = false;
        details.push(`${testCase.description}: 预期${testCase.shouldMatch ? '匹配' : '不匹配'}，实际${matches ? '匹配' : '不匹配'}`);
      }
    }
    
    return {
      passed: allPassed,
      reason: allPassed ? `${protocolName}协议精准度测试全部通过` : `${protocolName}协议精准度测试存在问题`,
      details: details.join('; '),
      metrics: { 
        protocol: protocolName,
        totalTests: testCases.length, 
        passedTests: passedCount,
        accuracy: (passedCount / testCases.length * 100).toFixed(1) + '%'
      }
    };
  }
}
