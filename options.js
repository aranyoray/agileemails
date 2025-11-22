// Options page script
let classifier;

// Initialize classifier
try {
  classifier = new EmailClassifier();
} catch (e) {
  console.error('AgileEmails: Failed to initialize classifier', e);
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    setupTabs();
    loadSettings();
    setupEventListeners();
  } catch (error) {
    console.error('AgileEmails: Error initializing options page', error);
  }
});

function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');

      if (targetTab === 'categories') {
        loadCategories();
      } else if (targetTab === 'dnd') {
        loadDNDRules();
      } else if (targetTab === 'auto-delete') {
        loadAutoDeleteSettings();
      } else if (targetTab === 'general') {
        loadGeneralSettings();
      }
    });
  });
}

function setupEventListeners() {
  try {
    // Pricing
    document.querySelectorAll('[data-select]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tier = e.currentTarget.getAttribute('data-select') || e.target.closest('[data-select]')?.getAttribute('data-select');
        if (tier) {
          chrome.storage.local.set({ pricingTier: tier }, () => {
            if (chrome.runtime.lastError) {
              console.error('AgileEmails: Error saving pricing tier', chrome.runtime.lastError);
              alert('Error saving plan. Please try again.');
            } else {
              updatePricingUI();
              alert(`Plan changed to ${tier.toUpperCase()}`);
            }
          });
        }
      });
    });

    // Categories
    const saveCategoriesBtn = document.getElementById('saveCategories');
    const addDNDRuleBtn = document.getElementById('addDNDRule');
    const saveDNDRulesBtn = document.getElementById('saveDNDRules');
    const saveAutoDeleteBtn = document.getElementById('saveAutoDelete');
    const saveGeneralBtn = document.getElementById('saveGeneral');
    
    if (saveCategoriesBtn) {
      saveCategoriesBtn.addEventListener('click', saveCategories);
    }
    if (addDNDRuleBtn) {
      addDNDRuleBtn.addEventListener('click', addDNDRule);
    }
    if (saveDNDRulesBtn) {
      saveDNDRulesBtn.addEventListener('click', saveDNDRules);
    }
    if (saveAutoDeleteBtn) {
      saveAutoDeleteBtn.addEventListener('click', saveAutoDelete);
    }
    if (saveGeneralBtn) {
      saveGeneralBtn.addEventListener('click', saveGeneral);
    }
  } catch (error) {
    console.error('AgileEmails: Error setting up event listeners', error);
  }
}

function loadSettings() {
  updatePricingUI();
  loadCategories();
  loadDNDRules();
  loadAutoDeleteSettings();
  loadGeneralSettings();
}

function updatePricingUI() {
  chrome.storage.local.get(['pricingTier'], (data) => {
    const tier = data.pricingTier || 'free';
    document.querySelectorAll('.pricing-card').forEach(card => {
      const cardTier = card.getAttribute('data-tier');
      const btn = card.querySelector('.select-btn');
      
      if (cardTier === tier) {
        btn.textContent = 'Current Plan';
        btn.disabled = true;
      } else {
        btn.textContent = 'Select Plan';
        btn.disabled = false;
      }
    });
  });
}

function loadCategories() {
  chrome.storage.local.get(['categories'], (data) => {
    const categories = data.categories || {};
    const categoryList = document.getElementById('categoryList');
    
    categoryList.innerHTML = Object.entries(categories).map(([key, value]) => {
      const days = ['', '1 day', '7 days', '30 days'];
      return `
        <div class="category-item">
          <div class="category-header">
            <input type="color" value="${value.color}" data-category="${key}" class="color-picker">
            <label>
              <input type="checkbox" ${value.enabled ? 'checked' : ''} data-category="${key}" class="category-enabled">
              <span class="category-name">${key.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
            </label>
          </div>
          <div class="category-actions">
            <label>Auto-delete after:</label>
            <select data-category="${key}" class="auto-delete-select">
              <option value="">Never</option>
              <option value="1" ${value.autoDelete === 1 ? 'selected' : ''}>1 day</option>
              <option value="7" ${value.autoDelete === 7 ? 'selected' : ''}>7 days</option>
              <option value="30" ${value.autoDelete === 30 ? 'selected' : ''}>30 days</option>
            </select>
          </div>
        </div>
      `;
    }).join('');
  });
}

function saveCategories() {
  const categories = {};
  const categoryItems = document.querySelectorAll('.category-item');
  
  categoryItems.forEach(item => {
    const category = item.querySelector('.category-enabled').getAttribute('data-category');
    const enabled = item.querySelector('.category-enabled').checked;
    const color = item.querySelector('.color-picker').value;
    const autoDelete = item.querySelector('.auto-delete-select').value;
    
    categories[category] = {
      enabled,
      color,
      autoDelete: autoDelete ? parseInt(autoDelete) : null
    };
  });
  
  chrome.storage.local.set({ categories }, () => {
    alert('Categories saved successfully!');
  });
}

function loadDNDRules() {
  chrome.storage.local.get(['dndRules'], (data) => {
    const rules = data.dndRules || [];
    const container = document.getElementById('dndRules');
    
    if (rules.length === 0) {
      container.innerHTML = '<p class="empty-state">No DND rules configured. Click "Add DND Rule" to create one.</p>';
    } else {
      container.innerHTML = rules.map((rule, index) => createDNDRuleHTML(rule, index)).join('');
    }
    
    // Add delete handlers
    container.querySelectorAll('.delete-rule').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.getAttribute('data-index'));
        rules.splice(index, 1);
        chrome.storage.local.set({ dndRules: rules }, () => {
          loadDNDRules();
        });
      });
    });
  });
}

function createDNDRuleHTML(rule, index) {
  return `
    <div class="dnd-rule">
      <div class="rule-header">
        <h3>Rule ${index + 1}</h3>
        <button class="delete-rule" data-index="${index}">Delete</button>
      </div>
      <div class="rule-content">
        <label>
          <input type="checkbox" class="rule-enabled" ${rule.enabled ? 'checked' : ''} data-index="${index}">
          Enable this rule
        </label>
        <div class="rule-field">
          <label>Time Range (24-hour format):</label>
          <input type="number" min="0" max="23" value="${rule.timeStart || ''}" placeholder="Start hour" class="time-start" data-index="${index}">
          to
          <input type="number" min="0" max="23" value="${rule.timeEnd || ''}" placeholder="End hour" class="time-end" data-index="${index}">
        </div>
        <div class="rule-field">
          <label>Senders (comma-separated emails or domains):</label>
          <input type="text" value="${(rule.senders || []).join(', ')}" placeholder="example@work.com, noreply@company.com" class="rule-senders" data-index="${index}">
        </div>
        <div class="rule-field">
          <h4>Exceptions (emails that bypass DND):</h4>
          <label>
            <input type="checkbox" class="exception-urgent" ${rule.exceptions?.some(e => e.type === 'urgent') ? 'checked' : ''} data-index="${index}">
            Urgent keywords
          </label>
          <label>
            <input type="checkbox" class="exception-deadline" ${rule.exceptions?.some(e => e.type === 'deadline') ? 'checked' : ''} data-index="${index}">
            Deadline mentions
          </label>
          <div class="rule-field">
            <label>Custom keywords (comma-separated):</label>
            <input type="text" value="${(rule.exceptions?.filter(e => e.type === 'keyword').map(e => e.value) || []).join(', ')}" placeholder="urgent, deadline, important" class="exception-keywords" data-index="${index}">
          </div>
        </div>
      </div>
    </div>
  `;
}

function addDNDRule() {
  chrome.storage.local.get(['dndRules'], (data) => {
    const rules = data.dndRules || [];
    rules.push({
      enabled: true,
      timeStart: null,
      timeEnd: null,
      senders: [],
      exceptions: []
    });
    chrome.storage.local.set({ dndRules: rules }, () => {
      loadDNDRules();
    });
  });
}

function saveDNDRules() {
  const rules = [];
  const ruleElements = document.querySelectorAll('.dnd-rule');
  
  ruleElements.forEach((element, index) => {
    const enabled = element.querySelector('.rule-enabled').checked;
    const timeStart = element.querySelector('.time-start').value;
    const timeEnd = element.querySelector('.time-end').value;
    const sendersText = element.querySelector('.rule-senders').value;
    const senders = sendersText ? sendersText.split(',').map(s => s.trim()).filter(s => s) : [];
    
    const exceptions = [];
    if (element.querySelector('.exception-urgent').checked) {
      exceptions.push({ type: 'urgent', enabled: true });
    }
    if (element.querySelector('.exception-deadline').checked) {
      exceptions.push({ type: 'deadline', enabled: true });
    }
    const keywordsText = element.querySelector('.exception-keywords').value;
    if (keywordsText) {
      keywordsText.split(',').forEach(kw => {
        if (kw.trim()) {
          exceptions.push({ type: 'keyword', value: kw.trim() });
        }
      });
    }
    
    rules.push({
      enabled,
      timeStart: timeStart ? parseInt(timeStart) : null,
      timeEnd: timeEnd ? parseInt(timeEnd) : null,
      senders,
      exceptions
    });
  });
  
  chrome.storage.local.set({ dndRules: rules }, () => {
    alert('DND rules saved successfully!');
  });
}

function loadAutoDeleteSettings() {
  chrome.storage.local.get(['settings'], (data) => {
    const settings = data.settings || {};
    document.getElementById('autoDeleteEnabled').checked = settings.autoDeleteOldEmails || false;
    
    const thresholds = settings.autoDeleteThresholds || {};
    document.getElementById('delete3Months').checked = thresholds['3months'] || false;
    document.getElementById('delete6Months').checked = thresholds['6months'] || false;
    document.getElementById('delete1Year').checked = thresholds['1year'] || false;
  });
}

function saveAutoDelete() {
  const settings = {
    autoDeleteOldEmails: document.getElementById('autoDeleteEnabled').checked,
    autoDeleteThresholds: {
      '3months': document.getElementById('delete3Months').checked,
      '6months': document.getElementById('delete6Months').checked,
      '1year': document.getElementById('delete1Year').checked
    }
  };
  
  chrome.storage.local.get(['settings'], (data) => {
    const currentSettings = data.settings || {};
    chrome.storage.local.set({
      settings: { ...currentSettings, ...settings }
    }, () => {
      alert('Auto-delete settings saved!');
    });
  });
}

function loadGeneralSettings() {
  chrome.storage.local.get(['settings'], (data) => {
    const settings = data.settings || {};
    document.getElementById('contextWindow').value = settings.contextWindow || 7;
    document.getElementById('showPriorityColors').checked = settings.showPriorityColors !== false;
    document.getElementById('showCategoryBadges').checked = settings.showCategoryBadges !== false;
    document.getElementById('enableThreadSummary').checked = settings.enableThreadSummary !== false;
    document.getElementById('reorderByPriority').checked = settings.reorderByPriority === true; // Default to false
  });
}

function saveGeneral() {
  chrome.storage.local.get(['settings', 'pricingTier'], (data) => {
    const tier = data.pricingTier || 'free';
    const contextWindow = parseInt(document.getElementById('contextWindow').value);
    
    // Limit context window for free tier
    const finalContextWindow = tier === 'free' ? Math.min(7, contextWindow) : contextWindow;
    
    const settings = {
      ...data.settings,
      contextWindow: finalContextWindow,
      showPriorityColors: document.getElementById('showPriorityColors').checked,
      showCategoryBadges: document.getElementById('showCategoryBadges').checked,
      enableThreadSummary: document.getElementById('enableThreadSummary').checked,
      reorderByPriority: document.getElementById('reorderByPriority').checked
    };
    
    chrome.storage.local.set({ settings }, () => {
      alert('General settings saved!');
      if (tier === 'free' && contextWindow > 7) {
        alert('Free tier is limited to 7 days. Upgrade to Recommended or Ultra for longer context windows.');
      }
    });
  });
}


