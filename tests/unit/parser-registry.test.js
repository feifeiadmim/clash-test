/**
 * 解析器注册表单元测试
 */

import { describe, it, assert } from './test-framework.js';
import { ParserRegistry } from '../../src/core/parser-registry.js';

describe('解析器注册表测试', () => {
  let registry;
  let mockParser1, mockParser2;

  beforeEach(() => {
    registry = new ParserRegistry();
    
    // 创建模拟解析器
    mockParser1 = {
      name: 'MockParser1',
      test: (content) => content.includes('mock1'),
      parse: (content) => [{ type: 'mock1', content }]
    };

    mockParser2 = {
      name: 'MockParser2',
      test: (content) => content.includes('mock2'),
      parse: (content) => [{ type: 'mock2', content }]
    };
  });

  describe('基础功能', () => {
    it('应该正确初始化', () => {
      assert.isObject(registry);
      assert.isArray(registry.parsers);
      assert.lengthOf(registry.parsers, 0);
      assert.isObject(registry.stats);
    });

    it('应该能注册解析器', () => {
      registry.register(mockParser1);
      
      assert.lengthOf(registry.parsers, 1);
      assert.equal(registry.parsers[0].name, 'MockParser1');
    });

    it('应该能注册多个解析器', () => {
      registry.register(mockParser1);
      registry.register(mockParser2);
      
      assert.lengthOf(registry.parsers, 2);
    });

    it('应该能获取解析器列表', () => {
      registry.register(mockParser1);
      registry.register(mockParser2);
      
      const parsers = registry.getParsers();
      assert.isArray(parsers);
      assert.lengthOf(parsers, 2);
    });

    it('应该能清空解析器', () => {
      registry.register(mockParser1);
      registry.register(mockParser2);
      
      registry.clear();
      assert.lengthOf(registry.parsers, 0);
    });
  });

  describe('解析功能', () => {
    beforeEach(() => {
      registry.register(mockParser1);
      registry.register(mockParser2);
    });

    it('应该能解析匹配的内容', async () => {
      const content = 'test mock1 content';
      const result = await registry.parse(content);
      
      assert.isArray(result);
      assert.lengthOf(result, 1);
      assert.equal(result[0].type, 'mock1');
      assert.equal(result[0].content, content);
    });

    it('应该选择正确的解析器', async () => {
      const content1 = 'test mock1 content';
      const content2 = 'test mock2 content';
      
      const result1 = await registry.parse(content1);
      const result2 = await registry.parse(content2);
      
      assert.equal(result1[0].type, 'mock1');
      assert.equal(result2[0].type, 'mock2');
    });

    it('应该在没有匹配解析器时抛出错误', async () => {
      const content = 'no matching parser';
      
      await assert.rejects(async () => {
        await registry.parse(content);
      }, /No suitable parser found/);
    });

    it('应该处理无效输入', async () => {
      await assert.rejects(async () => {
        await registry.parse(null);
      }, /Invalid content/);

      await assert.rejects(async () => {
        await registry.parse(undefined);
      }, /Invalid content/);

      await assert.rejects(async () => {
        await registry.parse('');
      }, /Invalid content/);
    });
  });

  describe('并发安全性', () => {
    beforeEach(() => {
      registry.register(mockParser1);
    });

    it('应该处理并发解析请求', async () => {
      const content = 'test mock1 content';
      
      // 同时发起多个解析请求
      const promises = Array(5).fill(null).map(() => 
        registry.parse(content)
      );
      
      const results = await Promise.all(promises);
      
      // 所有结果应该相同
      results.forEach(result => {
        assert.isArray(result);
        assert.lengthOf(result, 1);
        assert.equal(result[0].type, 'mock1');
      });
      
      // 统计应该正确
      const stats = registry.getStats();
      assert.ok(stats.concurrentRequests >= 4); // 至少有4个并发请求
    });

    it('应该正确处理相同内容的并发请求', async () => {
      const content = 'test mock1 content';
      
      // 创建延迟解析器来测试并发
      const slowParser = {
        name: 'SlowParser',
        test: (content) => content.includes('mock1'),
        parse: async (content) => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return [{ type: 'slow', content }];
        }
      };
      
      registry.clear();
      registry.register(slowParser);
      
      const startTime = Date.now();
      
      // 同时发起相同内容的解析请求
      const promises = Array(3).fill(null).map(() => 
        registry.parse(content)
      );
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      // 所有结果应该相同
      results.forEach(result => {
        assert.isArray(result);
        assert.lengthOf(result, 1);
        assert.equal(result[0].type, 'slow');
      });
      
      // 由于并发控制，总时间应该接近单次解析时间
      const totalTime = endTime - startTime;
      console.log(`    并发解析耗时: ${totalTime}ms`);
      assert.ok(totalTime < 200, `并发控制失效，耗时过长: ${totalTime}ms`);
    });
  });

  describe('性能优化', () => {
    beforeEach(() => {
      registry.register(mockParser1);
      registry.register(mockParser2);
    });

    it('应该缓存上次成功的解析器', async () => {
      const content = 'test mock1 content';
      
      // 第一次解析
      await registry.parse(content);
      
      // 第二次解析应该使用缓存
      const stats1 = registry.getStats();
      await registry.parse(content);
      const stats2 = registry.getStats();
      
      assert.ok(stats2.cacheHits > stats1.cacheHits);
    });

    it('应该正确统计性能指标', async () => {
      const content1 = 'test mock1 content';
      const content2 = 'test mock2 content';
      
      await registry.parse(content1);
      await registry.parse(content2);
      await registry.parse(content1); // 应该命中缓存
      
      const stats = registry.getStats();
      
      assert.equal(stats.totalAttempts, 3);
      assert.equal(stats.successfulParses, 3);
      assert.ok(stats.cacheHits >= 1);
    });
  });

  describe('错误处理', () => {
    it('应该处理解析器抛出的错误', async () => {
      const errorParser = {
        name: 'ErrorParser',
        test: (content) => content.includes('error'),
        parse: (content) => {
          throw new Error('Parser error');
        }
      };
      
      registry.register(errorParser);
      
      await assert.rejects(async () => {
        await registry.parse('test error content');
      }, /Parser error/);
    });

    it('应该处理test方法抛出的错误', async () => {
      const errorParser = {
        name: 'ErrorTestParser',
        test: (content) => {
          throw new Error('Test error');
        },
        parse: (content) => [{ type: 'test', content }]
      };
      
      registry.register(mockParser1); // 添加一个正常的解析器
      registry.register(errorParser);
      
      // 应该跳过错误的解析器，使用正常的解析器
      const result = await registry.parse('test mock1 content');
      assert.isArray(result);
      assert.equal(result[0].type, 'mock1');
    });
  });

  describe('统计信息', () => {
    beforeEach(() => {
      registry.register(mockParser1);
      registry.register(mockParser2);
    });

    it('应该正确重置统计信息', async () => {
      await registry.parse('test mock1 content');
      
      let stats = registry.getStats();
      assert.ok(stats.totalAttempts > 0);
      
      registry.resetStats();
      stats = registry.getStats();
      
      assert.equal(stats.totalAttempts, 0);
      assert.equal(stats.successfulParses, 0);
      assert.equal(stats.cacheHits, 0);
    });

    it('应该提供详细的统计信息', async () => {
      await registry.parse('test mock1 content');
      await registry.parse('test mock2 content');
      
      const stats = registry.getStats();
      
      assert.isNumber(stats.totalAttempts);
      assert.isNumber(stats.successfulParses);
      assert.isNumber(stats.cacheHits);
      assert.isNumber(stats.concurrentRequests);
      
      assert.ok(stats.totalAttempts >= 2);
      assert.ok(stats.successfulParses >= 2);
    });
  });
});
