/**
 * 自动化测试套件
 * 提供全面的自动化测试功能
 */

import { EventEmitter } from 'events';
import { globalCodeQualityAnalyzer } from '../utils/code-quality-analyzer.js';
import { globalAdvancedMonitor } from '../utils/advanced-monitor.js';
import { runSecurityTests } from '../../安全修复验证测试.js';
import { runPhase2Tests } from '../../第二阶段修复测试.js';

/**
 * 测试类型枚举
 */
export const TestType = {
  UNIT: 'unit',
  INTEGRATION: 'integration',
  SECURITY: 'security',
  PERFORMANCE: 'performance',
  QUALITY: 'quality',
  REGRESSION: 'regression'
};

/**
 * 测试状态枚举
 */
export const TestStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  ERROR: 'error'
};

/**
 * 自动化测试套件类
 */
export class AutomatedTestSuite extends EventEmitter {
  constructor() {
    super();
    this.tests = new Map();
    this.testResults = new Map();
    this.isRunning = false;
    this.currentTest = null;
    this.startTime = null;
    this.endTime = null;
    this.config = {
      timeout: 30000,           // 30秒超时
      retryCount: 2,            // 重试次数
      parallel: false,          // 是否并行执行
      stopOnFailure: false,     // 失败时是否停止
      generateReport: true,     // 是否生成报告
      verbose: true             // 详细输出
    };
  }

  /**
   * 注册测试用例
   * @param {string} name - 测试名称
   * @param {string} type - 测试类型
   * @param {Function} testFn - 测试函数
   * @param {Object} options - 测试选项
   */
  registerTest(name, type, testFn, options = {}) {
    const test = {
      name,
      type,
      testFn,
      options: { ...this.config, ...options },
      status: TestStatus.PENDING,
      result: null,
      error: null,
      duration: 0,
      retryCount: 0
    };

    this.tests.set(name, test);
    console.log(`📝 注册测试: ${name} (${type})`);
  }

  /**
   * 运行所有测试
   * @param {Object} options - 运行选项
   * @returns {Object} 测试结果
   */
  async runAllTests(options = {}) {
    if (this.isRunning) {
      throw new Error('测试套件正在运行中');
    }

    this.isRunning = true;
    this.startTime = Date.now();
    
    const runConfig = { ...this.config, ...options };
    
    console.log('🧪 开始运行自动化测试套件...\n');
    
    try {
      const results = await this.executeTests(runConfig);
      this.endTime = Date.now();
      
      if (runConfig.generateReport) {
        const report = this.generateTestReport(results);
        console.log('\n📊 测试报告:\n', report);
      }
      
      return results;
      
    } catch (error) {
      console.error('❌ 测试套件运行失败:', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.currentTest = null;
    }
  }

  /**
   * 运行指定类型的测试
   * @param {string} type - 测试类型
   * @param {Object} options - 运行选项
   * @returns {Object} 测试结果
   */
  async runTestsByType(type, options = {}) {
    const testsToRun = Array.from(this.tests.values()).filter(test => test.type === type);
    
    if (testsToRun.length === 0) {
      console.log(`⚠️ 没有找到类型为 ${type} 的测试`);
      return { passed: 0, failed: 0, total: 0 };
    }
    
    console.log(`🧪 运行 ${type} 类型测试 (${testsToRun.length} 个)...\n`);
    
    return await this.executeSpecificTests(testsToRun, options);
  }

  /**
   * 执行测试
   * @param {Object} config - 运行配置
   * @returns {Object} 测试结果
   */
  async executeTests(config) {
    const tests = Array.from(this.tests.values());
    
    if (config.parallel) {
      return await this.executeTestsParallel(tests, config);
    } else {
      return await this.executeTestsSequential(tests, config);
    }
  }

  /**
   * 顺序执行测试
   * @param {Array} tests - 测试数组
   * @param {Object} config - 配置
   * @returns {Object} 测试结果
   */
  async executeTestsSequential(tests, config) {
    const results = {
      total: tests.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: 0,
      duration: 0,
      details: []
    };

    for (const test of tests) {
      if (config.stopOnFailure && results.failed > 0) {
        test.status = TestStatus.SKIPPED;
        results.skipped++;
        continue;
      }

      const result = await this.executeTest(test, config);
      results.details.push(result);
      
      switch (result.status) {
        case TestStatus.PASSED:
          results.passed++;
          break;
        case TestStatus.FAILED:
          results.failed++;
          break;
        case TestStatus.SKIPPED:
          results.skipped++;
          break;
        case TestStatus.ERROR:
          results.errors++;
          break;
      }
      
      results.duration += result.duration;
    }

    return results;
  }

  /**
   * 并行执行测试
   * @param {Array} tests - 测试数组
   * @param {Object} config - 配置
   * @returns {Object} 测试结果
   */
  async executeTestsParallel(tests, config) {
    const startTime = Date.now();
    
    const promises = tests.map(test => this.executeTest(test, config));
    const results = await Promise.allSettled(promises);
    
    const summary = {
      total: tests.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: 0,
      duration: Date.now() - startTime,
      details: []
    };

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const testResult = result.value;
        summary.details.push(testResult);
        
        switch (testResult.status) {
          case TestStatus.PASSED:
            summary.passed++;
            break;
          case TestStatus.FAILED:
            summary.failed++;
            break;
          case TestStatus.SKIPPED:
            summary.skipped++;
            break;
          case TestStatus.ERROR:
            summary.errors++;
            break;
        }
      } else {
        summary.errors++;
        summary.details.push({
          name: 'unknown',
          status: TestStatus.ERROR,
          error: result.reason,
          duration: 0
        });
      }
    }

    return summary;
  }

  /**
   * 执行单个测试
   * @param {Object} test - 测试对象
   * @param {Object} config - 配置
   * @returns {Object} 测试结果
   */
  async executeTest(test, config) {
    this.currentTest = test;
    test.status = TestStatus.RUNNING;
    
    const startTime = Date.now();
    
    if (config.verbose) {
      console.log(`🔄 运行测试: ${test.name}`);
    }
    
    try {
      // 设置超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('测试超时')), test.options.timeout);
      });
      
      // 执行测试
      const testPromise = test.testFn();
      
      const result = await Promise.race([testPromise, timeoutPromise]);
      
      test.status = TestStatus.PASSED;
      test.result = result;
      test.duration = Date.now() - startTime;
      
      if (config.verbose) {
        console.log(`  ✅ 通过 (${test.duration}ms)`);
      }
      
      this.emit('testPassed', test);
      
    } catch (error) {
      test.duration = Date.now() - startTime;
      test.error = error;
      
      // 重试逻辑
      if (test.retryCount < test.options.retryCount) {
        test.retryCount++;
        if (config.verbose) {
          console.log(`  🔄 重试 ${test.retryCount}/${test.options.retryCount}: ${test.name}`);
        }
        return await this.executeTest(test, config);
      }
      
      test.status = TestStatus.FAILED;
      
      if (config.verbose) {
        console.log(`  ❌ 失败 (${test.duration}ms): ${error.message}`);
      }
      
      this.emit('testFailed', test);
    }
    
    this.testResults.set(test.name, test);
    
    return {
      name: test.name,
      type: test.type,
      status: test.status,
      duration: test.duration,
      error: test.error?.message,
      result: test.result
    };
  }

  /**
   * 执行指定测试
   * @param {Array} tests - 测试数组
   * @param {Object} options - 选项
   * @returns {Object} 测试结果
   */
  async executeSpecificTests(tests, options) {
    const config = { ...this.config, ...options };
    return await this.executeTestsSequential(tests, config);
  }

  /**
   * 生成测试报告
   * @param {Object} results - 测试结果
   * @returns {string} 测试报告
   */
  generateTestReport(results) {
    const duration = this.endTime - this.startTime;
    const successRate = results.total > 0 ? (results.passed / results.total * 100).toFixed(2) : 0;
    
    let report = `\n${'='.repeat(60)}\n`;
    report += `                    测试报告\n`;
    report += `${'='.repeat(60)}\n`;
    report += `执行时间: ${new Date(this.startTime).toLocaleString()}\n`;
    report += `总耗时: ${duration}ms (${(duration / 1000).toFixed(2)}s)\n`;
    report += `成功率: ${successRate}%\n\n`;
    
    report += `📊 测试统计:\n`;
    report += `  总计: ${results.total}\n`;
    report += `  ✅ 通过: ${results.passed}\n`;
    report += `  ❌ 失败: ${results.failed}\n`;
    report += `  ⏭️ 跳过: ${results.skipped}\n`;
    report += `  💥 错误: ${results.errors}\n\n`;
    
    // 按类型分组统计
    const byType = {};
    for (const detail of results.details) {
      if (!byType[detail.type]) {
        byType[detail.type] = { total: 0, passed: 0, failed: 0 };
      }
      byType[detail.type].total++;
      if (detail.status === TestStatus.PASSED) {
        byType[detail.type].passed++;
      } else if (detail.status === TestStatus.FAILED) {
        byType[detail.type].failed++;
      }
    }
    
    report += `📋 按类型统计:\n`;
    for (const [type, stats] of Object.entries(byType)) {
      const typeSuccessRate = stats.total > 0 ? (stats.passed / stats.total * 100).toFixed(1) : 0;
      report += `  ${type}: ${stats.passed}/${stats.total} (${typeSuccessRate}%)\n`;
    }
    
    // 失败的测试详情
    const failedTests = results.details.filter(d => d.status === TestStatus.FAILED);
    if (failedTests.length > 0) {
      report += `\n❌ 失败的测试:\n`;
      for (const test of failedTests) {
        report += `  - ${test.name}: ${test.error}\n`;
      }
    }
    
    report += `\n${'='.repeat(60)}\n`;
    
    return report;
  }

  /**
   * 初始化内置测试
   */
  initializeBuiltinTests() {
    // 安全测试
    this.registerTest('安全修复验证', TestType.SECURITY, async () => {
      const result = await runSecurityTests();
      if (result.passed !== result.total) {
        throw new Error(`安全测试失败: ${result.passed}/${result.total}`);
      }
      return result;
    });

    // 第二阶段测试
    this.registerTest('第二阶段修复验证', TestType.REGRESSION, async () => {
      const result = await runPhase2Tests();
      if (result.passed !== result.total) {
        throw new Error(`第二阶段测试失败: ${result.passed}/${result.total}`);
      }
      return result;
    });

    // 代码质量测试
    this.registerTest('代码质量分析', TestType.QUALITY, async () => {
      const analysis = await globalCodeQualityAnalyzer.analyzeProject('./src');
      if (analysis.summary.averageScore < 70) {
        throw new Error(`代码质量分数过低: ${analysis.summary.averageScore}`);
      }
      return analysis.summary;
    });

    // 性能监控测试
    this.registerTest('性能监控系统', TestType.PERFORMANCE, async () => {
      globalAdvancedMonitor.start({ 
        metricsInterval: 1000,
        healthCheckInterval: 2000 
      });
      
      // 等待几秒收集数据
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const metrics = globalAdvancedMonitor.getAllMetrics();
      globalAdvancedMonitor.stop();
      
      if (!metrics.performance || !metrics.health) {
        throw new Error('监控系统未能收集到完整数据');
      }
      
      return metrics;
    });

    console.log('✅ 内置测试已初始化');
  }

  /**
   * 获取测试统计
   * @returns {Object} 测试统计
   */
  getTestStats() {
    const stats = {
      total: this.tests.size,
      byType: {},
      byStatus: {},
      lastRun: this.endTime ? new Date(this.endTime).toISOString() : null
    };

    for (const test of this.tests.values()) {
      // 按类型统计
      stats.byType[test.type] = (stats.byType[test.type] || 0) + 1;
      
      // 按状态统计
      stats.byStatus[test.status] = (stats.byStatus[test.status] || 0) + 1;
    }

    return stats;
  }

  /**
   * 清理测试结果
   */
  clearResults() {
    this.testResults.clear();
    for (const test of this.tests.values()) {
      test.status = TestStatus.PENDING;
      test.result = null;
      test.error = null;
      test.duration = 0;
      test.retryCount = 0;
    }
    console.log('🧹 测试结果已清理');
  }
}

// 创建全局测试套件实例
export const globalTestSuite = new AutomatedTestSuite();

// 初始化内置测试
globalTestSuite.initializeBuiltinTests();

export default globalTestSuite;
