// Content script for Gmail integration
// Prevent multiple initializations
if (window.agileEmailsInitialized) {
  console.warn('AgileEmails: Script already initialized, skipping duplicate load');
  // Stop execution if already initialized
  throw new Error('AgileEmails already initialized');
}
window.agileEmailsInitialized = true;

let classifier;
let emailCache = new Map();
let processedEmails = new Set();
let processingTimeout = null;
let isProcessing = false;
let lastProcessTime = 0;
const MIN_PROCESS_INTERVAL = 3000; // Don't process more than once every 3 seconds

// Initialize classifier
try {
  classifier = new EmailClassifier();
} catch (e) {
  console.error('AgileEmails: Failed to initialize classifier', e);
}

let initCalled = false;

function init() {
  // Prevent multiple initializations
  if (initCalled) {
    console.warn('AgileEmails: init() already called, skipping');
    return;
  }
  initCalled = true;
  
  if (!classifier) {
    console.error('AgileEmails: Classifier not available');
    return;
  }
  
  // Wait for Gmail to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(processGmailPage, 2000);
    });
  } else {
    setTimeout(processGmailPage, 2000);
  }

  // Listen for Gmail navigation with debouncing and throttling
  const observer = new MutationObserver((mutations) => {
    // Only process if significant changes (new emails added, not just attribute changes)
    const hasSignificantChanges = mutations.some(mutation => 
      mutation.type === 'childList' && mutation.addedNodes.length > 0
    );
    
    if (!hasSignificantChanges) return;
    
    if (processingTimeout) {
      clearTimeout(processingTimeout);
    }
    
    // Throttle processing
    const now = Date.now();
    const timeSinceLastProcess = now - lastProcessTime;
    const delay = timeSinceLastProcess < MIN_PROCESS_INTERVAL 
      ? MIN_PROCESS_INTERVAL - timeSinceLastProcess 
      : 1000;
    
    processingTimeout = setTimeout(() => {
      if (!isProcessing) {
        processGmailPage();
      }
    }, delay);
  });

  // Only observe childList changes in the main email list area, not all mutations
  const mainArea = document.querySelector('div[role="main"]') || document.body;
  observer.observe(mainArea, {
    childList: true,
    subtree: false // Don't observe deep subtree changes
  });
  
  // Watch for overlay removal and re-apply them
  const overlayObserver = new MutationObserver((mutations) => {
    // Check if any of our overlays were removed
    let shouldReapply = false;
    mutations.forEach(mutation => {
      mutation.removedNodes.forEach(node => {
        if (node.nodeType === 1 && (node.classList?.contains('agileemails-overlay') || node.querySelector?.('.agileemails-overlay'))) {
          shouldReapply = true;
        }
      });
      // Also check if email rows lost their overlays
      if (mutation.type === 'childList' && mutation.target) {
        const emailRow = mutation.target.closest('tr[role="row"]');
        if (emailRow && !emailRow.querySelector('.agileemails-overlay')) {
          const emailId = emailRow.getAttribute('data-thread-perm-id') || 
                         emailRow.closest('[data-thread-perm-id]')?.getAttribute('data-thread-perm-id');
          if (emailId && emailCache.has(emailId)) {
            shouldReapply = true;
          }
        }
      }
    });
    
    if (shouldReapply && !isProcessing) {
      // Re-apply overlays that were removed
      setTimeout(() => {
        reapplyOverlays();
      }, 100);
    }
  });
  
  // Observe the email list area for overlay removals
  overlayObserver.observe(mainArea, {
    childList: true,
    subtree: true,
    attributes: false
  });
  
  // Aggressive overlay persistence using requestAnimationFrame
  let lastOverlayCheck = 0;
  const OVERLAY_CHECK_INTERVAL = 200; // Check every 200ms
  
  function persistentOverlayCheck() {
    const now = Date.now();
    if (now - lastOverlayCheck >= OVERLAY_CHECK_INTERVAL && !isProcessing) {
      lastOverlayCheck = now;
      reapplyOverlays();
    }
    requestAnimationFrame(persistentOverlayCheck);
  }
  
  // Start persistent checking
  requestAnimationFrame(persistentOverlayCheck);
  
  // Also check on scroll (immediate)
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    if (!isProcessing) {
      reapplyOverlays();
    }
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (!isProcessing) {
        reapplyOverlays();
      }
    }, 100);
  }, { passive: true });
  
  // Check on mouseover (immediate)
  const mainArea = document.querySelector('div[role="main"]') || document.body;
  mainArea.addEventListener('mouseover', (e) => {
    const emailRow = e.target.closest('tr[role="row"]');
    if (emailRow && !emailRow.querySelector('.agileemails-overlay')) {
      const emailId = emailRow.getAttribute('data-agileemails-id') ||
                     emailRow.getAttribute('data-thread-perm-id');
      if (emailId && emailCache.has(emailId)) {
        if (!isProcessing) {
          chrome.storage.local.get(['categories', 'dndRules', 'settings', 'pricingTier'], (data) => {
            applyOverlayToElement(emailRow, emailCache.get(emailId), data);
          });
        }
      }
    }
  }, { passive: true });
  
  // Check on any DOM mutation in email area
  const emailAreaObserver = new MutationObserver(() => {
    if (!isProcessing) {
      reapplyOverlays();
    }
  });
  
  if (mainArea) {
    emailAreaObserver.observe(mainArea, {
      childList: true,
      subtree: true
    });
  }
}

async function processGmailPage() {
  if (isProcessing) return; // Prevent concurrent processing
  
  isProcessing = true;
  lastProcessTime = Date.now();
  
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(['categories', 'dndRules', 'settings', 'pricingTier'], resolve);
    });
    
    const emails = extractEmails();
    const processPromises = emails.map(email => {
      if (!processedEmails.has(email.id)) {
        processedEmails.add(email.id);
        return processEmail(email, data);
      }
      return Promise.resolve();
    });
    
    await Promise.all(processPromises);
    applyVisualIndicators(emails, data);
  } catch (error) {
    console.error('AgileEmails: Error processing Gmail page', error);
  } finally {
    isProcessing = false;
  }
}

function extractEmails() {
  const emails = [];
  
  // More robust Gmail thread selectors - try multiple patterns
  // Only get emails that are currently visible on screen
  let threadElements = document.querySelectorAll('div[role="main"] tr[role="row"]:not([style*="display: none"])');
  
  // Fallback selectors if primary doesn't work
  if (threadElements.length === 0) {
    threadElements = document.querySelectorAll('table tbody tr[role="row"]:not([style*="display: none"])');
  }
  if (threadElements.length === 0) {
    threadElements = document.querySelectorAll('div[data-thread-perm-id]:not([style*="display: none"])');
  }
  
  // Filter to only visible elements (check if element is in viewport or parent is visible)
  const visibleElements = Array.from(threadElements).filter(element => {
    // Check if element or its parent is hidden
    if (element.offsetParent === null && getComputedStyle(element).display === 'none') {
      return false;
    }
    // Check if element is within viewport (rough check)
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  
  visibleElements.forEach((element, index) => {
    try {
      // Try multiple selector patterns for subject
      let subjectEl = element.querySelector('span.bog');
      if (!subjectEl) {
        subjectEl = element.querySelector('[data-thread-perm-id] span');
      }
      if (!subjectEl) {
        subjectEl = element.querySelector('.bog');
      }
      
      // Try multiple selector patterns for sender
      let senderEl = element.querySelector('span.yW span[email]');
      if (!senderEl) {
        senderEl = element.querySelector('span[email]');
      }
      if (!senderEl) {
        senderEl = element.querySelector('.yW span');
      }
      if (!senderEl) {
        senderEl = element.querySelector('[email]');
      }
      
      // Try multiple selector patterns for date
      let dateEl = element.querySelector('span[title]');
      if (!dateEl) {
        dateEl = element.querySelector('.bqe');
      }
      
      // Try to get preview/snippet text as body
      let bodyText = '';
      const snippetEl = element.querySelector('.bog + span, .y2, .yP');
      if (snippetEl) {
        bodyText = snippetEl.textContent || '';
      }
      
      // Check for unread
      const unread = element.classList.contains('zE') || 
                     element.querySelector('.zE') !== null ||
                     element.getAttribute('aria-label')?.includes('Unread') ||
                     false;
      
      if (subjectEl && senderEl) {
        const senderEmail = senderEl.getAttribute('email') || senderEl.textContent || '';
        const subject = subjectEl.textContent || '';
        const date = dateEl ? (dateEl.getAttribute('title') || dateEl.textContent) : null;
        
        // Generate more reliable ID using thread ID if available
        const threadId = element.getAttribute('data-thread-perm-id') || 
                        element.closest('[data-thread-perm-id]')?.getAttribute('data-thread-perm-id') ||
                        `${senderEmail}-${subject}-${index}`;
        
        const email = {
          id: threadId,
          subject: subject.trim(),
          from: senderEmail.trim(),
          date: date,
          unread: unread,
          element: element,
          body: bodyText.trim() // Use preview text as body
        };
        emails.push(email);
      }
    } catch (e) {
      console.error('AgileEmails: Error extracting email:', e);
    }
  });
  
  return emails;
}

async function processEmail(email, settings) {
  try {
    if (!classifier) {
      console.error('AgileEmails: Classifier not available');
      return;
    }
    
    // Check if email is non-human FIRST (before classification)
    const isNonHuman = classifier.isNonHumanEmail(email);
    email.isNonHuman = isNonHuman; // Add to email object for classifier
    
    // Classify email
    const classification = classifier.classifyEmail(email);
    
    // Check DND rules
    const isDND = classifier.checkDNDRules(email, settings.dndRules || []);
    
    // Extract important info
    const importantInfo = classifier.extractImportantInfo(email);
    
    // Ensure non-human emails are always priority 1 (low urgency for replies)
    let finalPriority = classification.priority;
    if (isNonHuman || classification.isNonHuman || classification.category === 'other') {
      finalPriority = 1;
    }
    
    const emailData = {
      ...email,
      ...classification,
      priority: finalPriority, // Override with corrected priority
      isNonHuman: isNonHuman || classification.isNonHuman || false,
      isDND,
      importantInfo,
      processedAt: Date.now()
    };
    
    emailCache.set(email.id, emailData);
    
    // Save to storage with error handling
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'saveEmailData',
          emailData: emailData
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      console.error('AgileEmails: Error saving email data', error);
    }
  } catch (error) {
    console.error('AgileEmails: Error processing email', error);
  }
}

function applyVisualIndicators(emails, settings) {
  if (!classifier) return;
  
  // Collect all processed emails with their elements
  const emailElements = [];
  emails.forEach(emailData => {
    try {
      const cached = emailCache.get(emailData.id);
      if (cached && cached.element && document.body.contains(cached.element)) {
        // Skip if already processed and overlay exists
        const existingOverlay = cached.element.querySelector('.agileemails-overlay');
        if (existingOverlay && existingOverlay.getAttribute('data-email-id') === cached.id) {
          // Already has correct overlay, just update if needed
          emailElements.push({
            element: cached.element,
            data: cached,
            skipOverlay: true
          });
        } else {
          emailElements.push({
            element: cached.element,
            data: cached,
            skipOverlay: false
          });
        }
      }
    } catch (error) {
      console.error('AgileEmails: Error processing email for indicators', error);
    }
  });
  
  // Apply visual overlays to each email
  emailElements.forEach(({ element, data, skipOverlay }) => {
    try {
      // If skipOverlay is true, just update styles without recreating overlay
      if (skipOverlay) {
        element.classList.remove('agileemails-priority-5', 'agileemails-priority-4', 'agileemails-priority-3', 'agileemails-priority-2', 'agileemails-priority-1');
        element.classList.add(`agileemails-priority-${data.priority}`);
        
        if (settings.settings?.showPriorityColors !== false) {
          const priorityColor = classifier.getPriorityColor(data.priority);
          const borderWidth = data.priority >= 4 ? '6px' : data.priority >= 3 ? '4px' : '2px';
          element.style.borderLeft = `${borderWidth} solid ${priorityColor}`;
        }
        return;
      }
      
      // Check if overlay already exists and is correct - if so, skip re-adding
      const existingOverlay = element.querySelector('.agileemails-overlay');
      const existingDataId = existingOverlay?.getAttribute('data-email-id');
      
      // Only update if email ID changed or overlay doesn't exist
      if (existingOverlay && existingDataId === data.id) {
        // Overlay already exists for this email, just update styles if needed
        element.classList.remove('agileemails-priority-5', 'agileemails-priority-4', 'agileemails-priority-3', 'agileemails-priority-2', 'agileemails-priority-1');
        element.classList.add(`agileemails-priority-${data.priority}`);
        
        // Update border if needed
        if (settings.settings?.showPriorityColors !== false) {
          const priorityColor = classifier.getPriorityColor(data.priority);
          const borderWidth = data.priority >= 4 ? '6px' : data.priority >= 3 ? '4px' : '2px';
          element.style.borderLeft = `${borderWidth} solid ${priorityColor}`;
        }
        return; // Skip re-creating overlay
      }
      
      // Remove existing AgileEmails indicators if they exist
      if (existingOverlay) {
        existingOverlay.remove();
      }
      
      const existingBadge = element.querySelector('.agileemails-badge');
      if (existingBadge) {
        existingBadge.remove();
      }
      
      const existingPriorityBadge = element.querySelector('.agileemails-priority-badge');
      if (existingPriorityBadge) {
        existingPriorityBadge.remove();
      }
      
      // Remove existing border
      element.style.borderLeft = '';
      element.classList.remove('agileemails-priority-5', 'agileemails-priority-4', 'agileemails-priority-3', 'agileemails-priority-2', 'agileemails-priority-1');
      
      // Add priority class for styling
      element.classList.add(`agileemails-priority-${data.priority}`);
      
      // Check if visual indicators are enabled
      if (settings.settings?.showPriorityColors !== false) {
        // Add priority color border (thicker for higher priority)
        const priorityColor = classifier.getPriorityColor(data.priority);
        const borderWidth = data.priority >= 4 ? '6px' : data.priority >= 3 ? '4px' : '2px';
        element.style.borderLeft = `${borderWidth} solid ${priorityColor}`;
      }
      
      // Create overlay with urgency info
      const overlay = document.createElement('div');
      overlay.className = 'agileemails-overlay';
      
      const priorityColor = classifier.getPriorityColor(data.priority);
      const priorityLabels = {
        5: 'URGENT',
        4: 'HIGH',
        3: 'MEDIUM',
        2: 'LOW',
        1: 'LOW'
      };
      
      // Build overlay content
      let overlayHTML = `
        <div class="agileemails-priority-indicator" style="background-color: ${priorityColor}">
          <span class="agileemails-priority-number">${data.priority}</span>
          <span class="agileemails-priority-label">${priorityLabels[data.priority] || 'MEDIUM'}</span>
        </div>
      `;
      
      // Add category badge
      if (settings.settings?.showCategoryBadges !== false) {
        const categoryColor = settings.categories?.[data.category]?.color || '#808080';
        const categoryName = data.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        overlayHTML += `
          <div class="agileemails-category-badge" style="background-color: ${categoryColor}">
            ${categoryName}
          </div>
        `;
      }
      
      // Add important info if available
      if (data.importantInfo) {
        const infoItems = [];
        if (data.importantInfo.dates && data.importantInfo.dates.length > 0) {
          infoItems.push(`📅 ${data.importantInfo.dates[0]}`);
        }
        if (data.importantInfo.money && data.importantInfo.money.length > 0) {
          infoItems.push(`💰 ${data.importantInfo.money[0]}`);
        }
        if (infoItems.length > 0) {
          overlayHTML += `
            <div class="agileemails-info-items">
              ${infoItems.join(' • ')}
            </div>
          `;
        }
      }
      
      // Add newsletter/DND indicators
      if (data.isNewsletter) {
        overlayHTML += '<span class="agileemails-newsletter-badge">📧 Newsletter</span>';
      }
      if (data.isDND) {
        overlayHTML += '<span class="agileemails-dnd-badge">🔕 DND</span>';
      }
      
      overlay.innerHTML = overlayHTML;
      overlay.setAttribute('data-email-id', data.id); // Mark overlay with email ID
      
      // Store email ID on the element for easier lookup
      element.setAttribute('data-agileemails-id', data.id);
      
      // Insert overlay - try to find a good position in the row
      // Gmail rows typically have cells, so we'll append to the row itself
      element.appendChild(overlay);
      
      // Ensure the row has relative positioning for absolute overlay
      if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
      }
      
      // Mark element as processed to prevent re-processing
      element.setAttribute('data-agileemails-processed', 'true');
      
      // Watch this specific overlay for removal
      const overlayWatcher = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          mutation.removedNodes.forEach(node => {
            if (node === overlay || (node.nodeType === 1 && node.contains && node.contains(overlay))) {
              // Overlay was removed, re-apply it
              setTimeout(() => {
                if (document.body.contains(element) && emailCache.has(data.id)) {
                  applyOverlayToElement(element, data, settings);
                }
              }, 50);
            }
          });
        });
      });
      
      // Watch the parent for overlay removal
      if (element.parentElement) {
        overlayWatcher.observe(element.parentElement, {
          childList: true,
          subtree: true
        });
      }
      
      // Also add priority badge next to subject for better visibility
      if (settings.settings?.showCategoryBadges !== false) {
        let subjectEl = element.querySelector('span.bog');
        if (!subjectEl) {
          subjectEl = element.querySelector('[data-thread-perm-id] span');
        }
        if (subjectEl && !subjectEl.querySelector('.agileemails-priority-badge')) {
          const priorityBadge = document.createElement('span');
          priorityBadge.className = 'agileemails-priority-badge';
          priorityBadge.textContent = `P${data.priority}`;
          priorityBadge.style.cssText = `
            display: inline-block;
            padding: 1px 4px;
            margin-left: 6px;
            font-size: 9px;
            font-weight: bold;
            border-radius: 2px;
            background: ${priorityColor};
            color: white;
            vertical-align: middle;
          `;
          subjectEl.appendChild(priorityBadge);
        }
      }
      
      // Hide if DND active
      if (data.isDND) {
        element.style.opacity = '0.3';
        element.style.pointerEvents = 'none';
        element.classList.add('agileemails-dnd');
      } else {
        element.style.opacity = '';
        element.style.pointerEvents = '';
        element.classList.remove('agileemails-dnd');
      }
    } catch (error) {
      console.error('AgileEmails: Error applying visual indicators', error);
    }
  });
  
  // Reorder emails by priority if enabled (but re-apply overlays after)
  if (settings.settings?.reorderByPriority === true) {
    reorderEmailsByPriority(emailElements);
    // Re-apply overlays immediately after reordering (Gmail may have removed them)
    setTimeout(() => {
      reapplyOverlays();
    }, 100);
  }
}

function reorderEmailsByPriority(emailElements) {
  try {
    // Don't reorder if there are too few emails (not worth it)
    if (emailElements.length < 3) return;
    
    // Sort by priority (descending), then by date
    emailElements.sort((a, b) => {
      // Higher priority first
      if (b.data.priority !== a.data.priority) {
        return b.data.priority - a.data.priority;
      }
      // Then by processed date (newer first)
      return (b.data.processedAt || 0) - (a.data.processedAt || 0);
    });
    
    // Find the parent container (Gmail's email list)
    if (emailElements.length === 0) return;
    
    const firstElement = emailElements[0].element;
    const parent = firstElement.parentElement;
    if (!parent) return;
    
    // Store original positions to avoid unnecessary reordering
    const originalOrder = Array.from(parent.children);
    
    // Only reorder if there's a significant difference
    let needsReorder = false;
    for (let i = 0; i < Math.min(emailElements.length, 5); i++) {
      const expectedElement = emailElements[i].element;
      const currentElement = originalOrder[i];
      if (expectedElement !== currentElement) {
        needsReorder = true;
        break;
      }
    }
    
    if (!needsReorder) return;
    
    // Reorder elements in DOM (but do it in a way that minimizes re-renders)
    emailElements.forEach(({ element }) => {
      if (document.body.contains(element)) {
        parent.appendChild(element);
      }
    });
    
    // Immediately re-apply overlays after reordering
    setTimeout(() => {
      reapplyOverlays();
    }, 50);
  } catch (error) {
    console.error('AgileEmails: Error reordering emails', error);
  }
}

// Re-apply overlays that may have been removed by Gmail
// This function is called very frequently to ensure overlays stay
let overlaySettingsCache = null;
let lastSettingsFetch = 0;

function reapplyOverlays() {
  if (isProcessing) return;
  
  try {
    // Cache settings to avoid frequent storage calls
    const now = Date.now();
    if (!overlaySettingsCache || now - lastSettingsFetch > 5000) {
      chrome.storage.local.get(['categories', 'dndRules', 'settings', 'pricingTier'], (data) => {
        overlaySettingsCache = data;
        lastSettingsFetch = now;
        doReapplyOverlays(data);
      });
    } else {
      doReapplyOverlays(overlaySettingsCache);
    }
  } catch (error) {
    console.error('AgileEmails: Error reapplying overlays', error);
  }
}

function doReapplyOverlays(settings) {
  if (!settings) return;
  
  try {
    // Get all email rows currently visible
    const emailRows = document.querySelectorAll('tr[role="row"]');
    const rowsToProcess = [];
    
    emailRows.forEach(row => {
      // Skip if row is not visible
      if (row.offsetParent === null) return;
      
      // Check if this row has an overlay
      const existingOverlay = row.querySelector('.agileemails-overlay');
      
      // Try multiple ways to find email ID
      let emailId = row.getAttribute('data-agileemails-id') ||
                    row.getAttribute('data-thread-perm-id') ||
                    row.closest('[data-thread-perm-id]')?.getAttribute('data-thread-perm-id');
      
      // If we have an email ID and it's in cache
      if (emailId && emailCache.has(emailId)) {
        const emailData = emailCache.get(emailId);
        // If overlay is missing or doesn't match, re-apply
        if (!existingOverlay || existingOverlay.getAttribute('data-email-id') !== emailId) {
          rowsToProcess.push({
            element: row,
            data: emailData
          });
        }
      } else if (!emailId) {
        // Try to extract email ID from the row content (fast path)
        const subjectEl = row.querySelector('span.bog');
        const senderEl = row.querySelector('span[email]') || row.querySelector('.yW span');
        if (subjectEl && senderEl) {
          const senderEmail = senderEl.getAttribute('email') || senderEl.textContent || '';
          const subject = subjectEl.textContent || '';
          // Try to find in cache by matching subject and sender
          for (const [id, cachedData] of emailCache.entries()) {
            if (cachedData.subject === subject && cachedData.from === senderEmail) {
              emailId = id;
              row.setAttribute('data-agileemails-id', emailId); // Cache it for next time
              if (!existingOverlay || existingOverlay.getAttribute('data-email-id') !== emailId) {
                rowsToProcess.push({
                  element: row,
                  data: cachedData
                });
              }
              break;
            }
          }
        }
      }
    });
    
    // Re-apply overlays for rows that need them (batch process)
    if (rowsToProcess.length > 0) {
      rowsToProcess.forEach(({ element, data: emailData }) => {
        applyOverlayToElement(element, emailData, settings);
      });
    }
  } catch (error) {
    console.error('AgileEmails: Error in doReapplyOverlays', error);
  }
}

// Apply overlay to a single element
function applyOverlayToElement(element, emailData, settings) {
  if (!classifier || !element || !document.body.contains(element)) return;
  
  try {
    // Remove existing overlay if any
    const existingOverlay = element.querySelector('.agileemails-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }
    
    // Update priority class
    element.classList.remove('agileemails-priority-5', 'agileemails-priority-4', 'agileemails-priority-3', 'agileemails-priority-2', 'agileemails-priority-1');
    element.classList.add(`agileemails-priority-${emailData.priority}`);
    
    // Add border
    if (settings.settings?.showPriorityColors !== false) {
      const priorityColor = classifier.getPriorityColor(emailData.priority);
      const borderWidth = emailData.priority >= 4 ? '6px' : emailData.priority >= 3 ? '4px' : '2px';
      element.style.borderLeft = `${borderWidth} solid ${priorityColor}`;
    }
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'agileemails-overlay';
    overlay.setAttribute('data-email-id', emailData.id);
    
    const priorityColor = classifier.getPriorityColor(emailData.priority);
    const priorityLabels = {
      5: 'URGENT',
      4: 'HIGH',
      3: 'MEDIUM',
      2: 'LOW',
      1: 'LOW'
    };
    
    let overlayHTML = `
      <div class="agileemails-priority-indicator" style="background-color: ${priorityColor}">
        <span class="agileemails-priority-number">${emailData.priority}</span>
        <span class="agileemails-priority-label">${priorityLabels[emailData.priority] || 'MEDIUM'}</span>
      </div>
    `;
    
    if (settings.settings?.showCategoryBadges !== false) {
      const categoryColor = settings.categories?.[emailData.category]?.color || '#808080';
      const categoryName = emailData.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      overlayHTML += `
        <div class="agileemails-category-badge" style="background-color: ${categoryColor}">
          ${categoryName}
        </div>
      `;
    }
    
    if (emailData.importantInfo) {
      const infoItems = [];
      if (emailData.importantInfo.dates && emailData.importantInfo.dates.length > 0) {
        infoItems.push(`📅 ${emailData.importantInfo.dates[0]}`);
      }
      if (emailData.importantInfo.money && emailData.importantInfo.money.length > 0) {
        infoItems.push(`💰 ${emailData.importantInfo.money[0]}`);
      }
      if (infoItems.length > 0) {
        overlayHTML += `
          <div class="agileemails-info-items">
            ${infoItems.join(' • ')}
          </div>
        `;
      }
    }
    
    if (emailData.isNewsletter) {
      overlayHTML += '<span class="agileemails-newsletter-badge">📧 Newsletter</span>';
    }
    if (emailData.isDND) {
      overlayHTML += '<span class="agileemails-dnd-badge">🔕 DND</span>';
    }
    
    overlay.innerHTML = overlayHTML;
    
    // Store email ID on element for easier lookup
    element.setAttribute('data-agileemails-id', emailData.id);
    
    element.appendChild(overlay);
    
    // Ensure relative positioning
    if (getComputedStyle(element).position === 'static') {
      element.style.position = 'relative';
    }
    
    // Update DND styling
    if (emailData.isDND) {
      element.style.opacity = '0.3';
      element.style.pointerEvents = 'none';
      element.classList.add('agileemails-dnd');
    } else {
      element.style.opacity = '';
      element.style.pointerEvents = '';
      element.classList.remove('agileemails-dnd');
    }
    
    // Store reference to overlay for quick re-application
    element._agileemailsOverlay = overlay;
    element._agileemailsData = emailData;
    element._agileemailsSettings = settings;
  } catch (error) {
    console.error('AgileEmails: Error applying overlay to element', error);
  }
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'processEmails') {
    processGmailPage().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('AgileEmails: Error processing emails', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  } else if (request.action === 'autoDelete') {
    handleAutoDelete(request.category).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('AgileEmails: Error handling auto-delete', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (request.action === 'highlightEmail') {
    highlightEmail(request.emailId);
    sendResponse({ success: true });
    return true;
  }
  return false;
});

async function handleAutoDelete(category) {
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(['categories'], resolve);
    });
    
    const autoDeleteDays = data.categories?.[category]?.autoDelete;
    if (!autoDeleteDays) return;
    
    // Auto-delete logic for specific category
    emailCache.forEach((emailData, id) => {
      if (emailData.category === category && emailData.element) {
        const deleteAge = emailData.processedAt ? 
          (Date.now() - emailData.processedAt) / (1000 * 60 * 60 * 24) : 0;
        
        if (deleteAge >= autoDeleteDays) {
          // Mark for deletion (hide from view)
          if (document.body.contains(emailData.element)) {
            emailData.element.style.display = 'none';
            emailData.element.classList.add('agileemails-deleted');
          }
        }
      }
    });
  } catch (error) {
    console.error('AgileEmails: Error in handleAutoDelete', error);
  }
}

function highlightEmail(emailId) {
  try {
    const emailData = emailCache.get(emailId);
    if (emailData && emailData.element && document.body.contains(emailData.element)) {
      // Scroll to element
      emailData.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Add highlight effect
      emailData.element.style.backgroundColor = '#fff3cd';
      emailData.element.style.transition = 'background-color 0.3s';
      
      setTimeout(() => {
        emailData.element.style.backgroundColor = '';
      }, 2000);
    }
  } catch (error) {
    console.error('AgileEmails: Error highlighting email', error);
  }
}

// Initialize only once
if (!window.agileEmailsInitStarted) {
  window.agileEmailsInitStarted = true;
  init();
}

