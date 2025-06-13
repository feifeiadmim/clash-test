#!/usr/bin/env node

/**
 * 性能基准测试套件
 * 使用benchmark.js库进行精确的性能测试
 */

import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 导入测试模块
import { globalParserRegistry } from '../src/core/parser-registry.js';
import { ProxyConverter } from '../src/index.js';
import { generateFullNodeKey } from '../src/utils/deduplication.js';

console.log('🚀 性能基准测试套件启动...\n');

/**
 * 生成测试数据
 */
function generateTestData(count, type = 'mixed') {
  const protocols = ['vmess', 'trojan', 'ss', 'vless', 'hysteria2'];
  const servers = ['1.1.1.1', '8.8.8.8', '9.9.9.9', '1.0.0.1'];
  const methods = ['aes-256-gcm', 'chacha20-poly1305', 'aes-128-gcm'];
  
  const nodes = [];
  
  for (let i = 0; i < count; i++) {
    const protocol = type === 'mixed' ? protocols[i % protocols.length] : type;
    const server = servers[i % servers.length];
    const port = 443 + (i % 1000);
    
    const baseNode = {
      name: `测试节点${i}`,
      server: `${server}`,
      port: port,
      type: protocol
    };
    
    // 根据协议类型添加特定字段
    switch (protocol) {
      case 'vmess':
        Object.assign(baseNode, {
          uuid: `${i.toString().padStart(8, '0')}-1234-5678-9abc-def012345678`,
          alterId: 0,
          cipher: 'auto',
          network: ['tcp', 'ws', 'h2'][i % 3],
          tls: { enabled: i % 2 === 0, serverName: `node${i}.example.com` }
        });
        break;
      case 'trojan':
        Object.assign(baseNode, {
          password: `password_${i}_${Math.random().toString(36).substring(2)}`,
          sni: `trojan${i}.example.com`,
          network: 'tcp'
        });
        break;
      case 'ss':
        Object.assign(baseNode, {
          method: methods[i % methods.length],
          password: `ss_password_${i}`,
          plugin: i % 3 === 0 ? 'obfs-local' : null
        });
        break;
      case 'vless':
        Object.assign(baseNode, {
          uuid: `${i.toString().padStart(8, '0')}-5678-9abc-def0-123456789012`,
          flow: i % 2 === 0 ? 'xtls-rprx-direct' : 'none',
          encryption: 'none',
          network: ['tcp', 'ws', 'grpc'][i % 3]
        });
        break;
      case 'hysteria2':
        Object.assign(baseNode, {
          password: `hy2_password_${i}`,
          obfs: { type: 'salamander', password: `obfs_${i}` },
          sni: `hy2-${i}.example.com`
        });
        break;
    }
    
    nodes.push(baseNode);
  }
  
  return nodes;
}

/**
 * 基准测试1：解析吞吐量测试
 */
async function benchmarkParsingThroughput() {
  console.log('📊 基准测试1：解析吞吐量测试');
  
  const testSizes = [100, 500, 1000, 2000];
  const results = [];
  
  for (const size of testSizes) {
    console.log(`  测试 ${size} 个节点...`);
    
    const testNodes = generateTestData(size);
    const converter = new ProxyConverter();
    
    // 预热
    converter.process(testNodes.slice(0, 10), 'json');
    
    // 正式测试
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    const result = converter.process(testNodes, 'json', {
      deduplicate: false,
      rename: false
    });
    
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    
    const duration = endTime - startTime;
    const throughput = size / (duration / 1000);
    const memoryUsed = (endMemory - startMemory) / 1024 / 1024;
    
    const testResult = {
      nodeCount: size,
      duration: Math.round(duration),
      throughput: Math.round(throughput),
      memoryUsed: Math.round(memoryUsed * 100) / 100,
      resultCount: result.length
    };
    
    results.push(testResult);
    
    console.log(`    耗时: ${testResult.duration}ms`);
    console.log(`    吞吐量: ${testResult.throughput} nodes/sec`);
    console.log(`    内存使用: ${testResult.memoryUsed}MB`);
    console.log(`    结果数量: ${testResult.resultCount}`);
  }
  
  console.log(`  ✅ 解析吞吐量测试完成\n`);
  return results;
}

/**
 * 基准测试2：内存压力测试
 */
async function benchmarkMemoryPressure() {
  console.log('💾 基准测试2：内存压力测试');
  
  const largeDataset = generateTestData(10000); // 10K节点
  const converter = new ProxyConverter();
  
  // 记录初始内存
  if (global.gc) global.gc();
  const initialMemory = process.memoryUsage();
  
  console.log(`  初始内存: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);
  
  // 分批处理测试
  const batchSizes = [100, 500, 1000, 2000];
  const memoryResults = [];
  
  for (const batchSize of batchSizes) {
    console.log(`  测试批次大小: ${batchSize}`);
    
    const batchStartMemory = process.memoryUsage().heapUsed;
    const startTime = performance.now();
    
    const result = await converter.optimizedBatchProcess(
      largeDataset, 
      async (batch) => batch.map(node => ({ ...node, processed: true })),
      {
        batchSize,
        enableMemoryOptimization: true,
        memoryThreshold: 50 * 1024 * 1024 // 50MB
      }
    );
    
    const endTime = performance.now();
    const batchEndMemory = process.memoryUsage().heapUsed;
    
    const duration = endTime - startTime;
    const memoryIncrease = (batchEndMemory - batchStartMemory) / 1024 / 1024;
    const throughput = largeDataset.length / (duration / 1000);
    
    const batchResult = {
      batchSize,
      duration: Math.round(duration),
      throughput: Math.round(throughput),
      memoryIncrease: Math.round(memoryIncrease * 100) / 100,
      resultCount: result.length
    };
    
    memoryResults.push(batchResult);
    
    console.log(`    耗时: ${batchResult.duration}ms`);
    console.log(`    吞吐量: ${batchResult.throughput} nodes/sec`);
    console.log(`    内存增长: ${batchResult.memoryIncrease}MB`);
    
    // 强制垃圾回收
    if (global.gc) {
      global.gc();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  const finalMemory = process.memoryUsage();
  console.log(`  最终内存: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
  console.log(`  总内存增长: ${Math.round((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024)}MB`);
  console.log(`  ✅ 内存压力测试完成\n`);
  
  return memoryResults;
}

/**
 * 基准测试3：去重算法效率测试
 */
function benchmarkDeduplicationEfficiency() {
  console.log('🔄 基准测试3：去重算法效率测试');
  
  const testSizes = [1000, 5000, 10000];
  const duplicateRates = [0.1, 0.3, 0.5]; // 10%, 30%, 50% 重复率
  const results = [];
  
  for (const size of testSizes) {
    for (const dupRate of duplicateRates) {
      console.log(`  测试 ${size} 个节点，${Math.round(dupRate * 100)}% 重复率`);
      
      // 生成带重复的测试数据
      const uniqueNodes = generateTestData(Math.round(size * (1 - dupRate)));
      const duplicateNodes = [];
      
      // 添加重复节点
      const duplicateCount = size - uniqueNodes.length;
      for (let i = 0; i < duplicateCount; i++) {
        const sourceNode = uniqueNodes[i % uniqueNodes.length];
        duplicateNodes.push({
          ...sourceNode,
          name: `${sourceNode.name}_duplicate_${i}`
        });
      }
      
      const testNodes = [...uniqueNodes, ...duplicateNodes];
      
      // 测试键生成性能
      const keyGenStartTime = performance.now();
      const keys = testNodes.map(node => generateFullNodeKey(node));
      const keyGenEndTime = performance.now();
      const keyGenDuration = keyGenEndTime - keyGenStartTime;
      
      // 测试去重性能
      const dedupeStartTime = performance.now();
      const uniqueKeys = new Set(keys);
      const dedupeEndTime = performance.now();
      const dedupeDuration = dedupeEndTime - dedupeStartTime;
      
      const keyGenThroughput = testNodes.length / (keyGenDuration / 1000);
      const dedupeThroughput = testNodes.length / (dedupeDuration / 1000);
      const actualDuplicateRate = (testNodes.length - uniqueKeys.size) / testNodes.length;
      
      const testResult = {
        nodeCount: size,
        expectedDuplicateRate: dupRate,
        actualDuplicateRate: Math.round(actualDuplicateRate * 1000) / 1000,
        keyGenDuration: Math.round(keyGenDuration * 100) / 100,
        keyGenThroughput: Math.round(keyGenThroughput),
        dedupeDuration: Math.round(dedupeDuration * 100) / 100,
        dedupeThroughput: Math.round(dedupeThroughput),
        uniqueCount: uniqueKeys.size,
        duplicateCount: testNodes.length - uniqueKeys.size
      };
      
      results.push(testResult);
      
      console.log(`    键生成: ${testResult.keyGenDuration}ms (${testResult.keyGenThroughput} ops/sec)`);
      console.log(`    去重处理: ${testResult.dedupeDuration}ms (${testResult.dedupeThroughput} ops/sec)`);
      console.log(`    去重效果: ${testResult.duplicateCount}个重复 -> ${testResult.uniqueCount}个唯一`);
    }
  }
  
  console.log(`  ✅ 去重算法效率测试完成\n`);
  return results;
}

/**
 * 生成HTML报告
 */
function generateHTMLReport(parsingResults, memoryResults, deduplicationResults) {
  const reportHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>性能基准测试报告</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1, h2 { color: #333; border-bottom: 2px solid #007acc; padding-bottom: 10px; }
        .summary { background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #007acc; color: white; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #f0f8ff; border-radius: 5px; min-width: 150px; text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007acc; }
        .metric-label { font-size: 14px; color: #666; }
        .chart-placeholder { height: 300px; background: #f9f9f9; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; color: #666; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 性能基准测试报告</h1>
        <div class="summary">
            <h3>📊 测试概览</h3>
            <p><strong>测试时间：</strong>${new Date().toLocaleString('zh-CN')}</p>
            <p><strong>测试环境：</strong>Node.js ${process.version}</p>
            <p><strong>系统平台：</strong>${process.platform} ${process.arch}</p>
        </div>

        <h2>1. 解析吞吐量测试结果</h2>
        <div class="metrics">
            <div class="metric">
                <div class="metric-value">${Math.max(...parsingResults.map(r => r.throughput))}</div>
                <div class="metric-label">最大吞吐量 (nodes/sec)</div>
            </div>
            <div class="metric">
                <div class="metric-value">${Math.min(...parsingResults.map(r => r.memoryUsed))}</div>
                <div class="metric-label">最小内存使用 (MB)</div>
            </div>
        </div>
        <table>
            <tr><th>节点数量</th><th>耗时 (ms)</th><th>吞吐量 (nodes/sec)</th><th>内存使用 (MB)</th><th>结果数量</th></tr>
            ${parsingResults.map(r => `<tr><td>${r.nodeCount}</td><td>${r.duration}</td><td>${r.throughput}</td><td>${r.memoryUsed}</td><td>${r.resultCount}</td></tr>`).join('')}
        </table>

        <h2>2. 内存压力测试结果</h2>
        <div class="metrics">
            <div class="metric">
                <div class="metric-value">${Math.max(...memoryResults.map(r => r.throughput))}</div>
                <div class="metric-label">最大批处理吞吐量 (nodes/sec)</div>
            </div>
            <div class="metric">
                <div class="metric-value">${Math.min(...memoryResults.map(r => r.memoryIncrease))}</div>
                <div class="metric-label">最小内存增长 (MB)</div>
            </div>
        </div>
        <table>
            <tr><th>批次大小</th><th>耗时 (ms)</th><th>吞吐量 (nodes/sec)</th><th>内存增长 (MB)</th><th>结果数量</th></tr>
            ${memoryResults.map(r => `<tr><td>${r.batchSize}</td><td>${r.duration}</td><td>${r.throughput}</td><td>${r.memoryIncrease}</td><td>${r.resultCount}</td></tr>`).join('')}
        </table>

        <h2>3. 去重算法效率测试结果</h2>
        <div class="metrics">
            <div class="metric">
                <div class="metric-value">${Math.max(...deduplicationResults.map(r => r.keyGenThroughput))}</div>
                <div class="metric-label">最大键生成吞吐量 (ops/sec)</div>
            </div>
            <div class="metric">
                <div class="metric-value">${Math.max(...deduplicationResults.map(r => r.dedupeThroughput))}</div>
                <div class="metric-label">最大去重吞吐量 (ops/sec)</div>
            </div>
        </div>
        <table>
            <tr><th>节点数量</th><th>重复率</th><th>键生成 (ms)</th><th>键生成吞吐量</th><th>去重处理 (ms)</th><th>去重吞吐量</th><th>唯一节点</th></tr>
            ${deduplicationResults.map(r => `<tr><td>${r.nodeCount}</td><td>${Math.round(r.actualDuplicateRate * 100)}%</td><td>${r.keyGenDuration}</td><td>${r.keyGenThroughput}</td><td>${r.dedupeDuration}</td><td>${r.dedupeThroughput}</td><td>${r.uniqueCount}</td></tr>`).join('')}
        </table>

        <div class="summary">
            <h3>🎯 性能基准达成情况</h3>
            <ul>
                <li><strong>解析吞吐量：</strong>${Math.max(...parsingResults.map(r => r.throughput))} nodes/sec (目标: >1000)</li>
                <li><strong>内存控制：</strong>${Math.max(...memoryResults.map(r => r.memoryIncrease))}MB 最大增长 (目标: <100MB)</li>
                <li><strong>去重性能：</strong>${Math.max(...deduplicationResults.map(r => r.keyGenThroughput))} ops/sec (目标: >10000)</li>
            </ul>
        </div>
    </div>
</body>
</html>`;

  const reportPath = path.join(__dirname, 'performance-report.html');
  fs.writeFileSync(reportPath, reportHTML, 'utf8');
  console.log(`📄 HTML报告已生成: ${reportPath}`);
  
  return reportPath;
}

/**
 * 主测试函数
 */
async function runBenchmarkSuite() {
  const overallStartTime = performance.now();
  
  try {
    console.log('🎯 开始性能基准测试套件...\n');
    
    // 执行所有基准测试
    const parsingResults = await benchmarkParsingThroughput();
    const memoryResults = await benchmarkMemoryPressure();
    const deduplicationResults = benchmarkDeduplicationEfficiency();
    
    // 生成HTML报告
    const reportPath = generateHTMLReport(parsingResults, memoryResults, deduplicationResults);
    
    const overallEndTime = performance.now();
    const totalDuration = overallEndTime - overallStartTime;
    
    console.log('📋 基准测试套件完成');
    console.log('='.repeat(50));
    console.log(`⏱️ 总测试时间: ${Math.round(totalDuration)}ms`);
    console.log(`📊 解析测试: ${parsingResults.length}个场景`);
    console.log(`💾 内存测试: ${memoryResults.length}个场景`);
    console.log(`🔄 去重测试: ${deduplicationResults.length}个场景`);
    console.log(`📄 HTML报告: ${reportPath}`);
    console.log('='.repeat(50));
    console.log('🎉 所有基准测试完成！');
    
  } catch (error) {
    console.error('❌ 基准测试失败:', error);
    process.exit(1);
  }
}

// 运行基准测试套件
runBenchmarkSuite().catch(error => {
  console.error('💥 基准测试启动失败:', error);
  process.exit(1);
});
