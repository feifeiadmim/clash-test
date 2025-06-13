/**
 * 优化验证脚本
 * 验证优化后的性能改进和功能完整性
 */

import { ProxyConverter } from '../src/index.js';
import { globalConfigManager } from '../src/config/config-manager.js';
import { globalPerformanceConfig } from '../src/config/performance-config.js';
import { globalLogger } from '../src/utils/smart-logger.js';
import { globalAdaptiveCache } from '../src/utils/adaptive-cache.js';
import fs from 'fs';
import path from 'path';

/**
 * 优化验证器
 */
class OptimizationValidator {
  constructor() {
    this.results = {
      performance: {},
      memory: {},
      cache: {},
      concurrency: {},
      logging: {},
      overall: {}
    };
  }

  /**
   * 运行完整验证
   */
  async runValidation() {
    console.log('🚀 开始优化验证...\n');

    try {
      // 1. 配置验证
      await this.validateConfiguration();
      
      // 2. 性能验证
      await this.validatePerformance();
      
      // 3. 内存管理验证
      await this.validateMemoryManagement();
      
      // 4. 缓存优化验证
      await this.validateCacheOptimization();
      
      // 5. 并发处理验证
      await this.validateConcurrencyOptimization();
      
      // 6. 日志系统验证
      await this.validateLoggingOptimization();
      
      // 7. 生成验证报告
      this.generateValidationReport();
      
    } catch (error) {
      console.error('❌ 验证过程中出错:', error);
      throw error;
    }
  }

  /**
   * 配置验证
   */
  async validateConfiguration() {
    console.log('📋 1. 配置管理验证');
    
    const startTime = Date.now();
    
    // 测试配置获取
    const config = globalConfigManager.getCurrentConfig();
    console.log(`  ✅ 配置获取: ${Date.now() - startTime}ms`);
    
    // 测试配置验证
    const validationTests = [
      { path: 'performance.maxConcurrency', value: 16, expected: true },
      { path: 'performance.maxConcurrency', value: 100, expected: false },
      { path: 'cache.maxSize', value: 2000, expected: true },
      { path: 'logging.level', value: 'info', expected: true },
      { path: 'logging.level', value: 'invalid', expected: false }
    ];
    
    let validationPassed = 0;
    for (const test of validationTests) {
      try {
        globalConfigManager.set(test.path, test.value, true);
        if (test.expected) validationPassed++;
      } catch (error) {
        if (!test.expected) validationPassed++;
      }
    }
    
    console.log(`  ✅ 配置验证: ${validationPassed}/${validationTests.length} 通过`);
    
    this.results.overall.configValidation = validationPassed / validationTests.length;
  }

  /**
   * 性能验证
   */
  async validatePerformance() {
    console.log('\n🚀 2. 性能优化验证');
    
    const converter = new ProxyConverter();
    
    // 生成测试数据
    const testData = this.generateTestNodes(10000);
    
    // 测试批处理性能
    const batchStart = Date.now();
    const batchResult = await converter.deduplicate(testData);
    const batchTime = Date.now() - batchStart;
    
    console.log(`  ✅ 批处理性能: ${batchTime}ms (${testData.length} -> ${batchResult.length} 节点)`);
    
    // 测试内存使用
    const memoryBefore = process.memoryUsage().heapUsed;
    await converter.parse(this.generateLargeTestContent());
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryIncrease = memoryAfter - memoryBefore;
    
    console.log(`  ✅ 内存使用: +${Math.round(memoryIncrease / 1024 / 1024)}MB`);
    
    this.results.performance = {
      batchProcessingTime: batchTime,
      memoryIncrease: memoryIncrease,
      throughput: testData.length / (batchTime / 1000), // 节点/秒
      efficiency: batchResult.length / testData.length
    };
  }

  /**
   * 内存管理验证
   */
  async validateMemoryManagement() {
    console.log('\n🧠 3. 内存管理验证');
    
    const initialMemory = process.memoryUsage().heapUsed;
    
    // 测试大量数据处理
    const largeDataSets = [];
    for (let i = 0; i < 5; i++) {
      largeDataSets.push(this.generateTestNodes(5000));
    }
    
    const converter = new ProxyConverter();
    for (const dataSet of largeDataSets) {
      await converter.deduplicate(dataSet);
    }
    
    // 强制垃圾回收（如果可用）
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = finalMemory - initialMemory;
    
    console.log(`  ✅ 内存增长: ${Math.round(memoryGrowth / 1024 / 1024)}MB`);
    console.log(`  ✅ 内存效率: ${memoryGrowth < 100 * 1024 * 1024 ? '良好' : '需要优化'}`);
    
    this.results.memory = {
      initialMemory,
      finalMemory,
      memoryGrowth,
      efficiency: memoryGrowth < 100 * 1024 * 1024 ? 'good' : 'poor'
    };
  }

  /**
   * 缓存优化验证
   */
  async validateCacheOptimization() {
    console.log('\n💾 4. 缓存优化验证');
    
    // 测试缓存性能
    const testKey = 'test_key';
    const testValue = { data: 'test_data', timestamp: Date.now() };
    
    // 设置缓存
    const setStart = Date.now();
    globalAdaptiveCache.set(testKey, testValue);
    const setTime = Date.now() - setStart;
    
    // 获取缓存
    const getStart = Date.now();
    const cachedValue = globalAdaptiveCache.get(testKey);
    const getTime = Date.now() - getStart;
    
    // 测试缓存命中
    const hitTest = JSON.stringify(cachedValue) === JSON.stringify(testValue);
    
    console.log(`  ✅ 缓存设置: ${setTime}ms`);
    console.log(`  ✅ 缓存获取: ${getTime}ms`);
    console.log(`  ✅ 缓存命中: ${hitTest ? '成功' : '失败'}`);
    
    // 获取缓存统计
    const cacheStats = globalAdaptiveCache.getStats();
    console.log(`  ✅ 缓存统计: 命中率 ${(cacheStats.hitRate * 100).toFixed(1)}%`);
    
    this.results.cache = {
      setTime,
      getTime,
      hitTest,
      stats: cacheStats
    };
  }

  /**
   * 并发处理验证
   */
  async validateConcurrencyOptimization() {
    console.log('\n⚡ 5. 并发处理验证');
    
    const converter = new ProxyConverter();
    const concurrencyLevels = [1, 4, 8, 16];
    const testData = this.generateTestNodes(1000);
    
    for (const concurrency of concurrencyLevels) {
      const start = Date.now();
      
      // 模拟并发处理
      const promises = [];
      const chunkSize = Math.ceil(testData.length / concurrency);
      
      for (let i = 0; i < concurrency; i++) {
        const chunk = testData.slice(i * chunkSize, (i + 1) * chunkSize);
        if (chunk.length > 0) {
          promises.push(converter.deduplicate(chunk));
        }
      }
      
      await Promise.all(promises);
      const time = Date.now() - start;
      
      console.log(`  ✅ 并发度 ${concurrency}: ${time}ms`);
    }
  }

  /**
   * 日志系统验证
   */
  async validateLoggingOptimization() {
    console.log('\n📝 6. 日志系统验证');
    
    const logStart = Date.now();
    
    // 测试不同级别的日志
    globalLogger.debug('Debug message test');
    globalLogger.info('Info message test');
    globalLogger.warn('Warning message test');
    globalLogger.error('Error message test');
    
    const logTime = Date.now() - logStart;
    
    // 测试频率限制
    const rateLimitStart = Date.now();
    for (let i = 0; i < 100; i++) {
      globalLogger.info('Rate limit test', {}, { rateKey: 'test_rate', rateLimit: 10 });
    }
    const rateLimitTime = Date.now() - rateLimitStart;
    
    console.log(`  ✅ 日志性能: ${logTime}ms`);
    console.log(`  ✅ 频率限制: ${rateLimitTime}ms (100条消息)`);
    
    const logStats = globalLogger.getStats();
    console.log(`  ✅ 日志统计: 总计 ${logStats.totalLogs} 条`);
    
    this.results.logging = {
      logTime,
      rateLimitTime,
      stats: logStats
    };
  }

  /**
   * 生成测试节点
   */
  generateTestNodes(count) {
    const nodes = [];
    const types = ['vmess', 'vless', 'trojan', 'ss'];
    
    for (let i = 0; i < count; i++) {
      nodes.push({
        name: `Test Node ${i}`,
        server: `server${i % 100}.example.com`,
        port: 443 + (i % 1000),
        type: types[i % types.length],
        uuid: `uuid-${i}`,
        password: `password-${i}`
      });
    }
    
    return nodes;
  }

  /**
   * 生成大型测试内容
   */
  generateLargeTestContent() {
    const lines = [];
    for (let i = 0; i < 1000; i++) {
      lines.push(`vmess://eyJ2IjoiMiIsInBzIjoidGVzdC0ke2l9IiwiYWRkIjoic2VydmVyJHtpfS5leGFtcGxlLmNvbSIsInBvcnQiOiI0NDMiLCJpZCI6InV1aWQtJHtpfSIsImFpZCI6IjAiLCJzY3kiOiJhdXRvIiwibmV0IjoidGNwIiwidHlwZSI6Im5vbmUiLCJob3N0IjoiIiwicGF0aCI6IiIsInRscyI6IiIsInNuaSI6IiJ9`);
    }
    return lines.join('\n');
  }

  /**
   * 生成验证报告
   */
  generateValidationReport() {
    console.log('\n📊 优化验证报告');
    console.log('='.repeat(50));
    
    // 性能评分
    const performanceScore = this.calculatePerformanceScore();
    const memoryScore = this.calculateMemoryScore();
    const cacheScore = this.calculateCacheScore();
    const overallScore = (performanceScore + memoryScore + cacheScore) / 3;
    
    console.log(`🎯 总体评分: ${overallScore.toFixed(1)}/100`);
    console.log(`🚀 性能评分: ${performanceScore.toFixed(1)}/100`);
    console.log(`🧠 内存评分: ${memoryScore.toFixed(1)}/100`);
    console.log(`💾 缓存评分: ${cacheScore.toFixed(1)}/100`);
    
    // 详细结果
    console.log('\n📈 详细结果:');
    console.log(`  吞吐量: ${Math.round(this.results.performance.throughput)} 节点/秒`);
    console.log(`  内存效率: ${this.results.memory.efficiency}`);
    console.log(`  缓存命中率: ${(this.results.cache.stats.hitRate * 100).toFixed(1)}%`);
    
    // 优化建议
    this.generateOptimizationRecommendations(overallScore);
    
    // 保存报告
    this.saveReport({
      timestamp: new Date().toISOString(),
      scores: { overall: overallScore, performance: performanceScore, memory: memoryScore, cache: cacheScore },
      results: this.results
    });
  }

  /**
   * 计算性能评分
   */
  calculatePerformanceScore() {
    const { throughput, batchProcessingTime } = this.results.performance;
    
    let score = 0;
    
    // 吞吐量评分 (0-40分)
    if (throughput > 1000) score += 40;
    else if (throughput > 500) score += 30;
    else if (throughput > 100) score += 20;
    else score += 10;
    
    // 处理时间评分 (0-30分)
    if (batchProcessingTime < 1000) score += 30;
    else if (batchProcessingTime < 3000) score += 20;
    else if (batchProcessingTime < 5000) score += 10;
    
    // 配置验证评分 (0-30分)
    score += this.results.overall.configValidation * 30;
    
    return Math.min(100, score);
  }

  /**
   * 计算内存评分
   */
  calculateMemoryScore() {
    const { memoryGrowth, efficiency } = this.results.memory;
    const growthMB = memoryGrowth / 1024 / 1024;
    
    let score = 0;
    
    if (efficiency === 'good') score += 50;
    else score += 20;
    
    if (growthMB < 50) score += 50;
    else if (growthMB < 100) score += 30;
    else if (growthMB < 200) score += 10;
    
    return Math.min(100, score);
  }

  /**
   * 计算缓存评分
   */
  calculateCacheScore() {
    const { hitTest, stats } = this.results.cache;
    
    let score = 0;
    
    if (hitTest) score += 30;
    
    if (stats.hitRate > 0.8) score += 40;
    else if (stats.hitRate > 0.6) score += 30;
    else if (stats.hitRate > 0.4) score += 20;
    else score += 10;
    
    if (stats.efficiency === 'excellent') score += 30;
    else if (stats.efficiency === 'good') score += 20;
    else score += 10;
    
    return Math.min(100, score);
  }

  /**
   * 生成优化建议
   */
  generateOptimizationRecommendations(overallScore) {
    console.log('\n💡 优化建议:');
    
    if (overallScore >= 90) {
      console.log('  🏆 优化效果卓越！系统性能已达到最佳状态。');
    } else if (overallScore >= 80) {
      console.log('  🥇 优化效果优秀！可以考虑进一步微调。');
    } else if (overallScore >= 70) {
      console.log('  🥈 优化效果良好，但仍有改进空间。');
    } else {
      console.log('  🥉 优化效果一般，建议进一步优化。');
    }
    
    // 具体建议
    if (this.results.performance.throughput < 500) {
      console.log('  - 考虑增加并发处理能力');
    }
    
    if (this.results.memory.efficiency === 'poor') {
      console.log('  - 优化内存管理策略');
    }
    
    if (this.results.cache.stats.hitRate < 0.6) {
      console.log('  - 调整缓存策略以提高命中率');
    }
  }

  /**
   * 保存报告
   */
  saveReport(report) {
    const reportPath = 'tests/optimization-validation-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 验证报告已保存: ${reportPath}`);
  }
}

// 运行验证
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new OptimizationValidator();
  validator.runValidation().catch(console.error);
}

export default OptimizationValidator;
