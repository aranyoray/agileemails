// Email classification and priority scoring engine

class EmailClassifier {
  constructor() {
    this.categories = {
      'school': {
        keywords: [
          'university', 'college', 'professor', 'prof', 'assignment', 'homework', 'course', 
          'syllabus', 'campus', 'edu', 'education', 'student', 'class', 'lecture',
          'exam', 'test', 'quiz', 'midterm', 'final', 'grade', 'grades', 'gpa',
          'registration', 'enrollment', 'tuition', 'financial aid', 'scholarship',
          'blackboard', 'canvas', 'moodle', 'coursework', 'due date', 'submission'
        ],
        domains: ['edu', 'school', 'university', 'college'],
        priority: 3
      },
      'work-current': {
        keywords: [
          'team', 'meeting', 'project', 'deadline', 'urgent', 'asap', 'standup', 'sprint',
          'stand-up', 'stand up', 'sync', 'sync up', '1:1', 'one-on-one', 'one on one',
          'review', 'code review', 'pr review', 'pull request', 'merge', 'deploy',
          'sprint planning', 'retrospective', 'retro', 'all hands', 'all-hands',
          'slack', 'jira', 'confluence', 'trello', 'asana', 'notion',
          'follow up', 'follow-up', 'action items', 'action item', 'todo', 'to-do'
        ],
        priority: 4
      },
      'work-opportunities': {
        keywords: [
          'opportunity', 'job', 'position', 'recruiter', 'hiring', 'career', 'interview', 'linkedin',
          'job opening', 'job opportunity', 'we are hiring', 'we\'re hiring', 'hiring now',
          'apply now', 'application', 'resume', 'cv', 'curriculum vitae',
          'recruiting', 'talent', 'headhunter', 'recruitment', 'job search',
          'indeed', 'glassdoor', 'monster', 'ziprecruiter', 'angel.co', 'angelist'
        ],
        priority: 3
      },
      'finance': {
        keywords: [
          // Payments & transactions
          'payment', 'invoice', 'receipt', 'transaction', 'purchase', 'charge', 'charged',
          // Bank & accounts
          'bank', 'banking', 'account', 'checking', 'savings', 'deposit', 'withdrawal', 'transfer',
          // Credit cards
          'credit card', 'creditcard', 'card ending', 'card number', 'expires',
          // Statements & balances
          'statement', 'balance', 'account balance', 'available balance', 'account summary',
          // Money amounts
          '$', 'dollar', 'amount due', 'balance due', 'payment due', 'minimum payment',
          // Subscriptions
          'subscription', 'renewal', 'renew', 'billing', 'billed', 'monthly', 'annual', 'yearly',
          'subscription fee', 'membership', 'auto-renew', 'auto renew',
          // Financial services
          'paypal', 'stripe', 'venmo', 'zelle', 'cash app', 'square', 'chase', 'bank of america',
          'wells fargo', 'citi', 'american express', 'amex', 'discover', 'capital one',
          // Bills & utilities
          'bill', 'billing', 'utility', 'electric', 'gas', 'water', 'phone bill', 'internet bill',
          // Financial alerts
          'alert', 'notification', 'reminder', 'payment reminder', 'overdue', 'past due'
        ],
        domains: ['bank', 'paypal', 'stripe', 'chase', 'wellsfargo', 'bofa', 'citi', 'amex', 
                  'discover', 'capitalone', 'venmo', 'square', 'billing', 'invoice', 'payment'],
        priority: 4
      },
      'personal': {
        keywords: [
          'family', 'friend', 'friends', 'birthday', 'party', 'weekend', 'dinner',
          'lunch', 'brunch', 'coffee', 'drinks', 'happy hour', 'celebration',
          'congratulations', 'congrats', 'wedding', 'baby', 'shower', 'anniversary',
          'holiday', 'vacation', 'trip', 'travel', 'weekend plans', 'get together',
          'catch up', 'hang out', 'hangout'
        ],
        priority: 2
      },
      'auth-codes': {
        keywords: ['verification code', 'security code', 'login code', 'one-time', 'otp', '2fa'],
        priority: 1,
        autoDelete: 1
      },
      'promo': {
        keywords: [
          'sale', 'discount', 'offer', 'deal', 'promo', 'coupon', 'subscribe', 'unsubscribe',
          'limited time', 'limited-time', 'act now', 'buy now', 'shop now', 'order now',
          'free shipping', 'free trial', 'special offer', 'exclusive offer', 'flash sale',
          'clearance', 'savings', 'save up to', 'percent off', '% off', 'off',
          'newsletter', 'marketing', 'promotional', 'advertisement', 'ad', 'ads',
          'noreply', 'no-reply', 'donotreply', 'do not reply', 'mailing list'
        ],
        priority: 1,
        autoDelete: 1
      }
    };

    this.urgentKeywords = [
      'urgent', 'asap', 'as soon as possible', 'immediately', 'immediate', 'right away',
      'deadline', 'due today', 'due now', 'action required', 'action needed',
      'time sensitive', 'time-sensitive', 'expires today', 'expiring today',
      'critical', 'emergency', 'emergencies', 'asap', 'rush', 'hurry'
    ];
    this.importantKeywords = [
      'important', 'priority', 'attention', 'required', 'must', 'need', 'needed',
      'please respond', 'please reply', 'response needed', 'reply needed',
      'confirmation required', 'verification needed', 'approval needed'
    ];
  }

  classifyEmail(email) {
    const from = email.from?.toLowerCase() || '';
    const subject = email.subject?.toLowerCase() || '';
    const emailDomain = from.split('@')[1]?.toLowerCase() || '';
    const senderName = from.split('@')[0]?.toLowerCase() || '';
    
    // Progressive classification: start with subject + sender only
    let bestCategory = 'other';
    let bestScore = 0;
    let priority = 1;
    let isNewsletter = false;
    const CONFIDENCE_THRESHOLD = 8; // Stop if we get this score or higher

    // Quick checks using only subject + sender (no body needed)
    // Check for non-human emails FIRST (no-reply, bots, automated)
    if (this.isNonHumanEmailQuick(from, subject)) {
      return {
        category: 'other',
        priority: 1,
        isNewsletter: false,
        confidence: 20,
        isNonHuman: true
      };
    }

    // Check for auth codes (subject only)
    if (/\b\d{4,8}\b/.test(subject) && (subject.includes('code') || subject.includes('verify'))) {
      return {
        category: 'auth-codes',
        priority: 1,
        isNewsletter: false,
        confidence: 15
      };
    }

    // Check for newsletter patterns (subject + sender only)
    isNewsletter = this.isNewsletterQuick(from, subject);
    if (isNewsletter && !subject.includes('invoice') && !subject.includes('payment') && !subject.includes('receipt')) {
      return {
        category: 'promo',
        priority: 1,
        isNewsletter: true,
        confidence: 10
      };
    }

    // Try classification with subject + sender only (FAST PATH)
    const quickResult = this.classifyWithText(from, subject, '', emailDomain, senderName);
    if (quickResult.score >= CONFIDENCE_THRESHOLD) {
      bestCategory = quickResult.category;
      bestScore = quickResult.score;
      priority = quickResult.priority;
    } else {
      // Not confident enough, need to check body progressively
      const body = email.body?.toLowerCase() || '';
      const bodyLines = body.split('\n').filter(line => line.trim().length > 0);
      
      // Try with first line of body
      if (bodyLines.length > 0) {
        const firstLineResult = this.classifyWithText(from, subject, bodyLines[0], emailDomain, senderName);
        if (firstLineResult.score > bestScore) {
          bestCategory = firstLineResult.category;
          bestScore = firstLineResult.score;
          priority = firstLineResult.priority;
        }
      }
      
      // If still not confident, try with first 2 lines
      if (bestScore < CONFIDENCE_THRESHOLD && bodyLines.length > 1) {
        const twoLines = bodyLines.slice(0, 2).join(' ');
        const twoLinesResult = this.classifyWithText(from, subject, twoLines, emailDomain, senderName);
        if (twoLinesResult.score > bestScore) {
          bestCategory = twoLinesResult.category;
          bestScore = twoLinesResult.score;
          priority = twoLinesResult.priority;
        }
      }
      
      // If still not confident, try with first 3 lines
      if (bestScore < CONFIDENCE_THRESHOLD && bodyLines.length > 2) {
        const threeLines = bodyLines.slice(0, 3).join(' ');
        const threeLinesResult = this.classifyWithText(from, subject, threeLines, emailDomain, senderName);
        if (threeLinesResult.score > bestScore) {
          bestCategory = threeLinesResult.category;
          bestScore = threeLinesResult.score;
          priority = threeLinesResult.priority;
        }
      }
      
      // Last resort: use full body (but we try to avoid this)
      if (bestScore < 3 && body.length > 0) {
        const fullBodyResult = this.classifyWithText(from, subject, body, emailDomain, senderName);
        if (fullBodyResult.score > bestScore) {
          bestCategory = fullBodyResult.category;
          bestScore = fullBodyResult.score;
          priority = fullBodyResult.priority;
        }
      }
    }

    // Adjust priority based on urgency (subject only for speed)
    const subjectUrgent = this.urgentKeywords.some(kw => subject.includes(kw.toLowerCase()));
    const subjectImportant = this.importantKeywords.some(kw => subject.includes(kw.toLowerCase()));
    
    if (subjectUrgent) {
      priority = Math.min(5, priority + 2);
    } else if (subjectImportant) {
      priority = Math.min(5, priority + 1);
    }

    // Automated/non-human emails should always be priority 1 (low urgency for replies)
    if (email.isNonHuman || bestCategory === 'other') {
      priority = 1;
    } else {
      // Only boost priority if it's not "other" category
      if (email.unread) {
        priority = Math.min(5, priority + 0.5);
      }
      if (bestCategory === 'finance' && /\$[\d,]+\.?\d*/.test(subject)) {
        priority = Math.min(5, priority + 0.5);
      }
    }

    priority = this.adjustPriorityByHistory(email, priority);

    // Ensure non-human emails are always priority 1
    const finalPriority = (email.isNonHuman || bestCategory === 'other') 
      ? 1 
      : Math.max(1, Math.min(5, Math.round(priority)));
    
    return {
      category: bestCategory,
      priority: finalPriority,
      isNewsletter,
      confidence: bestScore,
      isNonHuman: email.isNonHuman || false
    };
  }

  // Fast classification using only provided text (subject + optional body lines)
  classifyWithText(from, subject, bodyText, emailDomain, senderName) {
    let bestCategory = 'other';
    let bestScore = 0;
    let priority = 1;
    const text = `${from} ${subject} ${bodyText}`;

    for (const [category, config] of Object.entries(this.categories)) {
      if (category === 'auth-codes' || category === 'promo') continue;
      
      let score = 0;

      // Check domains first (strongest signal, no body needed)
      if (config.domains && config.domains.length > 0) {
        const domainMatch = config.domains.some(d => {
          const lowerD = d.toLowerCase();
          return emailDomain.includes(lowerD) || emailDomain.endsWith('.' + lowerD) || emailDomain === lowerD;
        });
        if (domainMatch) {
          score += 10; // Domain match is very strong
        }
      }

      // Check keywords in subject (high weight, no body needed)
      if (config.keywords && Array.isArray(config.keywords) && config.keywords.length > 0) {
        const subjectMatches = config.keywords.filter(kw => 
          kw && typeof kw === 'string' && subject.includes(kw.toLowerCase())
        ).length;
        score += subjectMatches * 3; // Subject matches worth 3x

        // Check sender name
        const senderMatches = config.keywords.filter(kw => 
          kw && typeof kw === 'string' && senderName.includes(kw.toLowerCase())
        ).length;
        score += senderMatches * 2;

        // Only check body if provided
        if (bodyText) {
          const bodyMatches = config.keywords.filter(kw => 
            kw && typeof kw === 'string' && bodyText.includes(kw.toLowerCase())
          ).length;
          score += bodyMatches * 2;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
        priority = config.priority || 1;
      }
    }

    return { category: bestCategory, score: bestScore, priority };
  }

  // Quick non-human check using only sender and subject
  isNonHumanEmailQuick(from, subject) {
    const nonHumanPatterns = [
      'noreply', 'no-reply', 'donotreply', 'do not reply', 'do-not-reply',
      'no_reply', 'noreply@', 'no-reply@', 'donotreply@',
      'bot@', 'automation@', 'system@', 'mailer@', 'mailer-daemon',
      'postmaster@', 'mail delivery', 'automated', 'automatic'
    ];
    return nonHumanPatterns.some(pattern => from.includes(pattern) || subject.includes(pattern));
  }

  // Quick newsletter check using only sender and subject
  isNewsletterQuick(from, subject) {
    const newsletterIndicators = [
      'unsubscribe', 'newsletter', 'noreply', 'no-reply', 'donotreply',
      'mailing list', 'mailchimp', 'constant contact'
    ];
    return newsletterIndicators.some(indicator => from.includes(indicator) || subject.includes(indicator));
  }

  isNonHumanEmail(email) {
    // Use quick check first (subject + sender only)
    const from = email.from?.toLowerCase() || '';
    const subject = email.subject?.toLowerCase() || '';
    
    if (this.isNonHumanEmailQuick(from, subject)) {
      return true;
    }
    
    // If quick check doesn't catch it, check body (but only first line for efficiency)
    const body = email.body?.toLowerCase() || '';
    const firstLine = body.split('\n')[0] || '';
    
    const nonHumanPatterns = [
      'this is an automated', 'this email was sent automatically',
      'please do not reply', 'do not reply to this email',
      'delivery failure', 'delivery status', 'undeliverable', 'bounce',
      'out of office', 'out-of-office', 'automatic reply', 'auto-reply'
    ];
    
    if (nonHumanPatterns.some(pattern => firstLine.includes(pattern))) {
      return true;
    }
    
    // Check for automated domains
    const emailDomain = from.split('@')[1]?.toLowerCase() || '';
    const automatedDomains = [
      'mailchimp.com', 'constantcontact.com', 'sendgrid.net', 'mandrillapp.com',
      'amazonaws.com', 'salesforce.com', 'hubspot.com', 'marketo.com'
    ];
    
    return automatedDomains.some(domain => emailDomain.includes(domain));
  }

  isNewsletter(email) {
    // Use quick check (subject + sender only)
    const from = email.from?.toLowerCase() || '';
    const subject = email.subject?.toLowerCase() || '';
    return this.isNewsletterQuick(from, subject);
  }

  adjustPriorityByHistory(email, currentPriority) {
    // In a real implementation, this would check historical reply rates
    // For now, we'll keep the priority as is
    return currentPriority;
  }

  getPriorityColor(priority) {
    const colors = {
      5: '#FF0000', // Red - urgent
      4: '#FF8C00', // Orange - high
      3: '#FFD700', // Yellow - medium-high
      2: '#90EE90', // Light green - medium
      1: '#006400'  // Dark green - low
    };
    return colors[priority] || colors[1];
  }

  extractImportantInfo(email) {
    const info = {
      links: [],
      dates: [],
      money: [],
      tasks: []
    };

    const text = `${email.subject} ${email.body}`;

    // Extract links
    const linkRegex = /https?:\/\/[^\s]+/g;
    info.links = text.match(linkRegex) || [];

    // Extract dates
    const dateRegex = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/g;
    info.dates = text.match(dateRegex) || [];

    // Extract money amounts
    const moneyRegex = /\$[\d,]+\.?\d*/g;
    info.money = text.match(moneyRegex) || [];

    // Extract tasks (lines starting with -, *, or numbered)
    const taskRegex = /^[\s]*[-*•]\s+.+$/gm;
    info.tasks = (text.match(taskRegex) || []).slice(0, 5);

    return info;
  }

  checkDNDRules(email, dndRules) {
    if (!dndRules || dndRules.length === 0) return false;

    const from = email.from?.toLowerCase() || '';
    const subject = email.subject?.toLowerCase() || '';
    const text = `${from} ${subject}`;
    const now = new Date();
    const hour = now.getHours();

    for (const rule of dndRules) {
      if (!rule.enabled) continue;

      // Check time-based rules
      if (rule.timeStart && rule.timeEnd) {
        const start = parseInt(rule.timeStart);
        const end = parseInt(rule.timeEnd);
        if (hour >= start && hour < end) {
          // Check exceptions
          if (this.checkExceptions(email, rule.exceptions || [])) {
            continue; // Exception matched, don't apply DND
          }
          return true; // DND active
        }
      }

      // Check sender-based rules
      if (rule.senders && rule.senders.length > 0) {
        if (rule.senders.some(sender => from.includes(sender.toLowerCase()))) {
          if (this.checkExceptions(email, rule.exceptions || [])) {
            continue;
          }
          return true;
        }
      }
    }

    return false;
  }

  checkExceptions(email, exceptions) {
    if (!exceptions || exceptions.length === 0) return false;

    const subject = email.subject?.toLowerCase() || '';
    const body = email.body?.toLowerCase() || '';
    const text = `${subject} ${body}`;

    for (const exception of exceptions) {
      if (exception.type === 'keyword' && exception.value) {
        if (text.includes(exception.value.toLowerCase())) {
          return true;
        }
      } else if (exception.type === 'urgent' && exception.enabled) {
        if (this.urgentKeywords.some(kw => text.includes(kw))) {
          return true;
        }
      } else if (exception.type === 'deadline' && exception.enabled) {
        const deadlineRegex = /\bdeadline\b.*?\b(\d{1,2}[\/\-]\d{1,2})/i;
        if (deadlineRegex.test(text)) {
          return true;
        }
      }
    }

    return false;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmailClassifier;
}


