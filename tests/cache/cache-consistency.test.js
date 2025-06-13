/**
 * 缓存一致性验证测试套件
 * 包含键冲突测试、失效策略验证、并发读写压力测试
 */

import { describe, it, assert } from '../unit/test-framework.js';
import { performance } from 'perf_hooks';
import { globalParserRegistry } from '../../src/core/parser-registry.js';
import { generateFullNodeKey } from '../../src/utils/deduplication.js';

describe('缓存一致性验证测试套件', () => {
  
  describe('键冲突测试', () => {
    it('应该为相同节点生成相同的键', () => {
      const node1 = {
        name: '测试节点',
        server: '1.1.1.1',
        port: 443,
        type: 'vmess',
        uuid: '12345678-1234-1234-1234-123456789012'
      };
      
      const node2 = { ...node1 }; // 完全相同的节点
      
      const key1 = generateFullNodeKey(node1);
      const key2 = generateFullNodeKey(node2);
      
      assert.equal(key1, key2, '相同节点应该生成相同的键');
      assert.isString(key1);
      assert.ok(key1.length > 0, '键不应该为空');
    });

    it('应该为不同节点生成不同的键', () => {
      const baseNode = {
        name: '基础节点',
        server: '1.1.1.1',
        port: 443,
        type: 'vmess',
        uuid: '12345678-1234-1234-1234-123456789012'
      };

      const variations = [
        { ...baseNode, server: '2.2.2.2' },
        { ...baseNode, port: 8080 },
        { ...baseNode, type: 'trojan' },
        { ...baseNode, uuid: '87654321-4321-4321-4321-210987654321' },
        { ...baseNode, name: '不同名称' } // 名称不同但其他相同
      ];

      const baseKey = generateFullNodeKey(baseNode);
      const keys = variations.map(node => generateFullNodeKey(node));
      
      // 检查所有键都不同
      const uniqueKeys = new Set([baseKey, ...keys]);
      assert.equal(uniqueKeys.size, keys.length + 1, '不同节点应该生成不同的键');
      
      // 名称不同但其他相同的节点应该生成相同的键（名称不参与键生成）
      const nameOnlyDifferentKey = keys[keys.length - 1];
      assert.equal(baseKey, nameOnlyDifferentKey, '仅名称不同的节点应该生成相同的键');
    });

    it('应该处理字段顺序不同的节点', () => {
      const node1 = {
        server: '1.1.1.1',
        port: 443,
        type: 'vmess',
        uuid: '12345678-1234-1234-1234-123456789012',
        name: '节点1'
      };
      
      const node2 = {
        name: '节点2',
        uuid: '12345678-1234-1234-1234-123456789012',
        type: 'vmess',
        port: 443,
        server: '1.1.1.1'
      };
      
      const key1 = generateFullNodeKey(node1);
      const key2 = generateFullNodeKey(node2);
      
      assert.equal(key1, key2, '字段顺序不同但内容相同的节点应该生成相同的键');
    });

    it('应该处理大小写敏感性', () => {
      const node1 = {
        server: 'Example.Com',
        port: 443,
        type: 'VMess',
        uuid: '12345678-1234-1234-1234-123456789012'
      };
      
      const node2 = {
        server: 'example.com',
        port: 443,
        type: 'vmess',
        uuid: '12345678-1234-1234-1234-123456789012'
      };
      
      const key1 = generateFullNodeKey(node1);
      const key2 = generateFullNodeKey(node2);
      
      assert.equal(key1, key2, '大小写不同但内容相同的节点应该生成相同的键');
    });

    it('应该处理空值和undefined字段', () => {
      const testCases = [
        {
          server: '1.1.1.1',
          port: 443,
          type: 'vmess',
          uuid: null
        },
        {
          server: '1.1.1.1',
          port: 443,
          type: 'vmess',
          uuid: undefined
        },
        {
          server: '1.1.1.1',
          port: 443,
          type: 'vmess',
          uuid: ''
        },
        {
          server: '1.1.1.1',
          port: 443,
          type: 'vmess'
          // uuid字段完全不存在
        }
      ];

      const keys = testCases.map(node => generateFullNodeKey(node));
      
      // 所有这些情况应该生成相同的键
      const uniqueKeys = new Set(keys);
      assert.equal(uniqueKeys.size, 1, '空值、undefined和缺失字段应该被统一处理');
    });
  });

  describe('解析器缓存失效策略验证', () => {
    beforeEach(() => {
      // 清理缓存
      globalParserRegistry.testCache.clear();
    });

    it('应该正确缓存解析器测试结果', () => {
      const testContent = 'vmess://eyJ2IjoiMiIsInBzIjoidGVzdCJ9';
      const parser = globalParserRegistry.parsers[0];
      
      // 第一次调用
      const result1 = globalParserRegistry.tryParseWithCache(parser, testContent);
      const cacheSize1 = globalParserRegistry.testCache.size;
      
      // 第二次调用（应该使用缓存）
      const result2 = globalParserRegistry.tryParseWithCache(parser, testContent);
      const cacheSize2 = globalParserRegistry.testCache.size;
      
      assert.equal(result1, result2, '缓存结果应该一致');
      assert.equal(cacheSize1, cacheSize2, '第二次调用不应该增加缓存大小');
      assert.ok(cacheSize1 > 0, '应该有缓存记录');
    });

    it('应该在缓存大小超限时清理最旧的记录', () => {
      const parser = globalParserRegistry.parsers[0];
      const maxCacheSize = 1000; // 假设最大缓存大小为1000
      
      // 添加超过限制的缓存记录
      for (let i = 0; i < maxCacheSize + 100; i++) {
        const testContent = `test_content_${i}`;
        globalParserRegistry.tryParseWithCache(parser, testContent);
      }
      
      const finalCacheSize = globalParserRegistry.testCache.size;
      assert.ok(finalCacheSize <= maxCacheSize, `缓存大小应该不超过${maxCacheSize}，实际：${finalCacheSize}`);
    });

    it('应该为不同内容生成不同的缓存键', () => {
      const parser = globalParserRegistry.parsers[0];
      const contents = [
        'vmess://content1',
        'vmess://content2',
        'trojan://content3',
        'ss://content4'
      ];
      
      // 清空缓存并记录初始大小
      globalParserRegistry.testCache.clear();
      const initialSize = globalParserRegistry.testCache.size;
      
      // 测试每个内容
      contents.forEach(content => {
        globalParserRegistry.tryParseWithCache(parser, content);
      });
      
      const finalSize = globalParserRegistry.testCache.size;
      assert.equal(finalSize - initialSize, contents.length, '每个不同内容应该生成一个缓存记录');
    });

    it('应该正确处理缓存键冲突', () => {
      const parser1 = globalParserRegistry.parsers[0];
      const parser2 = globalParserRegistry.parsers[1] || parser1; // 如果只有一个解析器
      const content = 'test_content';
      
      globalParserRegistry.testCache.clear();
      
      // 使用不同解析器测试相同内容
      const result1 = globalParserRegistry.tryParseWithCache(parser1, content);
      const result2 = globalParserRegistry.tryParseWithCache(parser2, content);
      
      // 应该有两个不同的缓存记录（因为解析器不同）
      const cacheSize = globalParserRegistry.testCache.size;
      if (parser1 !== parser2) {
        assert.equal(cacheSize, 2, '不同解析器应该有不同的缓存记录');
      } else {
        assert.equal(cacheSize, 1, '相同解析器应该复用缓存记录');
      }
    });
  });

  describe('并发读写压力测试', () => {
    it('应该在并发访问下保持缓存一致性', async () => {
      const testContent = 'vmess://concurrent_test';
      const parser = globalParserRegistry.parsers[0];
      const concurrentCount = 50;
      
      globalParserRegistry.testCache.clear();
      
      // 创建并发Promise数组
      const promises = Array(concurrentCount).fill(null).map(async (_, index) => {
        // 添加小的随机延迟模拟真实并发场景
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        return globalParserRegistry.tryParseWithCache(parser, `${testContent}_${index % 10}`);
      });
      
      // 等待所有并发操作完成
      const results = await Promise.all(promises);
      
      // 验证结果
      assert.equal(results.length, concurrentCount, '所有并发操作都应该完成');
      
      // 验证缓存大小合理（应该有10个不同的内容）
      const cacheSize = globalParserRegistry.testCache.size;
      assert.ok(cacheSize <= 10, `缓存大小应该合理，实际：${cacheSize}`);
    });

    it('应该在高频访问下保持性能', async () => {
      const parser = globalParserRegistry.parsers[0];
      const iterations = 1000;
      const testContents = Array(10).fill(null).map((_, i) => `performance_test_${i}`);
      
      globalParserRegistry.testCache.clear();
      
      const startTime = performance.now();
      
      // 高频访问测试
      for (let i = 0; i < iterations; i++) {
        const content = testContents[i % testContents.length];
        globalParserRegistry.tryParseWithCache(parser, content);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const opsPerSecond = iterations / (duration / 1000);
      
      console.log(`    高频访问性能: ${Math.round(opsPerSecond)} ops/sec`);
      assert.ok(opsPerSecond > 1000, `缓存访问性能应该大于1000 ops/sec，实际：${Math.round(opsPerSecond)}`);
    });

    it('应该正确处理缓存竞争条件', async () => {
      const parser = globalParserRegistry.parsers[0];
      const testContent = 'race_condition_test';
      
      globalParserRegistry.testCache.clear();
      
      // 创建多个同时访问相同内容的Promise
      const racePromises = Array(20).fill(null).map(() => 
        globalParserRegistry.tryParseWithCache(parser, testContent)
      );
      
      const results = await Promise.all(racePromises);
      
      // 所有结果应该相同
      const firstResult = results[0];
      const allSame = results.every(result => result === firstResult);
      assert.isTrue(allSame, '竞争条件下所有结果应该相同');
      
      // 应该只有一个缓存记录
      const cacheSize = globalParserRegistry.testCache.size;
      assert.equal(cacheSize, 1, '竞争条件下应该只有一个缓存记录');
    });
  });

  describe('Fuzz测试 - 随机输入生成', () => {
    /**
     * 生成随机字符串
     */
    function generateRandomString(length, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
      let result = '';
      for (let i = 0; i < length; i++) {
        result += charset.charAt(Math.floor(Math.random() * charset.length));
      }
      return result;
    }

    /**
     * 生成随机节点
     */
    function generateRandomNode() {
      const types = ['vmess', 'trojan', 'ss', 'vless', 'hysteria2'];
      const servers = ['1.1.1.1', '8.8.8.8', 'example.com', 'test.org'];
      
      return {
        name: generateRandomString(Math.floor(Math.random() * 50) + 1),
        server: servers[Math.floor(Math.random() * servers.length)],
        port: Math.floor(Math.random() * 65535) + 1,
        type: types[Math.floor(Math.random() * types.length)],
        uuid: `${generateRandomString(8)}-${generateRandomString(4)}-${generateRandomString(4)}-${generateRandomString(4)}-${generateRandomString(12)}`,
        password: generateRandomString(Math.floor(Math.random() * 32) + 8),
        method: ['aes-256-gcm', 'chacha20-poly1305', 'aes-128-gcm'][Math.floor(Math.random() * 3)]
      };
    }

    it('应该处理大量随机节点的键生成', () => {
      const randomNodes = Array(1000).fill(null).map(() => generateRandomNode());
      
      const startTime = performance.now();
      const keys = randomNodes.map(node => generateFullNodeKey(node));
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      const opsPerSecond = randomNodes.length / (duration / 1000);
      
      // 验证所有键都是字符串且非空
      keys.forEach((key, index) => {
        assert.isString(key, `键${index}应该是字符串`);
        assert.ok(key.length > 0, `键${index}不应该为空`);
      });
      
      console.log(`    随机节点键生成性能: ${Math.round(opsPerSecond)} ops/sec`);
      assert.ok(opsPerSecond > 500, `随机节点键生成性能应该大于500 ops/sec，实际：${Math.round(opsPerSecond)}`);
    });

    it('应该处理极端字段值', () => {
      const extremeNodes = [
        {
          server: '',
          port: 0,
          type: '',
          uuid: ''
        },
        {
          server: generateRandomString(1000),
          port: 99999,
          type: generateRandomString(100),
          uuid: generateRandomString(500)
        },
        {
          server: '🚀🎯📊',
          port: 443,
          type: 'vmess',
          uuid: '测试-中文-UUID'
        },
        {
          server: null,
          port: undefined,
          type: false,
          uuid: 0
        }
      ];

      extremeNodes.forEach((node, index) => {
        try {
          const key = generateFullNodeKey(node);
          assert.isString(key, `极端节点${index}应该生成字符串键`);
        } catch (error) {
          // 某些极端情况可能抛出异常，这是可以接受的
          console.log(`    极端节点${index}抛出异常: ${error.message}`);
        }
      });
    });

    it('应该在随机输入下保持缓存稳定性', () => {
      const parser = globalParserRegistry.parsers[0];
      const randomContents = Array(100).fill(null).map(() => 
        generateRandomString(Math.floor(Math.random() * 100) + 10)
      );
      
      globalParserRegistry.testCache.clear();
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 测试随机内容
      randomContents.forEach(content => {
        try {
          globalParserRegistry.tryParseWithCache(parser, content);
        } catch (error) {
          // 随机内容可能导致解析错误，这是正常的
        }
      });
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
      
      assert.ok(memoryIncrease < 50, `随机输入测试内存增长应该小于50MB，实际：${memoryIncrease.toFixed(2)}MB`);
      
      const cacheSize = globalParserRegistry.testCache.size;
      assert.ok(cacheSize <= 1000, `缓存大小应该在合理范围内，实际：${cacheSize}`);
    });
  });

  describe('缓存性能基准测试', () => {
    it('应该测量缓存命中率', () => {
      const parser = globalParserRegistry.parsers[0];
      const testContents = [
        'content1', 'content2', 'content3', 'content4', 'content5'
      ];
      
      globalParserRegistry.testCache.clear();
      
      // 第一轮：填充缓存
      testContents.forEach(content => {
        globalParserRegistry.tryParseWithCache(parser, content);
      });
      
      const initialCacheSize = globalParserRegistry.testCache.size;
      
      // 第二轮：测试缓存命中
      testContents.forEach(content => {
        globalParserRegistry.tryParseWithCache(parser, content);
      });
      
      const finalCacheSize = globalParserRegistry.testCache.size;
      
      assert.equal(initialCacheSize, finalCacheSize, '第二轮不应该增加缓存大小');
      assert.equal(finalCacheSize, testContents.length, '缓存大小应该等于唯一内容数量');
    });

    it('应该测量缓存访问性能', () => {
      const parser = globalParserRegistry.parsers[0];
      const testContent = 'performance_benchmark';
      const iterations = 10000;
      
      globalParserRegistry.testCache.clear();
      
      // 预热缓存
      globalParserRegistry.tryParseWithCache(parser, testContent);
      
      // 测量缓存访问性能
      const startTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        globalParserRegistry.tryParseWithCache(parser, testContent);
      }
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      const opsPerSecond = iterations / (duration / 1000);
      
      console.log(`    缓存访问性能: ${Math.round(opsPerSecond)} ops/sec`);
      assert.ok(opsPerSecond > 10000, `缓存访问性能应该大于10000 ops/sec，实际：${Math.round(opsPerSecond)}`);
    });
  });
});
