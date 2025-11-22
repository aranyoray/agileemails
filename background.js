// ===============================
// Background Service Worker (MV3)
// AgileEmails – Stable Version
// ===============================

// Create main periodic alarm safely in MV3
async function scheduleProcessEmailsAlarm() {
  try {
    await chrome.alarms.clear('processEmails');
    await chrome.alarms.create('processEmails', { periodInMinutes: 15 });
  } catch (err) {
    console.error('Error scheduling processEmails alarm:', err);
  }
}

// On install: initialize storage + create alarms
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    categories: {
      'school': { enabled: true, color: '#4A90E2', autoDelete: null },
      'work-current': { enabled: true, color: '#E24A4A', autoDelete: null },
      'work-opportunities': { enabled: true, color: '#E2A44A', autoDelete: null },
      'finance': { enabled: true, color: '#4AE24A', autoDelete: null },
      'personal': { enabled: true, color: '#E24AE2', autoDelete: null },
      'auth-codes': { enabled: true, color: '#A4A4A4', autoDelete: 1 },
      'promo': { enabled: true, color: '#FFB84D', autoDelete: 1 },
      'other': { enabled: true, color: '#808080', autoDelete: null }
    },
    dndRules: [],
    pricingTier: 'free',
    settings: {
      contextWindow: 7, // days
      autoDeleteOldEmails: true,
      autoDeleteThresholds: {
        '3months': false,
        '6months': false,
        '1year': true
      }
    }
  });

  await scheduleProcessEmailsAlarm();
});

// On Chrome startup, recreate alarms (MV3-safe)
chrome.runtime.onStartup.addListener(async () => {
  await scheduleProcessEmailsAlarm();
});

// ===============================
// ALARM HANDLING
// ===============================
chrome.alarms.onAlarm.addListener((alarm) => {
  try {
    if (alarm?.name === 'processEmails') {
      processEmails();
    } else if (alarm?.name?.startsWith('autoDelete-')) {
      handleAutoDelete(alarm.name);
    }
  } catch (err) {
    console.error('Alarm processing error:', err);
  }
});

// ===============================
// PROCESS EMAILS (CONTENT SCRIPT)
// ===============================
async function processEmails() {
  chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { action: 'processEmails' });
    }
  });
}

function handleAutoDelete(alarmName) {
  const category = alarmName.replace('autoDelete-', '');

  chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { action: 'autoDelete', category });
    }
  });
}

// ===============================
// MESSAGE HANDLING
// ===============================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // Return settings to content script
  if (request.action === 'getSettings') {
    chrome.storage.local.get(
      ['categories', 'dndRules', 'settings', 'pricingTier'],
      (data) => sendResponse(data)
    );
    return true; // async response
  }

  // Save email data
  if (request.action === 'saveEmailData') {
    chrome.storage.local.get(['emailData'], (data) => {
      const emailData = data.emailData || [];
      emailData.push(request.emailData);

      chrome.storage.local.set(
        { emailData: emailData.slice(-1000) }, // keep last 1000
        () => sendResponse({ success: true })
      );
    });

    return true; // async response
  }
});
