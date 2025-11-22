// Fast Email Classification - Optimized batch processing
// Uses indexed caching, chunked processing, and Gmail tab support

class FastClassifier {
  constructor() {
    this.classifier = new EmailClassifier();
    this.emailIndex = new Map(); // Indexed by ID for O(1) lookup
    this.emailsByTab = new Map(); // Indexed by Gmail tab
    this.currentTab = 'all';
    this.sortBy = 'priority';
    this.sortDesc = true;
    this.categoryFilter = 'all';
    this.priorityFilter = 'all';
    this.isProcessing = false;
    this.BATCH_SIZE = 50; // Process in chunks

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadEmailsFromStorage();
  }

  setupEventListeners() {
    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentTab = e.target.dataset.tab;
        this.renderEmails();
      });
    });

    // Classify button
    document.getElementById('classifyBtn').addEventListener('click', () => {
      this.classifyAllEmails();
    });

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.loadEmailsFromStorage();
    });

    // Filters
    document.getElementById('categoryFilter').addEventListener('change', (e) => {
      this.categoryFilter = e.target.value;
      this.renderEmails();
    });

    document.getElementById('priorityFilter').addEventListener('change', (e) => {
      this.priorityFilter = e.target.value;
      this.renderEmails();
    });

    // Sort toggle
    document.getElementById('sortToggle').addEventListener('click', () => {
      if (this.sortBy === 'priority') {
        this.sortBy = 'date';
        document.getElementById('sortToggle').textContent = 'Sort: Date';
      } else {
        this.sortBy = 'priority';
        document.getElementById('sortToggle').textContent = 'Sort: Priority';
      }
      this.renderEmails();
    });
  }

  async loadEmailsFromStorage() {
    this.showStatus('Loading emails from storage...');

    try {
      const data = await this.getStorage(['classifiedEmails', 'categories', 'dndRules', 'settings']);
      const emails = data.classifiedEmails || [];

      // Index emails for fast lookup
      this.emailIndex.clear();
      this.emailsByTab.clear();

      // Initialize tab maps
      ['all', 'primary', 'social', 'promotions', 'updates', 'forums'].forEach(tab => {
        this.emailsByTab.set(tab, []);
      });

      const startTime = performance.now();

      emails.forEach(email => {
        // Detect Gmail tab from email properties
        const gmailTab = this.detectGmailTab(email);
        email.gmailTab = gmailTab;

        // Add to index
        this.emailIndex.set(email.id, email);

        // Add to tab collection
        this.emailsByTab.get('all').push(email);
        if (this.emailsByTab.has(gmailTab)) {
          this.emailsByTab.get(gmailTab).push(email);
        }
      });

      const elapsed = performance.now() - startTime;

      this.hideStatus();
      this.updateStats(elapsed);
      this.renderEmails();

    } catch (error) {
      console.error('Error loading emails:', error);
      this.showStatus('Error loading emails: ' + error.message);
    }
  }

  // Detect which Gmail tab an email belongs to
  detectGmailTab(email) {
    const from = (email.from || '').toLowerCase();
    const subject = (email.subject || '').toLowerCase();
    const category = email.category || '';

    // Social tab indicators
    const socialDomains = ['facebook', 'twitter', 'linkedin', 'instagram', 'pinterest',
                          'snapchat', 'tiktok', 'youtube', 'reddit', 'discord', 'slack',
                          'facebookmail', 'twittermail'];
    const socialKeywords = ['followed you', 'mentioned you', 'tagged you', 'shared',
                           'commented', 'liked', 'friend request', 'connection request',
                           'invite', 'joined', 'posted'];

    if (socialDomains.some(d => from.includes(d)) ||
        socialKeywords.some(k => subject.includes(k))) {
      return 'social';
    }

    // Promotions tab indicators
    const promoDomains = ['shopify', 'mailchimp', 'constantcontact', 'sendgrid',
                         'marketing', 'promo', 'deals', 'offers'];
    const promoKeywords = ['sale', 'discount', 'off', 'deal', 'offer', 'coupon',
                          'promo', 'save', 'limited time', 'exclusive', 'free shipping',
                          'buy now', 'shop now', 'order now'];

    if (category === 'newsletter' ||
        promoDomains.some(d => from.includes(d)) ||
        promoKeywords.some(k => subject.includes(k))) {
      return 'promotions';
    }

    // Updates tab indicators
    const updateKeywords = ['receipt', 'confirmation', 'invoice', 'statement',
                           'notification', 'alert', 'update', 'reminder', 'verify',
                           'code', 'otp', 'security', 'password', 'account'];
    const updateDomains = ['noreply', 'no-reply', 'notifications', 'alerts', 'updates'];

    if (category === 'auth' || category === 'finance' ||
        updateDomains.some(d => from.includes(d)) ||
        updateKeywords.some(k => subject.includes(k))) {
      return 'updates';
    }

    // Forums tab indicators
    const forumKeywords = ['digest', 'forum', 'community', 'group', 'mailing list',
                          'discussion', 'thread', 'reply to', 're:'];
    const forumDomains = ['groups.google', 'googlegroups', 'discourse', 'mailman'];

    if (forumDomains.some(d => from.includes(d)) ||
        forumKeywords.some(k => subject.includes(k))) {
      return 'forums';
    }

    // Default to primary
    return 'primary';
  }

  async classifyAllEmails() {
    if (this.isProcessing) return;

    this.isProcessing = true;
    const classifyBtn = document.getElementById('classifyBtn');
    classifyBtn.disabled = true;

    const emails = Array.from(this.emailIndex.values());
    const total = emails.length;

    if (total === 0) {
      this.showStatus('No emails to classify');
      setTimeout(() => this.hideStatus(), 2000);
      this.isProcessing = false;
      classifyBtn.disabled = false;
      return;
    }

    const startTime = performance.now();
    let processed = 0;

    this.showStatus(`Classifying ${total} emails...`, `0/${total}`);
    this.updateProgress(0);

    try {
      const data = await this.getStorage(['categories', 'dndRules', 'settings']);

      // Process in batches for better performance
      const batches = this.chunkArray(emails, this.BATCH_SIZE);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        // Process batch using microtask queue for better responsiveness
        await this.processBatch(batch, data);

        processed += batch.length;
        const progress = (processed / total) * 100;
        this.updateProgress(progress);
        this.updateBatchInfo(`${processed}/${total}`);

        // Yield to UI
        await this.yieldToUI();
      }

      const elapsed = performance.now() - startTime;

      // Re-index by tab after classification
      this.reindexByTab();

      // Save back to storage
      await this.saveToStorage();

      this.hideStatus();
      this.updateStats(elapsed);
      this.renderEmails();

    } catch (error) {
      console.error('Error classifying emails:', error);
      this.showStatus('Error: ' + error.message);
    } finally {
      this.isProcessing = false;
      classifyBtn.disabled = false;
      this.updateProgress(100);
    }
  }

  async processBatch(emails, settings) {
    return new Promise(resolve => {
      // Use requestIdleCallback for non-blocking processing
      const processEmails = () => {
        emails.forEach(email => {
          // Skip if already has recent classification
          const needsClassification = !email.category ||
            !email.processedAt ||
            (Date.now() - email.processedAt > 3600000); // Re-classify if > 1 hour old

          if (needsClassification) {
            // Check for non-human first
            email.isNonHuman = this.classifier.isNonHumanEmail(email);

            // Classify
            const classification = this.classifier.classifyEmail(email);

            // Check DND
            const isDND = this.classifier.checkDNDRules(email, settings.dndRules || []);

            // Extract info
            const importantInfo = this.classifier.extractImportantInfo(email);

            // Update email object
            Object.assign(email, {
              ...classification,
              isDND,
              importantInfo,
              processedAt: Date.now()
            });

            // Update index
            this.emailIndex.set(email.id, email);
          }
        });
        resolve();
      };

      // Use requestIdleCallback if available, otherwise setTimeout
      if ('requestIdleCallback' in window) {
        requestIdleCallback(processEmails, { timeout: 100 });
      } else {
        setTimeout(processEmails, 0);
      }
    });
  }

  reindexByTab() {
    // Clear tab collections
    ['all', 'primary', 'social', 'promotions', 'updates', 'forums'].forEach(tab => {
      this.emailsByTab.set(tab, []);
    });

    // Re-index
    this.emailIndex.forEach(email => {
      email.gmailTab = this.detectGmailTab(email);
      this.emailsByTab.get('all').push(email);
      if (this.emailsByTab.has(email.gmailTab)) {
        this.emailsByTab.get(email.gmailTab).push(email);
      }
    });
  }

  async saveToStorage() {
    const emails = Array.from(this.emailIndex.values());
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ classifiedEmails: emails }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  renderEmails() {
    const container = document.getElementById('emailList');
    let emails = this.emailsByTab.get(this.currentTab) || [];

    // Apply filters
    if (this.categoryFilter !== 'all') {
      emails = emails.filter(e => e.category === this.categoryFilter);
    }
    if (this.priorityFilter !== 'all') {
      emails = emails.filter(e => e.priority === parseInt(this.priorityFilter));
    }

    // Sort
    emails = [...emails].sort((a, b) => {
      if (this.sortBy === 'priority') {
        return this.sortDesc ? b.priority - a.priority : a.priority - b.priority;
      } else {
        const dateA = a.processedAt || 0;
        const dateB = b.processedAt || 0;
        return this.sortDesc ? dateB - dateA : dateA - dateB;
      }
    });

    if (emails.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No emails found</h3>
          <p>Try changing the filters or Gmail tab selection.</p>
        </div>
      `;
      return;
    }

    // Render only visible emails (virtual scrolling could be added for large lists)
    const maxDisplay = 100;
    const displayEmails = emails.slice(0, maxDisplay);

    container.innerHTML = displayEmails.map(email => this.renderEmailItem(email)).join('');
  }

  renderEmailItem(email) {
    const priorityColors = {
      5: '#FF0000',
      4: '#FF8C00',
      3: '#FFD700',
      2: '#90EE90',
      1: '#006400'
    };

    const categoryColors = {
      'academics': '#4285f4',
      'work': '#ea4335',
      'jobs': '#fbbc04',
      'finance': '#34a853',
      'personal': '#9c27b0',
      'auth': '#607d8b',
      'newsletter': '#ff5722',
      'others': '#757575'
    };

    const priorityColor = priorityColors[email.priority] || priorityColors[1];
    const categoryColor = categoryColors[email.category] || categoryColors.others;
    const categoryName = (email.category || 'others').replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());

    return `
      <div class="email-item">
        <div class="priority-indicator priority-${email.priority}"></div>
        <div class="email-content">
          <div class="email-from">${this.escapeHtml(email.from || 'Unknown')}</div>
          <div class="email-subject">${this.escapeHtml(email.subject || 'No subject')}</div>
        </div>
        <div class="email-meta">
          <span class="gmail-tab-badge">${email.gmailTab || 'primary'}</span>
          <span class="category-badge" style="background-color: ${categoryColor}">${categoryName}</span>
          <span class="priority-badge" style="background-color: ${priorityColor}">P${email.priority}</span>
        </div>
      </div>
    `;
  }

  updateStats(processingTime) {
    const emails = this.emailsByTab.get('all') || [];
    const classified = emails.filter(e => e.category).length;
    const urgent = emails.filter(e => e.priority >= 4).length;

    document.getElementById('totalEmails').textContent = emails.length;
    document.getElementById('classifiedCount').textContent = classified;
    document.getElementById('urgentCount').textContent = urgent;
    document.getElementById('processingTime').textContent = Math.round(processingTime) + 'ms';
  }

  showStatus(message, batchInfo = '') {
    const statusEl = document.getElementById('statusMessage');
    const statusText = document.getElementById('statusText');
    const batchInfoEl = document.getElementById('batchInfo');

    statusEl.style.display = 'flex';
    statusText.textContent = message;
    batchInfoEl.textContent = batchInfo;
  }

  hideStatus() {
    document.getElementById('statusMessage').style.display = 'none';
  }

  updateBatchInfo(info) {
    document.getElementById('batchInfo').textContent = info;
  }

  updateProgress(percent) {
    document.getElementById('progressFill').style.width = percent + '%';
  }

  // Utility functions
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  yieldToUI() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  getStorage(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (data) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(data);
        }
      });
    });
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.fastClassifier = new FastClassifier();
});
