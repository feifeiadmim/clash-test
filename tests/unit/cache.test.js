/**
 * 缓存模块单元测试
 */

import { describe, it, assert } from './test-framework.js';
import { ParseCache } from '../../src/parsers/common/cache.js';

describe('缓存模块测试', () => {
  let cache;

  beforeEach(() => {
    cache = new ParseCache(100, 1000); // 小容量，短TTL用于测试
  });

  afterEach(() => {
    if (cache) {
      cache.cleanup();
    }
  });

  describe('基础功能', () => {
    it('应该正确初始化', () => {
      assert.isObject(cache);
      assert.equal(cache.maxSize, 100);
      assert.equal(cache.ttl, 1000);
      assert.isObject(cache.stats);
    });

    it('应该能存储和获取数据', () => {
      const key = 'test-key';
      const value = { data: 'test-value' };
      
      cache.set(key, value);
      const retrieved = cache.get(key);
      
      assert.deepEqual(retrieved, value);
    });

    it('应该正确处理缓存未命中', () => {
      const result = cache.get('non-existent-key');
      assert.equal(result, null);
    });

    it('应该能检查键是否存在', () => {
      const key = 'test-key';
      const value = { data: 'test-value' };
      
      assert.equal(cache.has(key), false);
      
      cache.set(key, value);
      assert.equal(cache.has(key), true);
    });

    it('应该能删除缓存项', () => {
      const key = 'test-key';
      const value = { data: 'test-value' };
      
      cache.set(key, value);
      assert.equal(cache.has(key), true);
      
      cache.delete(key);
      assert.equal(cache.has(key), false);
    });

    it('应该能清空所有缓存', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      assert.equal(cache.size(), 2);
      
      cache.clear();
      assert.equal(cache.size(), 0);
    });
  });

  describe('LRU功能', () => {
    it('应该在达到最大容量时移除最久未使用的项', () => {
      const smallCache = new ParseCache(3, 10000); // 容量为3
      
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      
      assert.equal(smallCache.size(), 3);
      
      // 添加第4个项，应该移除key1
      smallCache.set('key4', 'value4');
      
      assert.equal(smallCache.size(), 3);
      assert.equal(smallCache.has('key1'), false);
      assert.equal(smallCache.has('key4'), true);
      
      smallCache.cleanup();
    });

    it('应该在访问时更新LRU顺序', () => {
      const smallCache = new ParseCache(3, 10000);
      
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      
      // 访问key1，使其成为最近使用的
      smallCache.get('key1');
      
      // 添加新项，应该移除key2（最久未使用）
      smallCache.set('key4', 'value4');
      
      assert.equal(smallCache.has('key1'), true);
      assert.equal(smallCache.has('key2'), false);
      assert.equal(smallCache.has('key3'), true);
      assert.equal(smallCache.has('key4'), true);
      
      smallCache.cleanup();
    });
  });

  describe('TTL功能', () => {
    it('应该在TTL过期后移除项', async () => {
      const shortTtlCache = new ParseCache(100, 50); // 50ms TTL
      
      shortTtlCache.set('key1', 'value1');
      assert.equal(shortTtlCache.has('key1'), true);
      
      // 等待TTL过期
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 访问过期项应该返回null并清理
      const result = shortTtlCache.get('key1');
      assert.equal(result, null);
      
      shortTtlCache.cleanup();
    });

    it('应该正确统计过期项', async () => {
      const shortTtlCache = new ParseCache(100, 50);
      
      shortTtlCache.set('key1', 'value1');
      shortTtlCache.set('key2', 'value2');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 触发过期检查
      shortTtlCache.get('key1');
      shortTtlCache.get('key2');
      
      const stats = shortTtlCache.getStats();
      assert.ok(stats.expired >= 2);
      
      shortTtlCache.cleanup();
    });
  });

  describe('内存监控', () => {
    it('应该有内存监控配置', () => {
      assert.isNumber(cache.memoryThreshold);
      assert.isNumber(cache.memoryCheckInterval);
      assert.ok(cache.memoryThreshold > 0);
      assert.ok(cache.memoryCheckInterval > 0);
    });

    it('应该能执行强制清理', () => {
      // 添加一些数据
      for (let i = 0; i < 50; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      const sizeBefore = cache.size();
      assert.ok(sizeBefore > 0);
      
      cache.forceCleanup();
      
      const sizeAfter = cache.size();
      assert.ok(sizeAfter < sizeBefore);
    });

    it('应该能检查内存使用情况', () => {
      // 这个方法应该不抛出错误
      assert.doesNotThrow(() => {
        cache.checkMemoryUsage();
      });
    });
  });

  describe('键生成', () => {
    it('应该为短字符串直接返回', () => {
      const shortInput = 'short';
      const key = cache.generateCacheKey(shortInput);
      assert.equal(key, shortInput);
    });

    it('应该为长字符串生成哈希', () => {
      const longInput = 'a'.repeat(200);
      const key = cache.generateCacheKey(longInput);
      
      assert.isString(key);
      assert.ok(key.length < longInput.length);
      assert.notEqual(key, longInput);
    });

    it('应该为相同输入生成相同键', () => {
      const input = 'test input for key generation';
      const key1 = cache.generateCacheKey(input);
      const key2 = cache.generateCacheKey(input);
      
      assert.equal(key1, key2);
    });

    it('应该为不同输入生成不同键', () => {
      const input1 = 'test input 1';
      const input2 = 'test input 2';
      const key1 = cache.generateCacheKey(input1);
      const key2 = cache.generateCacheKey(input2);
      
      assert.notEqual(key1, key2);
    });
  });

  describe('统计信息', () => {
    it('应该正确统计命中和未命中', () => {
      cache.set('key1', 'value1');
      
      // 命中
      cache.get('key1');
      cache.get('key1');
      
      // 未命中
      cache.get('key2');
      cache.get('key3');
      
      const stats = cache.getStats();
      assert.equal(stats.hits, 2);
      assert.equal(stats.misses, 2);
    });

    it('应该统计键生成次数', () => {
      const input1 = 'test input 1';
      const input2 = 'test input 2';
      
      cache.generateCacheKey(input1);
      cache.generateCacheKey(input2);
      
      const stats = cache.getStats();
      assert.ok(stats.keyGenerations >= 2);
    });

    it('应该能重置统计信息', () => {
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('key2'); // miss
      
      let stats = cache.getStats();
      assert.ok(stats.hits > 0 || stats.misses > 0);
      
      cache.resetStats();
      stats = cache.getStats();
      
      assert.equal(stats.hits, 0);
      assert.equal(stats.misses, 0);
      assert.equal(stats.evictions, 0);
      assert.equal(stats.expired, 0);
    });
  });

  describe('性能测试', () => {
    it('应该能处理大量数据', () => {
      const largeCache = new ParseCache(1000, 60000);
      const startTime = performance.now();
      
      // 添加大量数据
      for (let i = 0; i < 500; i++) {
        largeCache.set(`key${i}`, { data: `value${i}`, index: i });
      }
      
      // 随机访问
      for (let i = 0; i < 200; i++) {
        const randomKey = `key${Math.floor(Math.random() * 500)}`;
        largeCache.get(randomKey);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`    处理500个缓存项耗时: ${Math.round(duration)}ms`);
      
      // 性能要求：应该在合理时间内完成
      assert.ok(duration < 100, `缓存操作耗时过长: ${duration}ms`);
      
      largeCache.cleanup();
    });

    it('应该有合理的内存使用', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const largeCache = new ParseCache(2000, 60000);
      
      // 添加大量数据
      for (let i = 0; i < 1000; i++) {
        largeCache.set(`key${i}`, {
          data: 'x'.repeat(100), // 每个值约100字节
          index: i,
          timestamp: Date.now()
        });
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      console.log(`    缓存内存增长: ${Math.round(memoryIncrease / 1024)}KB`);
      
      // 内存增长应该在合理范围内
      assert.ok(memoryIncrease < 10 * 1024 * 1024, 
        `缓存内存使用过多: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
      
      largeCache.cleanup();
    });
  });

  describe('边界条件', () => {
    it('应该处理空键', () => {
      assert.throws(() => {
        cache.set('', 'value');
      });
    });

    it('应该处理null/undefined值', () => {
      cache.set('key1', null);
      cache.set('key2', undefined);
      
      assert.equal(cache.get('key1'), null);
      assert.equal(cache.get('key2'), undefined);
    });

    it('应该处理复杂对象', () => {
      const complexValue = {
        array: [1, 2, 3],
        nested: { a: 1, b: 2 },
        func: () => 'test',
        date: new Date()
      };
      
      cache.set('complex', complexValue);
      const retrieved = cache.get('complex');
      
      assert.deepEqual(retrieved.array, complexValue.array);
      assert.deepEqual(retrieved.nested, complexValue.nested);
    });
  });
});
