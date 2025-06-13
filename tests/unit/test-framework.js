/**
 * 统一测试框架
 * 为项目提供完整的单元测试和集成测试支持
 */

import { strict as nodeAssert } from 'assert';
import { performance } from 'perf_hooks';

/**
 * 简单的测试框架实现
 */
export class TestFramework {
  constructor() {
    this.tests = [];
    this.suites = new Map();
    this.stats = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0
    };
  }

  /**
   * 创建测试套件
   * @param {string} name - 套件名称
   * @param {Function} fn - 套件函数
   */
  describe(name, fn) {
    const suite = {
      name,
      tests: [],
      beforeEach: null,
      afterEach: null,
      beforeAll: null,
      afterAll: null
    };
    
    this.suites.set(name, suite);
    
    // 设置当前套件上下文
    const originalSuite = this.currentSuite;
    this.currentSuite = suite;
    
    try {
      fn();
    } finally {
      this.currentSuite = originalSuite;
    }
  }

  /**
   * 定义测试用例
   * @param {string} name - 测试名称
   * @param {Function} fn - 测试函数
   */
  it(name, fn) {
    const test = {
      name,
      fn,
      suite: this.currentSuite?.name || 'default',
      skip: false,
      only: false
    };

    if (this.currentSuite) {
      this.currentSuite.tests.push(test);
    } else {
      this.tests.push(test);
    }
  }

  /**
   * 跳过测试
   * @param {string} name - 测试名称
   * @param {Function} fn - 测试函数
   */
  skip(name, fn) {
    this.it(name, fn);
    const lastTest = this.currentSuite ? 
      this.currentSuite.tests[this.currentSuite.tests.length - 1] :
      this.tests[this.tests.length - 1];
    lastTest.skip = true;
  }

  /**
   * 只运行指定测试
   * @param {string} name - 测试名称
   * @param {Function} fn - 测试函数
   */
  only(name, fn) {
    this.it(name, fn);
    const lastTest = this.currentSuite ? 
      this.currentSuite.tests[this.currentSuite.tests.length - 1] :
      this.tests[this.tests.length - 1];
    lastTest.only = true;
  }

  /**
   * 设置每个测试前的钩子
   * @param {Function} fn - 钩子函数
   */
  beforeEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeEach = fn;
    }
  }

  /**
   * 设置每个测试后的钩子
   * @param {Function} fn - 钩子函数
   */
  afterEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterEach = fn;
    }
  }

  /**
   * 运行所有测试
   */
  async run() {
    console.log('🧪 开始运行测试...\n');
    const startTime = performance.now();

    // 运行套件测试
    for (const [suiteName, suite] of this.suites) {
      await this.runSuite(suite);
    }

    // 运行独立测试
    if (this.tests.length > 0) {
      await this.runTests(this.tests, 'Independent Tests');
    }

    const endTime = performance.now();
    this.stats.duration = endTime - startTime;

    this.printSummary();
  }

  /**
   * 运行测试套件
   * @param {Object} suite - 测试套件
   */
  async runSuite(suite) {
    console.log(`📦 ${suite.name}`);
    
    if (suite.beforeAll) {
      try {
        await suite.beforeAll();
      } catch (error) {
        console.log(`  ❌ beforeAll failed: ${error.message}`);
        return;
      }
    }

    await this.runTests(suite.tests, suite.name, suite);

    if (suite.afterAll) {
      try {
        await suite.afterAll();
      } catch (error) {
        console.log(`  ⚠️ afterAll failed: ${error.message}`);
      }
    }

    console.log('');
  }

  /**
   * 运行测试列表
   * @param {Array} tests - 测试列表
   * @param {string} suiteName - 套件名称
   * @param {Object} suite - 套件对象
   */
  async runTests(tests, suiteName, suite = null) {
    // 检查是否有only测试
    const onlyTests = tests.filter(test => test.only);
    const testsToRun = onlyTests.length > 0 ? onlyTests : tests;

    for (const test of testsToRun) {
      this.stats.total++;

      if (test.skip) {
        console.log(`  ⏭️ ${test.name} (skipped)`);
        this.stats.skipped++;
        continue;
      }

      try {
        // 运行beforeEach
        if (suite?.beforeEach) {
          await suite.beforeEach();
        }

        // 运行测试
        const testStart = performance.now();
        await test.fn();
        const testEnd = performance.now();
        const duration = Math.round(testEnd - testStart);

        console.log(`  ✅ ${test.name} (${duration}ms)`);
        this.stats.passed++;

        // 运行afterEach
        if (suite?.afterEach) {
          await suite.afterEach();
        }

      } catch (error) {
        console.log(`  ❌ ${test.name}`);
        console.log(`     ${error.message}`);
        this.stats.failed++;
      }
    }
  }

  /**
   * 打印测试总结
   */
  printSummary() {
    console.log('📊 测试总结:');
    console.log(`  总计: ${this.stats.total}`);
    console.log(`  通过: ${this.stats.passed} ✅`);
    console.log(`  失败: ${this.stats.failed} ❌`);
    console.log(`  跳过: ${this.stats.skipped} ⏭️`);
    console.log(`  耗时: ${Math.round(this.stats.duration)}ms`);
    
    const successRate = this.stats.total > 0 ? 
      Math.round((this.stats.passed / this.stats.total) * 100) : 0;
    console.log(`  成功率: ${successRate}%`);

    if (this.stats.failed > 0) {
      console.log('\n❌ 测试失败！');
      process.exit(1);
    } else {
      console.log('\n✅ 所有测试通过！');
    }
  }
}

/**
 * 断言工具
 */
export class TestAssert {
  static equal(actual, expected, message) {
    nodeAssert.strictEqual(actual, expected, message);
  }

  static notEqual(actual, expected, message) {
    nodeAssert.notStrictEqual(actual, expected, message);
  }

  static deepEqual(actual, expected, message) {
    nodeAssert.deepStrictEqual(actual, expected, message);
  }

  static ok(value, message) {
    nodeAssert.ok(value, message);
  }

  static throws(fn, expected, message) {
    nodeAssert.throws(fn, expected, message);
  }

  static async rejects(promise, expected, message) {
    await nodeAssert.rejects(promise, expected, message);
  }

  static isArray(value, message) {
    nodeAssert.ok(Array.isArray(value), message || 'Expected value to be an array');
  }

  static isObject(value, message) {
    nodeAssert.ok(typeof value === 'object' && value !== null,
      message || 'Expected value to be an object');
  }

  static isString(value, message) {
    nodeAssert.ok(typeof value === 'string',
      message || 'Expected value to be a string');
  }

  static isNumber(value, message) {
    nodeAssert.ok(typeof value === 'number',
      message || 'Expected value to be a number');
  }

  static isFunction(value, message) {
    nodeAssert.ok(typeof value === 'function',
      message || 'Expected value to be a function');
  }

  static hasProperty(obj, prop, message) {
    nodeAssert.ok(obj.hasOwnProperty(prop),
      message || `Expected object to have property '${prop}'`);
  }

  static lengthOf(array, length, message) {
    nodeAssert.strictEqual(array.length, length,
      message || `Expected array length to be ${length}`);
  }

  static includes(array, item, message) {
    nodeAssert.ok(array.includes(item),
      message || `Expected array to include ${item}`);
  }

  static isTrue(value, message) {
    nodeAssert.strictEqual(value, true, message || 'Expected value to be true');
  }

  static isFalse(value, message) {
    nodeAssert.strictEqual(value, false, message || 'Expected value to be false');
  }

  static include(string, substring, message) {
    nodeAssert.ok(string.includes(substring),
      message || `Expected string to include '${substring}'`);
  }
}

// 创建全局测试实例
export const testFramework = new TestFramework();

// 导出便捷方法
export const { describe, it, skip, only, beforeEach, afterEach } = testFramework;
export const assert = TestAssert;
