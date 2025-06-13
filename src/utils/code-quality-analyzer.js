/**
 * 代码质量分析器
 * 分析代码质量、复杂度和潜在问题
 */

import fs from 'fs';
import path from 'path';

/**
 * 代码质量指标枚举
 */
export const QualityMetrics = {
  COMPLEXITY: 'complexity',
  MAINTAINABILITY: 'maintainability',
  READABILITY: 'readability',
  SECURITY: 'security',
  PERFORMANCE: 'performance'
};

/**
 * 代码质量分析器类
 */
export class CodeQualityAnalyzer {
  constructor() {
    this.analysisResults = new Map();
    this.qualityThresholds = {
      complexity: 10,        // 圈复杂度阈值
      functionLength: 50,    // 函数长度阈值
      fileLength: 500,       // 文件长度阈值
      parameterCount: 5,     // 参数数量阈值
      nestingDepth: 4        // 嵌套深度阈值
    };
  }

  /**
   * 分析单个文件的代码质量
   * @param {string} filePath - 文件路径
   * @returns {Object} 分析结果
   */
  async analyzeFile(filePath) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const analysis = {
        filePath,
        timestamp: new Date().toISOString(),
        metrics: {},
        issues: [],
        suggestions: [],
        score: 0
      };

      // 基础指标分析
      analysis.metrics.lines = this.countLines(content);
      analysis.metrics.functions = this.countFunctions(content);
      analysis.metrics.classes = this.countClasses(content);
      analysis.metrics.complexity = this.calculateComplexity(content);
      analysis.metrics.maintainability = this.calculateMaintainability(content);

      // 问题检测
      this.detectIssues(content, analysis);

      // 计算总分
      analysis.score = this.calculateQualityScore(analysis);

      // 生成建议
      this.generateSuggestions(analysis);

      this.analysisResults.set(filePath, analysis);
      return analysis;

    } catch (error) {
      console.error(`❌ 分析文件失败: ${filePath}`, error);
      return null;
    }
  }

  /**
   * 计算代码行数
   * @param {string} content - 文件内容
   * @returns {Object} 行数统计
   */
  countLines(content) {
    const lines = content.split('\n');
    const stats = {
      total: lines.length,
      code: 0,
      comments: 0,
      blank: 0
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        stats.blank++;
      } else if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        stats.comments++;
      } else {
        stats.code++;
      }
    }

    return stats;
  }

  /**
   * 计算函数数量和复杂度
   * @param {string} content - 文件内容
   * @returns {Object} 函数统计
   */
  countFunctions(content) {
    const functionPatterns = [
      /function\s+\w+\s*\(/g,
      /\w+\s*:\s*function\s*\(/g,
      /\w+\s*=>\s*{/g,
      /async\s+function\s+\w+\s*\(/g
    ];

    let totalFunctions = 0;
    const functionDetails = [];

    for (const pattern of functionPatterns) {
      const matches = content.match(pattern) || [];
      totalFunctions += matches.length;
    }

    // 分析函数长度
    const functionBlocks = this.extractFunctionBlocks(content);
    for (const block of functionBlocks) {
      const lines = block.split('\n').length;
      const complexity = this.calculateFunctionComplexity(block);
      
      functionDetails.push({
        lines,
        complexity,
        hasIssues: lines > this.qualityThresholds.functionLength || 
                   complexity > this.qualityThresholds.complexity
      });
    }

    return {
      total: totalFunctions,
      details: functionDetails,
      averageLength: functionDetails.length > 0 ? 
        functionDetails.reduce((sum, f) => sum + f.lines, 0) / functionDetails.length : 0,
      averageComplexity: functionDetails.length > 0 ?
        functionDetails.reduce((sum, f) => sum + f.complexity, 0) / functionDetails.length : 0
    };
  }

  /**
   * 计算类数量
   * @param {string} content - 文件内容
   * @returns {Object} 类统计
   */
  countClasses(content) {
    const classPattern = /class\s+\w+/g;
    const matches = content.match(classPattern) || [];
    
    return {
      total: matches.length,
      names: matches.map(match => match.replace('class ', ''))
    };
  }

  /**
   * 计算圈复杂度
   * @param {string} content - 文件内容
   * @returns {number} 复杂度值
   */
  calculateComplexity(content) {
    const complexityPatterns = [
      /if\s*\(/g,
      /else\s+if\s*\(/g,
      /while\s*\(/g,
      /for\s*\(/g,
      /switch\s*\(/g,
      /case\s+/g,
      /catch\s*\(/g,
      /&&/g,
      /\|\|/g,
      /\?/g
    ];

    let complexity = 1; // 基础复杂度

    for (const pattern of complexityPatterns) {
      const matches = content.match(pattern) || [];
      complexity += matches.length;
    }

    return complexity;
  }

  /**
   * 计算可维护性指数
   * @param {string} content - 文件内容
   * @returns {number} 可维护性指数
   */
  calculateMaintainability(content) {
    const lines = this.countLines(content);
    const complexity = this.calculateComplexity(content);
    const functions = this.countFunctions(content);

    // 简化的可维护性计算公式
    const volume = lines.code * Math.log2(functions.total || 1);
    const maintainability = Math.max(0, 171 - 5.2 * Math.log(volume) - 0.23 * complexity - 16.2 * Math.log(lines.code || 1));

    return Math.round(maintainability);
  }

  /**
   * 检测代码问题
   * @param {string} content - 文件内容
   * @param {Object} analysis - 分析结果对象
   */
  detectIssues(content, analysis) {
    const issues = [];

    // 检查文件长度
    if (analysis.metrics.lines.total > this.qualityThresholds.fileLength) {
      issues.push({
        type: 'maintainability',
        severity: 'medium',
        message: `文件过长 (${analysis.metrics.lines.total} 行)`,
        suggestion: '考虑将文件拆分为更小的模块'
      });
    }

    // 检查函数复杂度
    if (analysis.metrics.complexity > this.qualityThresholds.complexity * 2) {
      issues.push({
        type: 'complexity',
        severity: 'high',
        message: `代码复杂度过高 (${analysis.metrics.complexity})`,
        suggestion: '重构复杂的逻辑，提取子函数'
      });
    }

    // 检查潜在的安全问题
    this.detectSecurityIssues(content, issues);

    // 检查性能问题
    this.detectPerformanceIssues(content, issues);

    // 检查代码风格问题
    this.detectStyleIssues(content, issues);

    analysis.issues = issues;
  }

  /**
   * 检测安全问题
   * @param {string} content - 文件内容
   * @param {Array} issues - 问题列表
   */
  detectSecurityIssues(content, issues) {
    const securityPatterns = [
      { pattern: /eval\s*\(/g, message: '使用eval()可能存在安全风险' },
      { pattern: /innerHTML\s*=/g, message: '直接设置innerHTML可能导致XSS' },
      { pattern: /document\.write\s*\(/g, message: 'document.write可能存在安全风险' },
      { pattern: /setTimeout\s*\(\s*["']/g, message: 'setTimeout使用字符串参数存在风险' },
      { pattern: /new\s+Function\s*\(/g, message: '动态创建函数可能存在安全风险' }
    ];

    for (const { pattern, message } of securityPatterns) {
      if (pattern.test(content)) {
        issues.push({
          type: 'security',
          severity: 'high',
          message,
          suggestion: '使用更安全的替代方案'
        });
      }
    }
  }

  /**
   * 检测性能问题
   * @param {string} content - 文件内容
   * @param {Array} issues - 问题列表
   */
  detectPerformanceIssues(content, issues) {
    const performancePatterns = [
      { pattern: /for\s*\([^)]*\.length[^)]*\)/g, message: '循环中重复计算length可能影响性能' },
      { pattern: /document\.getElementById\s*\([^)]*\)\s*\./g, message: '重复的DOM查询可能影响性能' },
      { pattern: /JSON\.parse\s*\(\s*JSON\.stringify/g, message: '深拷贝方式效率较低' }
    ];

    for (const { pattern, message } of performancePatterns) {
      if (pattern.test(content)) {
        issues.push({
          type: 'performance',
          severity: 'medium',
          message,
          suggestion: '优化代码以提升性能'
        });
      }
    }
  }

  /**
   * 检测代码风格问题
   * @param {string} content - 文件内容
   * @param {Array} issues - 问题列表
   */
  detectStyleIssues(content, issues) {
    // 检查长行
    const lines = content.split('\n');
    const longLines = lines.filter(line => line.length > 120);
    if (longLines.length > 0) {
      issues.push({
        type: 'readability',
        severity: 'low',
        message: `发现 ${longLines.length} 行过长的代码`,
        suggestion: '将长行拆分以提高可读性'
      });
    }

    // 检查深度嵌套
    const maxNesting = this.calculateMaxNesting(content);
    if (maxNesting > this.qualityThresholds.nestingDepth) {
      issues.push({
        type: 'readability',
        severity: 'medium',
        message: `嵌套深度过深 (${maxNesting} 层)`,
        suggestion: '减少嵌套深度，提取函数或使用早期返回'
      });
    }
  }

  /**
   * 计算最大嵌套深度
   * @param {string} content - 文件内容
   * @returns {number} 最大嵌套深度
   */
  calculateMaxNesting(content) {
    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of content) {
      if (char === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}') {
        currentDepth--;
      }
    }

    return maxDepth;
  }

  /**
   * 提取函数代码块
   * @param {string} content - 文件内容
   * @returns {Array} 函数代码块数组
   */
  extractFunctionBlocks(content) {
    // 简化的函数提取，实际实现需要更复杂的解析
    const blocks = [];
    const lines = content.split('\n');
    let inFunction = false;
    let braceCount = 0;
    let currentBlock = [];

    for (const line of lines) {
      if (/function\s+\w+|=>\s*{|:\s*function/.test(line)) {
        inFunction = true;
        currentBlock = [line];
        braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      } else if (inFunction) {
        currentBlock.push(line);
        braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        
        if (braceCount <= 0) {
          blocks.push(currentBlock.join('\n'));
          inFunction = false;
          currentBlock = [];
        }
      }
    }

    return blocks;
  }

  /**
   * 计算函数复杂度
   * @param {string} functionCode - 函数代码
   * @returns {number} 复杂度
   */
  calculateFunctionComplexity(functionCode) {
    return this.calculateComplexity(functionCode);
  }

  /**
   * 计算质量分数
   * @param {Object} analysis - 分析结果
   * @returns {number} 质量分数 (0-100)
   */
  calculateQualityScore(analysis) {
    let score = 100;

    // 根据问题严重程度扣分
    for (const issue of analysis.issues) {
      switch (issue.severity) {
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 8;
          break;
        case 'low':
          score -= 3;
          break;
      }
    }

    // 根据复杂度扣分
    if (analysis.metrics.complexity > this.qualityThresholds.complexity) {
      score -= (analysis.metrics.complexity - this.qualityThresholds.complexity) * 2;
    }

    // 根据可维护性加分
    if (analysis.metrics.maintainability > 80) {
      score += 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * 生成改进建议
   * @param {Object} analysis - 分析结果
   */
  generateSuggestions(analysis) {
    const suggestions = [];

    if (analysis.score < 60) {
      suggestions.push('代码质量较低，建议进行重构');
    } else if (analysis.score < 80) {
      suggestions.push('代码质量中等，有改进空间');
    } else {
      suggestions.push('代码质量良好');
    }

    if (analysis.metrics.complexity > this.qualityThresholds.complexity) {
      suggestions.push('降低代码复杂度，提取子函数');
    }

    if (analysis.metrics.functions.averageLength > this.qualityThresholds.functionLength) {
      suggestions.push('缩短函数长度，提高可读性');
    }

    if (analysis.issues.filter(i => i.type === 'security').length > 0) {
      suggestions.push('修复安全问题，提高代码安全性');
    }

    analysis.suggestions = suggestions;
  }

  /**
   * 分析整个项目
   * @param {string} projectPath - 项目路径
   * @returns {Object} 项目分析结果
   */
  async analyzeProject(projectPath) {
    const results = {
      timestamp: new Date().toISOString(),
      projectPath,
      files: [],
      summary: {
        totalFiles: 0,
        totalLines: 0,
        averageScore: 0,
        issueCount: 0,
        recommendations: []
      }
    };

    try {
      const jsFiles = await this.findJavaScriptFiles(projectPath);
      
      for (const filePath of jsFiles) {
        const analysis = await this.analyzeFile(filePath);
        if (analysis) {
          results.files.push(analysis);
        }
      }

      // 计算汇总信息
      this.calculateProjectSummary(results);

      return results;

    } catch (error) {
      console.error('❌ 项目分析失败:', error);
      return null;
    }
  }

  /**
   * 查找JavaScript文件
   * @param {string} dirPath - 目录路径
   * @returns {Array} JavaScript文件路径数组
   */
  async findJavaScriptFiles(dirPath) {
    const jsFiles = [];
    
    const scanDirectory = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          jsFiles.push(fullPath);
        }
      }
    };

    await scanDirectory(dirPath);
    return jsFiles;
  }

  /**
   * 计算项目汇总信息
   * @param {Object} results - 分析结果
   */
  calculateProjectSummary(results) {
    const summary = results.summary;
    summary.totalFiles = results.files.length;
    
    if (results.files.length === 0) return;

    summary.totalLines = results.files.reduce((sum, file) => sum + file.metrics.lines.total, 0);
    summary.averageScore = Math.round(
      results.files.reduce((sum, file) => sum + file.score, 0) / results.files.length
    );
    summary.issueCount = results.files.reduce((sum, file) => sum + file.issues.length, 0);

    // 生成项目级建议
    const lowQualityFiles = results.files.filter(f => f.score < 60).length;
    const securityIssues = results.files.reduce((sum, f) => 
      sum + f.issues.filter(i => i.type === 'security').length, 0);

    if (lowQualityFiles > 0) {
      summary.recommendations.push(`${lowQualityFiles} 个文件质量较低，需要重构`);
    }
    
    if (securityIssues > 0) {
      summary.recommendations.push(`发现 ${securityIssues} 个安全问题，需要修复`);
    }

    if (summary.averageScore > 80) {
      summary.recommendations.push('项目整体代码质量良好');
    }
  }

  /**
   * 生成质量报告
   * @param {Object} projectAnalysis - 项目分析结果
   * @returns {string} 报告内容
   */
  generateQualityReport(projectAnalysis) {
    if (!projectAnalysis) return '无法生成报告';

    const { summary, files } = projectAnalysis;
    
    let report = `# 代码质量分析报告\n\n`;
    report += `**分析时间**: ${projectAnalysis.timestamp}\n`;
    report += `**项目路径**: ${projectAnalysis.projectPath}\n\n`;
    
    report += `## 📊 总体概况\n`;
    report += `- **文件总数**: ${summary.totalFiles}\n`;
    report += `- **代码行数**: ${summary.totalLines}\n`;
    report += `- **平均质量分数**: ${summary.averageScore}/100\n`;
    report += `- **问题总数**: ${summary.issueCount}\n\n`;

    report += `## 🎯 主要建议\n`;
    for (const recommendation of summary.recommendations) {
      report += `- ${recommendation}\n`;
    }
    report += '\n';

    // 质量分数分布
    const scoreRanges = { high: 0, medium: 0, low: 0 };
    files.forEach(file => {
      if (file.score >= 80) scoreRanges.high++;
      else if (file.score >= 60) scoreRanges.medium++;
      else scoreRanges.low++;
    });

    report += `## 📈 质量分布\n`;
    report += `- **高质量** (80-100分): ${scoreRanges.high} 个文件\n`;
    report += `- **中等质量** (60-79分): ${scoreRanges.medium} 个文件\n`;
    report += `- **低质量** (0-59分): ${scoreRanges.low} 个文件\n\n`;

    // 问题类型统计
    const issueTypes = {};
    files.forEach(file => {
      file.issues.forEach(issue => {
        issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
      });
    });

    if (Object.keys(issueTypes).length > 0) {
      report += `## ⚠️ 问题类型分布\n`;
      for (const [type, count] of Object.entries(issueTypes)) {
        report += `- **${type}**: ${count} 个问题\n`;
      }
      report += '\n';
    }

    return report;
  }
}

// 创建全局代码质量分析器实例
export const globalCodeQualityAnalyzer = new CodeQualityAnalyzer();

export default globalCodeQualityAnalyzer;
