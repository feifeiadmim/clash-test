/**
 * 去重模块单元测试
 */

import { describe, it, assert } from './test-framework.js';
import { 
  DeduplicationEngine, 
  DeduplicationStrategy,
  unifiedDeduplicate,
  deduplicateByType,
  customDeduplicate,
  batchDeduplicate
} from '../../src/utils/deduplication.js';

describe('去重模块测试', () => {
  let engine;
  let testNodes;

  beforeEach(() => {
    engine = new DeduplicationEngine();
    testNodes = [
      {
        name: 'test1',
        server: '1.1.1.1',
        port: 443,
        type: 'vmess',
        uuid: 'test-uuid-1'
      },
      {
        name: 'test2',
        server: '1.1.1.1',
        port: 443,
        type: 'vmess',
        uuid: 'test-uuid-1'
      },
      {
        name: 'test3',
        server: '2.2.2.2',
        port: 443,
        type: 'trojan',
        password: 'test-pass'
      }
    ];
  });

  describe('DeduplicationEngine', () => {
    it('应该正确初始化', () => {
      assert.isObject(engine);
      assert.isFunction(engine.deduplicate);
      assert.isObject(engine.stats);
    });

    it('应该正确去重相同节点', () => {
      const result = engine.deduplicate(testNodes, {
        strategy: DeduplicationStrategy.FULL,
        action: 'delete'
      });

      assert.isArray(result);
      assert.lengthOf(result, 2); // 应该去掉一个重复节点
      assert.equal(result[0].name, 'test1');
      assert.equal(result[1].name, 'test3');
    });

    it('应该正确处理空数组', () => {
      const result = engine.deduplicate([], {
        strategy: DeduplicationStrategy.FULL
      });

      assert.isArray(result);
      assert.lengthOf(result, 0);
    });

    it('应该正确处理单个节点', () => {
      const singleNode = [testNodes[0]];
      const result = engine.deduplicate(singleNode, {
        strategy: DeduplicationStrategy.FULL
      });

      assert.isArray(result);
      assert.lengthOf(result, 1);
      assert.deepEqual(result[0], testNodes[0]);
    });

    it('应该正确统计去重信息', () => {
      engine.deduplicate(testNodes, {
        strategy: DeduplicationStrategy.FULL,
        action: 'delete'
      });

      const stats = engine.getStats();
      assert.isObject(stats);
      assert.isNumber(stats.totalProcessed);
      assert.isNumber(stats.duplicatesFound);
      assert.equal(stats.totalProcessed, 3);
      assert.equal(stats.duplicatesFound, 1);
    });
  });

  describe('统一去重接口', () => {
    it('unifiedDeduplicate 应该正常工作', () => {
      const result = unifiedDeduplicate(testNodes, 'full', {
        action: 'delete'
      });

      assert.isArray(result);
      assert.lengthOf(result, 2);
    });

    it('应该支持不同的去重策略', () => {
      const strategies = ['full', 'custom', 'batch', 'byType'];
      
      for (const strategy of strategies) {
        const result = unifiedDeduplicate(testNodes, strategy, {
          action: 'delete',
          keyGenerator: strategy === 'custom' ? (node) => `${node.server}:${node.port}` : undefined
        });

        assert.isArray(result);
        // 每种策略都应该返回有效结果
        assert.ok(result.length >= 0);
      }
    });

    it('应该处理未知策略', () => {
      const result = unifiedDeduplicate(testNodes, 'unknown', {
        action: 'delete'
      });

      assert.isArray(result);
      // 应该回退到默认策略
      assert.lengthOf(result, 2);
    });
  });

  describe('向后兼容性测试', () => {
    it('deduplicateByType 应该正常工作', () => {
      const result = deduplicateByType(testNodes, {
        action: 'delete'
      });

      assert.isArray(result);
      assert.ok(result.length > 0);
    });

    it('customDeduplicate 应该正常工作', () => {
      const keyGenerator = (node) => `${node.server}:${node.port}`;
      const result = customDeduplicate(testNodes, keyGenerator, true);

      assert.isArray(result);
      assert.lengthOf(result, 2); // 应该去掉重复的server:port组合
    });

    it('batchDeduplicate 应该正常工作', () => {
      const result = batchDeduplicate(testNodes, {
        batchSize: 2,
        action: 'delete'
      });

      assert.isArray(result);
      assert.ok(result.length > 0);
    });
  });

  describe('性能测试', () => {
    it('应该能处理大量节点', () => {
      // 生成大量测试数据
      const largeNodeSet = [];
      for (let i = 0; i < 1000; i++) {
        largeNodeSet.push({
          name: `test${i}`,
          server: `${i % 100}.1.1.1`, // 创建一些重复
          port: 443,
          type: 'vmess',
          uuid: `uuid-${i % 50}` // 创建一些重复
        });
      }

      const startTime = performance.now();
      const result = unifiedDeduplicate(largeNodeSet, 'full', {
        action: 'delete'
      });
      const endTime = performance.now();

      assert.isArray(result);
      assert.ok(result.length < largeNodeSet.length); // 应该有去重效果
      
      const duration = endTime - startTime;
      console.log(`    处理1000个节点耗时: ${Math.round(duration)}ms`);
      
      // 性能要求：1000个节点应该在1秒内处理完成
      assert.ok(duration < 1000, `处理时间过长: ${duration}ms`);
    });

    it('应该有合理的内存使用', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 处理大量数据
      const largeNodeSet = Array(5000).fill(null).map((_, i) => ({
        name: `test${i}`,
        server: `${i % 200}.1.1.1`,
        port: 443,
        type: 'vmess'
      }));

      unifiedDeduplicate(largeNodeSet, 'full');
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      console.log(`    内存增长: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
      
      // 内存增长应该在合理范围内（小于50MB）
      assert.ok(memoryIncrease < 50 * 1024 * 1024, 
        `内存使用过多: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
    });
  });

  describe('边界条件测试', () => {
    it('应该处理null和undefined', () => {
      assert.throws(() => {
        unifiedDeduplicate(null);
      });

      assert.throws(() => {
        unifiedDeduplicate(undefined);
      });
    });

    it('应该处理包含null节点的数组', () => {
      const nodesWithNull = [
        testNodes[0],
        null,
        testNodes[1],
        undefined,
        testNodes[2]
      ];

      const result = unifiedDeduplicate(nodesWithNull, 'full', {
        action: 'delete'
      });

      assert.isArray(result);
      // 应该过滤掉null和undefined
      assert.ok(result.every(node => node !== null && node !== undefined));
    });

    it('应该处理缺少关键字段的节点', () => {
      const incompleteNodes = [
        { name: 'incomplete1' }, // 缺少server
        { server: '1.1.1.1' }, // 缺少port
        { server: '2.2.2.2', port: 443 } // 完整节点
      ];

      const result = unifiedDeduplicate(incompleteNodes, 'full', {
        action: 'delete'
      });

      assert.isArray(result);
      assert.ok(result.length > 0);
    });
  });
});
