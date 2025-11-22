// Popup script for AgileEmails
let classifier;

// Initialize classifier
try {
  classifier = new EmailClassifier();
} catch (e) {
  console.error('AgileEmails: Failed to initialize classifier', e);
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  try {
    loadSettings();
    setupTabs();
    loadEmailQueue();
    
    const refreshBtn = document.getElementById('refreshQueue');
    const settingsBtn = document.getElementById('settingsBtn');
    const upgradeBtn = document.getElementById('upgradeBtn');
    const priorityFilter = document.getElementById('priorityFilter');
    
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadEmailQueue);
    }
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
    }
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
    }
    if (priorityFilter) {
      priorityFilter.addEventListener('change', loadEmailQueue);
    }
  } catch (error) {
    console.error('AgileEmails: Error initializing popup', error);
  }
});

function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      // Remove active class from all
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      // Add active to clicked tab
      btn.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');

      // Load appropriate emails
      if (targetTab === 'queue') {
        loadEmailQueue();
      } else if (targetTab === 'missed') {
        loadMissedEmails();
      } else if (targetTab === 'today') {
        loadTodayEmails();
      } else if (targetTab === 'non-important') {
        loadNonImportantEmails();
      }
    });
  });
}

function loadSettings() {
  chrome.storage.local.get(['pricingTier', 'categories'], (data) => {
    try {
      const tier = data.pricingTier || 'free';
      const badge = document.getElementById('pricingBadge');
      if (badge) {
        badge.textContent = tier.toUpperCase();
        badge.className = `pricing-badge ${tier}`;
      }
    } catch (error) {
      console.error('AgileEmails: Error loading settings', error);
    }
  });
}

function loadEmailQueue() {
  const priorityFilter = document.getElementById('priorityFilter');
  const queueList = document.getElementById('queueList');
  
  if (!queueList) return;
  
  queueList.innerHTML = '<div class="loading">Loading reply queue...</div>';

  chrome.storage.local.get(['emailData', 'categories'], (data) => {
    try {
      const filterValue = priorityFilter ? priorityFilter.value : 'all';
      const emails = (data.emailData || []).filter(email => {
        if (!email.priority) return false;
        
        // Exclude "other" category emails and non-human emails from reply queue
        if (email.category === 'other' || email.isNonHuman) {
          return false;
        }
        
        // Filter by priority
        if (filterValue !== 'all') {
          return email.priority === parseInt(filterValue);
        } else {
          return email.priority >= 4;
        }
      });

      // Sort by priority (descending), then by date
      emails.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return (b.processedAt || 0) - (a.processedAt || 0);
      });

      if (emails.length === 0) {
        queueList.innerHTML = '<div class="empty-state">No emails in queue</div>';
        return;
      }

      queueList.innerHTML = emails.map(email => createEmailCard(email, data.categories)).join('');
      
      // Add click handlers
      queueList.querySelectorAll('.email-card').forEach(card => {
        card.addEventListener('click', () => {
          chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: 'highlightEmail',
                emailId: card.dataset.emailId
              }, (response) => {
                if (chrome.runtime.lastError) {
                  console.debug('AgileEmails: Could not highlight email', chrome.runtime.lastError);
                }
              });
            }
          });
        });
      });
    } catch (error) {
      console.error('AgileEmails: Error loading email queue', error);
      queueList.innerHTML = '<div class="empty-state">Error loading emails</div>';
    }
  });
}

function loadMissedEmails() {
  const missedList = document.getElementById('missedList');
  if (!missedList) return;
  
  missedList.innerHTML = '<div class="loading">Loading missed emails...</div>';

  chrome.storage.local.get(['emailData', 'categories'], (data) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const emails = (data.emailData || []).filter(email => {
        if (!email.date) return false;
        // Exclude "other" category and non-human emails
        if (email.category === 'other' || email.isNonHuman) return false;
        
        try {
          const emailDate = new Date(email.date);
          if (isNaN(emailDate.getTime())) return false;
          emailDate.setHours(0, 0, 0, 0);
          return emailDate < today && email.unread && email.priority >= 3;
        } catch (e) {
          return false;
        }
      });

      emails.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return (b.processedAt || 0) - (a.processedAt || 0);
      });

      if (emails.length === 0) {
        missedList.innerHTML = '<div class="empty-state">No missed emails</div>';
        return;
      }

      missedList.innerHTML = emails.map(email => createEmailCard(email, data.categories)).join('');
    } catch (error) {
      console.error('AgileEmails: Error loading missed emails', error);
      missedList.innerHTML = '<div class="empty-state">Error loading emails</div>';
    }
  });
}

function loadTodayEmails() {
  const todayList = document.getElementById('todayList');
  if (!todayList) return;
  
  todayList.innerHTML = '<div class="loading">Loading today\'s emails...</div>';

  chrome.storage.local.get(['emailData', 'categories'], (data) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const emails = (data.emailData || []).filter(email => {
        if (!email.date) return false;
        // Exclude "other" category and non-human emails
        if (email.category === 'other' || email.isNonHuman) return false;
        
        try {
          const emailDate = new Date(email.date);
          if (isNaN(emailDate.getTime())) return false;
          emailDate.setHours(0, 0, 0, 0);
          return emailDate.getTime() === today.getTime();
        } catch (e) {
          return false;
        }
      });

      emails.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return (b.processedAt || 0) - (a.processedAt || 0);
      });

      if (emails.length === 0) {
        todayList.innerHTML = '<div class="empty-state">No emails today</div>';
        return;
      }

      todayList.innerHTML = emails.map(email => createEmailCard(email, data.categories)).join('');
    } catch (error) {
      console.error('AgileEmails: Error loading today\'s emails', error);
      todayList.innerHTML = '<div class="empty-state">Error loading emails</div>';
    }
  });
}

function loadNonImportantEmails() {
  const nonImportantList = document.getElementById('nonImportantList');
  if (!nonImportantList) return;
  
  nonImportantList.innerHTML = '<div class="loading">Loading non-important emails...</div>';

  chrome.storage.local.get(['emailData', 'categories'], (data) => {
    try {
      const emails = (data.emailData || []).filter(email => {
        // Include low priority emails (1-3) OR "other" category emails OR non-human emails
        return (email.priority && email.priority <= 3) || 
               email.category === 'other' || 
               email.isNonHuman;
      });

      emails.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return (b.processedAt || 0) - (a.processedAt || 0);
      });

      if (emails.length === 0) {
        nonImportantList.innerHTML = '<div class="empty-state">No non-important emails</div>';
        return;
      }

      nonImportantList.innerHTML = emails.map(email => createEmailCard(email, data.categories)).join('');
    } catch (error) {
      console.error('AgileEmails: Error loading non-important emails', error);
      nonImportantList.innerHTML = '<div class="empty-state">Error loading emails</div>';
    }
  });
}

function createEmailCard(email, categories) {
  try {
    if (!classifier) {
      console.error('AgileEmails: Classifier not available');
      return '';
    }
    
    const priority = email.priority || 1;
    const priorityColor = classifier.getPriorityColor(priority);
    const categoryColor = categories?.[email.category]?.color || '#808080';
    const categoryName = email.category ? email.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'OTHER';

    return `
      <div class="email-card" data-email-id="${escapeHtml(email.id || '')}" data-priority="${priority}">
        <div class="email-header">
          <div class="priority-indicator" style="background-color: ${priorityColor}"></div>
          <div class="email-info">
            <div class="email-subject">${escapeHtml(email.subject || 'No subject')}</div>
            <div class="email-from">${escapeHtml(email.from || 'Unknown sender')}</div>
          </div>
          <div class="email-badge" style="background-color: ${categoryColor}">${escapeHtml(categoryName)}</div>
        </div>
        ${email.importantInfo && (email.importantInfo.links?.length > 0 || email.importantInfo.dates?.length > 0 || email.importantInfo.money?.length > 0) ? `
          <div class="important-info">
            ${email.importantInfo.dates?.length > 0 ? `<div class="info-item">📅 ${escapeHtml(email.importantInfo.dates.slice(0, 2).join(', '))}</div>` : ''}
            ${email.importantInfo.money?.length > 0 ? `<div class="info-item">💰 ${escapeHtml(email.importantInfo.money.slice(0, 2).join(', '))}</div>` : ''}
          </div>
        ` : ''}
        <div class="email-footer">
          <span class="priority-label">Priority ${priority}/5</span>
          ${email.isNewsletter ? '<span class="newsletter-badge">📧 Newsletter</span>' : ''}
          ${email.isDND ? '<span class="dnd-badge">🔕 DND</span>' : ''}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('AgileEmails: Error creating email card', error);
    return '';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


