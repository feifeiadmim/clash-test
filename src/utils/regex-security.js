/**
 * 正则表达式安全检查器
 * 防止恶意正则表达式绕过安全检查
 */

/**
 * 正则表达式安全分析器
 */
export class RegexSecurityAnalyzer {
  // 危险的正则表达式模式
  static DANGEROUS_PATTERNS = [
    // 嵌套量词
    /(\+|\*|\?|\{[^}]*\})\s*(\+|\*|\?|\{[^}]*\})/,
    // 过度的回溯
    /\([^)]*\+[^)]*\)\+/,
    // 复杂的交替
    /(\|[^|]{20,}){3,}/,
    // 过长的字符类
    /\[[^\]]{50,}\]/,
    // 深度嵌套的组
    /(\([^)]*){5,}/
  ];

  // 复杂度评分权重
  static COMPLEXITY_WEIGHTS = {
    quantifiers: 2,      // 量词
    groups: 1,           // 分组
    alternations: 3,     // 交替
    charClasses: 1,      // 字符类
    anchors: 0.5,        // 锚点
    escapes: 0.5,        // 转义
    length: 0.1          // 长度
  };

  /**
   * 分析正则表达式的安全性
   * @param {RegExp|string} pattern - 正则表达式
   * @returns {Object} 安全分析结果
   */
  static analyzeRegexSecurity(pattern) {
    const patternStr = pattern instanceof RegExp ? pattern.source : pattern;
    
    if (!patternStr || typeof patternStr !== 'string') {
      return {
        isSafe: false,
        risk: 'high',
        issues: ['Invalid pattern'],
        complexity: 0,
        recommendations: ['Use a valid regex pattern']
      };
    }

    const analysis = {
      isSafe: true,
      risk: 'low',
      issues: [],
      complexity: 0,
      recommendations: [],
      details: {}
    };

    // 基本长度检查
    if (patternStr.length > 1000) {
      analysis.isSafe = false;
      analysis.risk = 'high';
      analysis.issues.push('Pattern too long');
      analysis.recommendations.push('Simplify the regex pattern');
    }

    // 检查危险模式
    for (const dangerousPattern of this.DANGEROUS_PATTERNS) {
      if (dangerousPattern.test(patternStr)) {
        analysis.isSafe = false;
        analysis.risk = 'high';
        analysis.issues.push('Contains dangerous pattern');
        analysis.recommendations.push('Avoid nested quantifiers and complex alternations');
        break;
      }
    }

    // 计算复杂度
    const complexity = this.calculateComplexity(patternStr);
    analysis.complexity = complexity.score;
    analysis.details = complexity.details;

    // 根据复杂度评估风险
    if (complexity.score > 100) {
      analysis.isSafe = false;
      analysis.risk = 'high';
      analysis.issues.push('Complexity too high');
      analysis.recommendations.push('Reduce regex complexity');
    } else if (complexity.score > 50) {
      analysis.risk = 'medium';
      analysis.recommendations.push('Consider simplifying the regex');
    }

    // 检查特定的危险构造
    this.checkSpecificPatterns(patternStr, analysis);

    return analysis;
  }

  /**
   * 计算正则表达式复杂度
   * @param {string} pattern - 正则表达式字符串
   * @returns {Object} 复杂度分析
   */
  static calculateComplexity(pattern) {
    const details = {
      quantifiers: 0,
      groups: 0,
      alternations: 0,
      charClasses: 0,
      anchors: 0,
      escapes: 0,
      length: pattern.length
    };

    // 计算各种元素的数量
    details.quantifiers = (pattern.match(/[\+\*\?\{]/g) || []).length;
    details.groups = (pattern.match(/\(/g) || []).length;
    details.alternations = (pattern.match(/\|/g) || []).length;
    details.charClasses = (pattern.match(/\[/g) || []).length;
    details.anchors = (pattern.match(/[\^\$]/g) || []).length;
    details.escapes = (pattern.match(/\\/g) || []).length;

    // 计算加权复杂度分数
    const score = 
      details.quantifiers * this.COMPLEXITY_WEIGHTS.quantifiers +
      details.groups * this.COMPLEXITY_WEIGHTS.groups +
      details.alternations * this.COMPLEXITY_WEIGHTS.alternations +
      details.charClasses * this.COMPLEXITY_WEIGHTS.charClasses +
      details.anchors * this.COMPLEXITY_WEIGHTS.anchors +
      details.escapes * this.COMPLEXITY_WEIGHTS.escapes +
      details.length * this.COMPLEXITY_WEIGHTS.length;

    return { score, details };
  }

  /**
   * 检查特定的危险模式
   * @param {string} pattern - 正则表达式字符串
   * @param {Object} analysis - 分析结果对象
   */
  static checkSpecificPatterns(pattern, analysis) {
    // 检查灾难性回溯模式
    const catastrophicPatterns = [
      /\([^)]*\+[^)]*\)\+/,           // (a+)+
      /\([^)]*\*[^)]*\)\*/,           // (a*)*
      /\([^)]*\+[^)]*\)\*/,           // (a+)*
      /\([^)]*\*[^)]*\)\+/,           // (a*)+
    ];

    for (const catPattern of catastrophicPatterns) {
      if (catPattern.test(pattern)) {
        analysis.isSafe = false;
        analysis.risk = 'critical';
        analysis.issues.push('Catastrophic backtracking pattern detected');
        analysis.recommendations.push('Rewrite to avoid nested quantifiers');
        break;
      }
    }

    // 检查过度的字符类
    const charClassMatches = pattern.match(/\[[^\]]+\]/g) || [];
    for (const charClass of charClassMatches) {
      if (charClass.length > 100) {
        analysis.issues.push('Overly complex character class');
        analysis.recommendations.push('Simplify character classes');
        if (analysis.risk === 'low') analysis.risk = 'medium';
      }
    }

    // 检查深度嵌套
    let nestingDepth = 0;
    let maxNesting = 0;
    for (const char of pattern) {
      if (char === '(') {
        nestingDepth++;
        maxNesting = Math.max(maxNesting, nestingDepth);
      } else if (char === ')') {
        nestingDepth--;
      }
    }

    if (maxNesting > 10) {
      analysis.issues.push('Excessive nesting depth');
      analysis.recommendations.push('Reduce nesting depth');
      if (analysis.risk === 'low') analysis.risk = 'medium';
    }
  }

  /**
   * 验证正则表达式是否安全
   * @param {RegExp|string} pattern - 正则表达式
   * @returns {boolean} 是否安全
   */
  static isRegexSafe(pattern) {
    const analysis = this.analyzeRegexSecurity(pattern);
    return analysis.isSafe && analysis.risk !== 'critical';
  }

  /**
   * 创建安全的正则表达式
   * @param {string} pattern - 正则表达式字符串
   * @param {string} flags - 正则表达式标志
   * @returns {RegExp|null} 安全的正则表达式或null
   */
  static createSafeRegex(pattern, flags = '') {
    try {
      const analysis = this.analyzeRegexSecurity(pattern);
      
      if (!analysis.isSafe) {
        console.warn('⚠️ 不安全的正则表达式:', {
          pattern: pattern.substring(0, 100),
          issues: analysis.issues,
          risk: analysis.risk
        });
        return null;
      }

      return new RegExp(pattern, flags);
    } catch (error) {
      console.warn('⚠️ 正则表达式创建失败:', error.message);
      return null;
    }
  }

  /**
   * 获取安全的替代方案建议
   * @param {string} pattern - 原始正则表达式
   * @returns {Array<string>} 建议的替代方案
   */
  static getSafeAlternatives(pattern) {
    const suggestions = [];

    // 常见模式的安全替代方案
    const alternatives = {
      // IPv4地址
      /\(\?\:\(\?\:25\[0-5\].*?\)\\\.\)\{3\}.*?/: 'Use function-based IPv4 validation',
      // 邮箱地址
      /\[a-zA-Z0-9\]\+@\[a-zA-Z0-9\]\+\\\.\[a-zA-Z\]\{2,\}/: 'Use simple email format check',
      // URL
      /https?\:\/\/.*?\.\w+/: 'Use URL constructor for validation',
      // UUID
      /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/: 'Use character-by-character UUID validation'
    };

    for (const [dangerousPattern, suggestion] of Object.entries(alternatives)) {
      if (new RegExp(dangerousPattern).test(pattern)) {
        suggestions.push(suggestion);
      }
    }

    if (suggestions.length === 0) {
      suggestions.push('Consider using string methods instead of regex');
      suggestions.push('Break complex patterns into simpler parts');
      suggestions.push('Use function-based validation');
    }

    return suggestions;
  }
}

/**
 * 安全的正则表达式工厂
 */
export class SafeRegexFactory {
  // 预定义的安全正则表达式
  static SAFE_PATTERNS = {
    // 基本模式
    alphanumeric: /^[a-zA-Z0-9]+$/,
    numeric: /^[0-9]+$/,
    hexadecimal: /^[0-9a-fA-F]+$/,
    
    // 网络相关（简化版）
    simpleEmail: /^[^@]+@[^@]+\.[^@]+$/,
    simpleUrl: /^https?:\/\/.+/,
    
    // 安全的字符检查
    safeChars: /^[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/,
    noControlChars: /^[^\x00-\x1F\x7F-\x9F]*$/
  };

  /**
   * 获取预定义的安全正则表达式
   * @param {string} name - 模式名称
   * @returns {RegExp|null} 正则表达式或null
   */
  static getSafePattern(name) {
    return this.SAFE_PATTERNS[name] || null;
  }

  /**
   * 创建安全的正则表达式
   * @param {string} pattern - 正则表达式字符串
   * @param {string} flags - 标志
   * @returns {RegExp|null} 安全的正则表达式或null
   */
  static create(pattern, flags = '') {
    return RegexSecurityAnalyzer.createSafeRegex(pattern, flags);
  }

  /**
   * 验证并创建正则表达式
   * @param {string} pattern - 正则表达式字符串
   * @param {string} flags - 标志
   * @returns {Object} 创建结果
   */
  static createWithValidation(pattern, flags = '') {
    const analysis = RegexSecurityAnalyzer.analyzeRegexSecurity(pattern);
    const regex = analysis.isSafe ? new RegExp(pattern, flags) : null;

    return {
      regex,
      analysis,
      alternatives: analysis.isSafe ? [] : RegexSecurityAnalyzer.getSafeAlternatives(pattern)
    };
  }
}
