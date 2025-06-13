/**
 * 精准度审查报告生成器
 */

import fs from 'fs';
import path from 'path';

/**
 * 报告生成器类
 */
export class PrecisionAuditReportGenerator {
  
  /**
   * 生成Markdown格式的详细报告
   */
  static generateMarkdownReport(auditData) {
    const report = this.buildMarkdownContent(auditData);
    const reportPath = 'tests/audit/ultimate-precision-audit-report.md';
    
    fs.writeFileSync(reportPath, report, 'utf8');
    console.log(`📄 Markdown报告已生成: ${reportPath}`);
    
    return reportPath;
  }

  /**
   * 构建Markdown报告内容
   */
  static buildMarkdownContent(data) {
    const timestamp = new Date(data.timestamp).toLocaleString('zh-CN');
    
    return `# 🎯 终极去重精准度审查报告

## 📋 审查概述

**审查时间**: ${timestamp}  
**审查目标**: 达到最高的去重准确性和精准度标准  
**审查结果**: ${this.getOverallStatusEmoji(data.summary.overallStatus)} **${this.getOverallStatusText(data.summary.overallStatus)}**

## 📊 总体评估

### 🎯 精准度评分
- **最终评分**: **${data.precisionScore}/100**
- **评级**: ${this.getPrecisionGrade(data.precisionScore)}
- **测试通过率**: ${data.summary.passRate}%
- **严重问题率**: ${data.summary.criticalIssueRate}%

### 📈 统计数据
| 指标 | 数值 | 状态 |
|------|------|------|
| 总测试数 | ${data.statistics.totalTests} | - |
| 通过测试 | ${data.statistics.passedTests} | ✅ |
| 失败测试 | ${data.statistics.failedTests} | ${data.statistics.failedTests > 0 ? '❌' : '✅'} |
| 严重问题 | ${data.statistics.criticalIssues} | ${data.statistics.criticalIssues > 0 ? '🔴' : '✅'} |
| 重要问题 | ${data.statistics.majorIssues} | ${data.statistics.majorIssues > 0 ? '🟡' : '✅'} |
| 轻微问题 | ${data.statistics.minorIssues} | ${data.statistics.minorIssues > 0 ? '🟢' : '✅'} |

## 🔍 详细测试结果

${this.generateTestResultsSection(data.testResults)}

## ❌ 发现的问题

${this.generateIssuesSection(data.issues)}

## 📋 优化建议

${this.generateRecommendationsSection(data.recommendations)}

## 📊 性能指标

${this.generatePerformanceSection(data.testResults)}

## 🎯 结论与建议

${this.generateConclusionSection(data)}

---
*报告生成时间: ${timestamp}*  
*审查工具版本: Ultimate Precision Auditor v1.0*
`;
  }

  /**
   * 生成测试结果部分
   */
  static generateTestResultsSection(testResults) {
    const sections = {
      '基础精准度测试': [],
      '协议特定精准度测试': [],
      '边界情况精准度测试': [],
      '大规模数据精准度测试': [],
      '性能与精准度平衡测试': []
    };

    // 根据测试名称分类
    testResults.forEach(result => {
      const testName = result.name;
      if (testName.includes('完全相同') || testName.includes('字段顺序') || testName.includes('大小写') || testName.includes('空格') || testName.includes('数值类型')) {
        sections['基础精准度测试'].push(result);
      } else if (testName.includes('协议') || testName.includes('VMess') || testName.includes('VLESS') || testName.includes('Trojan') || testName.includes('Shadowsocks') || testName.includes('Hysteria')) {
        sections['协议特定精准度测试'].push(result);
      } else if (testName.includes('空值') || testName.includes('特殊字符') || testName.includes('Unicode') || testName.includes('IPv6') || testName.includes('极长')) {
        sections['边界情况精准度测试'].push(result);
      } else if (testName.includes('万级') || testName.includes('大规模') || testName.includes('内存压力') || testName.includes('重复率分布')) {
        sections['大规模数据精准度测试'].push(result);
      } else if (testName.includes('性能') || testName.includes('速度') || testName.includes('权衡')) {
        sections['性能与精准度平衡测试'].push(result);
      }
    });

    let content = '';
    
    Object.entries(sections).forEach(([sectionName, results]) => {
      if (results.length > 0) {
        content += `### ${sectionName}\n\n`;
        
        results.forEach(result => {
          const status = result.passed ? '✅' : '❌';
          const severity = this.getSeverityEmoji(result.severity);
          
          content += `#### ${status} ${result.name} ${severity}\n\n`;
          content += `**状态**: ${result.passed ? '通过' : '失败'}  \n`;
          content += `**严重性**: ${result.severity}  \n`;
          
          if (result.reason) {
            content += `**原因**: ${result.reason}  \n`;
          }
          
          if (result.details) {
            content += `**详情**: ${result.details}  \n`;
          }
          
          if (result.metrics) {
            content += `**指标**: ${JSON.stringify(result.metrics)}  \n`;
          }
          
          content += '\n';
        });
      }
    });

    return content || '暂无测试结果';
  }

  /**
   * 生成问题部分
   */
  static generateIssuesSection(issues) {
    if (issues.length === 0) {
      return '🎉 **未发现任何问题！去重策略精准度完美。**\n';
    }

    const criticalIssues = issues.filter(i => i.severity === 'CRITICAL');
    const majorIssues = issues.filter(i => i.severity === 'MAJOR');
    const minorIssues = issues.filter(i => i.severity === 'MINOR');

    let content = '';

    if (criticalIssues.length > 0) {
      content += '### 🔴 严重问题\n\n';
      criticalIssues.forEach((issue, index) => {
        content += `#### ${index + 1}. ${issue.test}\n\n`;
        content += `**问题**: ${issue.reason}  \n`;
        if (issue.details) content += `**详情**: ${issue.details}  \n`;
        if (issue.suggestion) content += `**建议**: ${issue.suggestion}  \n`;
        content += '\n';
      });
    }

    if (majorIssues.length > 0) {
      content += '### 🟡 重要问题\n\n';
      majorIssues.forEach((issue, index) => {
        content += `#### ${index + 1}. ${issue.test}\n\n`;
        content += `**问题**: ${issue.reason}  \n`;
        if (issue.details) content += `**详情**: ${issue.details}  \n`;
        if (issue.suggestion) content += `**建议**: ${issue.suggestion}  \n`;
        content += '\n';
      });
    }

    if (minorIssues.length > 0) {
      content += '### 🟢 轻微问题\n\n';
      minorIssues.forEach((issue, index) => {
        content += `#### ${index + 1}. ${issue.test}\n\n`;
        content += `**问题**: ${issue.reason}  \n`;
        if (issue.details) content += `**详情**: ${issue.details}  \n`;
        if (issue.suggestion) content += `**建议**: ${issue.suggestion}  \n`;
        content += '\n';
      });
    }

    return content;
  }

  /**
   * 生成建议部分
   */
  static generateRecommendationsSection(recommendations) {
    if (!recommendations || recommendations.length === 0) {
      return '✅ **当前去重策略已达到最高标准，无需额外优化。**\n';
    }

    let content = '';
    
    recommendations.forEach((rec, index) => {
      content += `### ${index + 1}. ${rec.title}\n\n`;
      content += `**优先级**: ${rec.priority}  \n`;
      content += `**描述**: ${rec.description}  \n`;
      
      if (rec.steps && rec.steps.length > 0) {
        content += `**实施步骤**:  \n`;
        rec.steps.forEach((step, stepIndex) => {
          content += `${stepIndex + 1}. ${step}  \n`;
        });
      }
      
      if (rec.expectedImpact) {
        content += `**预期影响**: ${rec.expectedImpact}  \n`;
      }
      
      content += '\n';
    });

    return content;
  }

  /**
   * 生成性能部分
   */
  static generatePerformanceSection(testResults) {
    const performanceTests = testResults.filter(r => 
      r.name.includes('性能') || r.name.includes('速度') || r.name.includes('内存') || r.metrics?.processingTime
    );

    if (performanceTests.length === 0) {
      return '暂无性能测试数据\n';
    }

    let content = '### 🚀 性能测试结果\n\n';
    
    performanceTests.forEach(test => {
      content += `#### ${test.name}\n\n`;
      
      if (test.metrics) {
        const metrics = test.metrics;
        
        if (metrics.processingTime) {
          content += `- **处理时间**: ${metrics.processingTime.toFixed(2)}ms  \n`;
        }
        
        if (metrics.avgTime) {
          content += `- **平均时间**: ${metrics.avgTime.toFixed(4)}ms  \n`;
        }
        
        if (metrics.keysPerSecond) {
          content += `- **处理速度**: ${metrics.keysPerSecond}键/秒  \n`;
        }
        
        if (metrics.memoryIncrease) {
          content += `- **内存增长**: ${(metrics.memoryIncrease / 1024 / 1024).toFixed(1)}MB  \n`;
        }
        
        if (metrics.nodeCount) {
          content += `- **节点数量**: ${metrics.nodeCount}  \n`;
        }
      }
      
      content += '\n';
    });

    return content;
  }

  /**
   * 生成结论部分
   */
  static generateConclusionSection(data) {
    const score = data.precisionScore;
    const status = data.summary.overallStatus;
    
    let content = '';
    
    if (score >= 95) {
      content += '🏆 **卓越级精准度**\n\n';
      content += '去重策略已达到卓越水平，精准度和性能都表现优异。可以放心在生产环境中使用。\n\n';
    } else if (score >= 85) {
      content += '🥇 **优秀级精准度**\n\n';
      content += '去重策略表现优秀，大部分测试通过。建议解决发现的问题以达到卓越水平。\n\n';
    } else if (score >= 75) {
      content += '🥈 **良好级精准度**\n\n';
      content += '去重策略基本可用，但存在一些需要改进的问题。建议优先解决严重和重要问题。\n\n';
    } else {
      content += '🥉 **需要改进**\n\n';
      content += '去重策略存在较多问题，需要进行全面优化。建议按优先级逐步解决所有发现的问题。\n\n';
    }

    // 添加具体建议
    if (data.statistics.criticalIssues > 0) {
      content += '### 🚨 紧急行动项\n\n';
      content += `发现 ${data.statistics.criticalIssues} 个严重问题，需要立即修复以确保去重策略的可靠性。\n\n`;
    }

    if (data.statistics.majorIssues > 0) {
      content += '### ⚠️ 重要改进项\n\n';
      content += `发现 ${data.statistics.majorIssues} 个重要问题，建议在下个版本中修复以提升精准度。\n\n`;
    }

    if (data.statistics.minorIssues > 0) {
      content += '### 💡 优化建议\n\n';
      content += `发现 ${data.statistics.minorIssues} 个轻微问题，可以在后续版本中逐步优化。\n\n`;
    }

    return content;
  }

  /**
   * 获取总体状态表情符号
   */
  static getOverallStatusEmoji(status) {
    const emojiMap = {
      'EXCELLENT': '🏆',
      'GOOD': '✅',
      'NEEDS_IMPROVEMENT': '⚠️'
    };
    return emojiMap[status] || '❓';
  }

  /**
   * 获取总体状态文本
   */
  static getOverallStatusText(status) {
    const textMap = {
      'EXCELLENT': '卓越',
      'GOOD': '良好',
      'NEEDS_IMPROVEMENT': '需要改进'
    };
    return textMap[status] || '未知';
  }

  /**
   * 获取精准度等级
   */
  static getPrecisionGrade(score) {
    if (score >= 95) return '🏆 卓越 (EXCELLENT)';
    if (score >= 85) return '🥇 优秀 (VERY_GOOD)';
    if (score >= 75) return '🥈 良好 (GOOD)';
    return '🥉 需要改进 (NEEDS_IMPROVEMENT)';
  }

  /**
   * 获取严重性表情符号
   */
  static getSeverityEmoji(severity) {
    const emojiMap = {
      'CRITICAL': '🔴',
      'MAJOR': '🟡',
      'MINOR': '🟢'
    };
    return emojiMap[severity] || '';
  }
}
