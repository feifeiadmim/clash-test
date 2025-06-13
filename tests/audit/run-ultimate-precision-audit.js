/**
 * 终极去重精准度审查执行脚本
 * 运行最全面的精准度测试，确保达到最高标准
 */

import { UltimatePrecisionAuditor } from './ultimate-precision-audit.js';
import { PrecisionAuditReportGenerator } from './report-generator.js';

/**
 * 主执行函数
 */
async function runUltimatePrecisionAudit() {
  console.log('🚀 启动终极去重精准度审查');
  console.log('目标: 达到最高的准确性和精准度标准\n');
  
  const auditor = new UltimatePrecisionAuditor();
  
  try {
    // 执行完整审查
    await auditor.runCompleteAudit();
    
    // 生成详细报告
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: auditor.generateSummary(),
      statistics: auditor.statistics,
      issues: auditor.issues,
      testResults: auditor.testResults,
      recommendations: auditor.generateRecommendations(),
      precisionScore: auditor.calculatePrecisionScore()
    };
    
    // 保存JSON报告
    const fs = await import('fs');
    const jsonReportPath = 'tests/audit/ultimate-precision-audit-report.json';
    fs.default.writeFileSync(jsonReportPath, JSON.stringify(reportData, null, 2));
    console.log(`\n📄 JSON报告已保存: ${jsonReportPath}`);
    
    // 生成Markdown报告
    const markdownReportPath = PrecisionAuditReportGenerator.generateMarkdownReport(reportData);
    console.log(`📄 Markdown报告已保存: ${markdownReportPath}`);
    
    // 显示最终结论
    displayFinalConclusion(reportData);
    
  } catch (error) {
    console.error('❌ 审查执行失败:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * 显示最终结论
 */
function displayFinalConclusion(reportData) {
  console.log('\n' + '='.repeat(100));
  console.log('🎯 终极精准度审查最终结论');
  console.log('='.repeat(100));
  
  const score = reportData.precisionScore;
  const criticalIssues = reportData.statistics.criticalIssues;
  const majorIssues = reportData.statistics.majorIssues;
  const minorIssues = reportData.statistics.minorIssues;
  
  // 精准度等级判定
  let grade, recommendation, emoji;
  
  if (score >= 95 && criticalIssues === 0) {
    grade = '🏆 卓越级 (EXCELLENT)';
    emoji = '🎉';
    recommendation = '去重策略已达到最高标准，可以放心在生产环境中使用！';
  } else if (score >= 85 && criticalIssues === 0) {
    grade = '🥇 优秀级 (VERY_GOOD)';
    emoji = '✨';
    recommendation = '去重策略表现优秀，建议解决剩余问题以达到卓越水平。';
  } else if (score >= 75 && criticalIssues <= 2) {
    grade = '🥈 良好级 (GOOD)';
    emoji = '👍';
    recommendation = '去重策略基本可用，需要优先解决严重和重要问题。';
  } else {
    grade = '🥉 需要改进 (NEEDS_IMPROVEMENT)';
    emoji = '⚠️';
    recommendation = '去重策略存在较多问题，需要进行全面优化后才能使用。';
  }
  
  console.log(`${emoji} 精准度等级: ${grade}`);
  console.log(`🎯 精准度评分: ${score}/100`);
  console.log(`📊 测试通过率: ${reportData.summary.passRate}%`);
  console.log('');
  console.log('📋 问题统计:');
  console.log(`  🔴 严重问题: ${criticalIssues}个`);
  console.log(`  🟡 重要问题: ${majorIssues}个`);
  console.log(`  🟢 轻微问题: ${minorIssues}个`);
  console.log('');
  console.log('💡 建议:');
  console.log(`  ${recommendation}`);
  
  // 具体行动建议
  if (criticalIssues > 0) {
    console.log('');
    console.log('🚨 紧急行动项:');
    console.log(`  立即修复 ${criticalIssues} 个严重问题，这些问题可能导致去重错误！`);
  }
  
  if (majorIssues > 0) {
    console.log('');
    console.log('⚠️ 重要改进项:');
    console.log(`  计划修复 ${majorIssues} 个重要问题，以提升精准度和可靠性。`);
  }
  
  if (score >= 95 && criticalIssues === 0 && majorIssues === 0) {
    console.log('');
    console.log('🎊 恭喜！去重策略已达到最高精准度标准！');
    console.log('✅ 可以放心在任何生产环境中使用');
    console.log('✅ 精准度和性能都达到了企业级标准');
    console.log('✅ 所有测试都通过了严格的验证');
  }
  
  console.log('='.repeat(100));
}

/**
 * 显示使用帮助
 */
function showHelp() {
  console.log(`
🎯 终极去重精准度审查工具

用法:
  node run-ultimate-precision-audit.js [选项]

选项:
  --help, -h     显示此帮助信息
  --verbose, -v  显示详细输出
  --quick, -q    快速模式（跳过大规模测试）

功能:
  ✅ 基础精准度测试 - 验证核心去重逻辑
  ✅ 协议特定测试 - 验证各协议的精准度
  ✅ 边界情况测试 - 验证特殊情况处理
  ✅ 大规模数据测试 - 验证性能和稳定性
  ✅ 性能平衡测试 - 验证精准度与性能的平衡

输出:
  📄 JSON格式详细报告
  📄 Markdown格式可读报告
  📊 精准度评分和等级
  💡 具体的优化建议

目标:
  🎯 达到最高的去重准确性和精准度标准
  🏆 确保去重策略达到企业级质量
  ✨ 提供可操作的优化建议
`);
}

// 处理命令行参数
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

// 执行审查
runUltimatePrecisionAudit().catch(error => {
  console.error('💥 执行失败:', error);
  process.exit(1);
});
