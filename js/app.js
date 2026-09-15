/**
 * Shortly URL Shortening Application
 * Production-ready, accessible, resilient client-side script.
 */

(function () {
  'use strict';

  // --- Constants & Config ---
  const STORAGE_KEY = 'shortly_shortened_links';
  const MAX_STORED_LINKS = 15;
  const PRIMARY_ENDPOINT = 'https://tinyurl.com/api-create.php?url=';
  const CLEANURI_ENDPOINT = 'https://cleanuri.com/api/v1/shorten';

  // --- DOM Elements ---
  const mobileNavToggle = document.getElementById('mobile-nav-toggle');
  const primaryNav = document.getElementById('primary-nav');
  const shortenForm = document.getElementById('shorten-form');
  const urlInput = document.getElementById('url-input');
  const inputWrapper = urlInput ? urlInput.closest('.input-wrapper') : null;
  const urlError = document.getElementById('url-error');
  const submitBtn = document.getElementById('submit-btn');
  const linksList = document.getElementById('links-list');
  const copyStatus = document.getElementById('copy-status');

  // --- State ---
  let shortenedLinks = [];
  let copyTimeoutMap = new Map();

  // ==========================================================================
  // 1. Navigation & Accessibility
  // ==========================================================================
  function initNavigation() {
    if (!mobileNavToggle || !primaryNav) return;

    mobileNavToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      const isExpanded = mobileNavToggle.getAttribute('aria-expanded') === 'true';
      setMenuState(!isExpanded);
    });

    // Close menu on click outside
    document.addEventListener('click', function (e) {
      if (!primaryNav.contains(e.target) && !mobileNavToggle.contains(e.target)) {
        setMenuState(false);
      }
    });

    // Close menu on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        setMenuState(false);
      }
    });

    // Reset when resizing to desktop view
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 768) {
        setMenuState(false);
      }
    });
  }

  function setMenuState(open) {
    if (!mobileNavToggle || !primaryNav) return;
    mobileNavToggle.setAttribute('aria-expanded', String(open));
    mobileNavToggle.classList.toggle('is-active', open);
    primaryNav.classList.toggle('is-open', open);
  }

  // ==========================================================================
  // 2. Validation & Error Handling
  // ==========================================================================
  function showError(message) {
    if (!inputWrapper || !urlError) return;
    inputWrapper.classList.add('has-error');
    urlError.textContent = message;
    urlInput.setAttribute('aria-invalid', 'true');
  }

  function clearError() {
    if (!inputWrapper || !urlError) return;
    inputWrapper.classList.remove('has-error');
    urlError.textContent = '';
    urlInput.removeAttribute('aria-invalid');
  }

  function isValidUrl(string) {
    try {
      let testUrl = string.trim();
      if (!/^https?:\/\//i.test(testUrl)) {
        testUrl = 'https://' + testUrl;
      }
      const parsed = new URL(testUrl);
      const hasDot = parsed.hostname.includes('.');
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && hasDot;
    } catch (_) {
      return false;
    }
  }

  function formatInputUrl(string) {
    let trimmed = string.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = 'https://' + trimmed;
    }
    return trimmed;
  }

  // ==========================================================================
  // 3. API Integration (Direct Endpoint with Contingency)
  // ==========================================================================
  async function shortenUrl(targetUrl) {
    // Primary: Fast, direct client-side API without CORS rejections
    try {
      const response = await fetch(PRIMARY_ENDPOINT + encodeURIComponent(targetUrl));
      if (response.ok) {
        const shortUrl = await response.text();
        if (shortUrl && shortUrl.startsWith('http')) {
          return shortUrl.trim();
        }
      }
    } catch (primaryErr) {
      console.warn('Primary shortening service failed, attempting alternative:', primaryErr);
    }

    // Secondary: Clean URI endpoint (if deployed behind proxy or server environment)
    try {
      const cleanUriPromise = fetch(CLEANURI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams({ url: targetUrl })
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('CleanURI timeout')), 3000)
      );

      const cleanRes = await Promise.race([cleanUriPromise, timeoutPromise]);
      if (cleanRes.ok) {
        const data = await cleanRes.json();
        if (data && data.result_url) {
          return data.result_url;
        }
      }
    } catch (cleanErr) {
      console.warn('Alternative shortening service unreachable:', cleanErr);
    }

    throw new Error('All shortening services failed');
  }

  // ==========================================================================
  // 4. Persistence (LocalStorage)
  // ==========================================================================
  function loadStoredLinks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Validate schema: must have originalUrl and shortUrl
        return parsed.filter(
          item =>
            item &&
            typeof item.originalUrl === 'string' &&
            typeof item.shortUrl === 'string'
        );
      }
      return [];
    } catch (e) {
      console.error('Failed to load stored links from localStorage:', e);
      return [];
    }
  }

  function saveStoredLinks() {
    try {
      const payload = shortenedLinks.slice(0, MAX_STORED_LINKS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error('Failed to save links to localStorage:', e);
    }
  }

  // ==========================================================================
  // 5. DOM Rendering (Safe, XSS-free)
  // ==========================================================================
  function createLinkCardElement(item) {
    const li = document.createElement('li');
    li.className = 'link-card';
    li.dataset.id = item.id;

    // Original URL container
    const origDiv = document.createElement('div');
    origDiv.className = 'link-card-original';
    origDiv.title = item.originalUrl;
    origDiv.textContent = item.originalUrl;

    // Result container
    const resultDiv = document.createElement('div');
    resultDiv.className = 'link-card-result';

    // Short link anchor
    const shortLink = document.createElement('a');
    shortLink.className = 'link-card-short';
    shortLink.href = item.shortUrl;
    shortLink.target = '_blank';
    shortLink.rel = 'noopener noreferrer';
    shortLink.textContent = item.shortUrl;

    // Copy Button
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-rounded link-copy-btn';
    copyBtn.dataset.url = item.shortUrl;
    copyBtn.dataset.original = item.originalUrl;
    copyBtn.textContent = 'Copy';
    copyBtn.setAttribute('aria-label', 'Copy shortened link for ' + item.originalUrl);

    resultDiv.appendChild(shortLink);
    resultDiv.appendChild(copyBtn);

    li.appendChild(origDiv);
    li.appendChild(resultDiv);

    return li;
  }

  function renderLinks() {
    if (!linksList) return;
    linksList.innerHTML = '';
    shortenedLinks.forEach(item => {
      const card = createLinkCardElement(item);
      linksList.appendChild(card);
    });
  }

  function prependLink(item) {
    if (!linksList) return;
    const card = createLinkCardElement(item);
    linksList.prepend(card);
  }

  // ==========================================================================
  // 6. Clipboard Interaction
  // ==========================================================================
  async function copyToClipboard(text, buttonElement) {
    let copySuccessful = false;

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        copySuccessful = true;
      } catch (err) {
        console.warn('Clipboard API writeText failed, trying fallback:', err);
      }
    }

    if (!copySuccessful) {
      // Fallback: textarea + execCommand
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '-9999px';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        copySuccessful = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.error('Fallback clipboard copy failed:', err);
      }
    }

    if (copySuccessful) {
      // Clear any pending timeout for this button
      if (copyTimeoutMap.has(buttonElement)) {
        clearTimeout(copyTimeoutMap.get(buttonElement));
      }

      const originalUrl = buttonElement.dataset.original || '';

      buttonElement.textContent = 'Copied!';
      buttonElement.setAttribute('aria-label', 'Copied ' + text + ' to clipboard');
      buttonElement.classList.add('is-copied');

      if (copyStatus) {
        copyStatus.textContent = 'Copied ' + text;
      }

      const timeoutId = setTimeout(() => {
        buttonElement.textContent = 'Copy';
        buttonElement.setAttribute('aria-label', 'Copy shortened link for ' + originalUrl);
        buttonElement.classList.remove('is-copied');
        copyTimeoutMap.delete(buttonElement);
        if (copyStatus) {
          copyStatus.textContent = '';
        }
      }, 2500);

      copyTimeoutMap.set(buttonElement, timeoutId);
    } else {
      alert('Unable to copy automatically. Please copy the link manually: ' + text);
    }
  }

  function initClipboardListener() {
    if (!linksList) return;

    linksList.addEventListener('click', function (e) {
      const copyBtn = e.target.closest('.link-copy-btn');
      if (!copyBtn) return;

      const urlToCopy = copyBtn.dataset.url;
      if (urlToCopy) {
        copyToClipboard(urlToCopy, copyBtn);
      }
    });
  }

  // ==========================================================================
  // 7. Form Submission Handler
  // ==========================================================================
  function initForm() {
    if (!shortenForm || !urlInput) return;

    // Clear error on input
    urlInput.addEventListener('input', function () {
      if (inputWrapper && inputWrapper.classList.contains('has-error')) {
        clearError();
      }
    });

    shortenForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearError();

      // Check offline connectivity
      if (typeof navigator.onLine === 'boolean' && !navigator.onLine) {
        showError('You appear to be offline. Please check your internet connection.');
        urlInput.focus();
        return;
      }

      const rawValue = urlInput.value.trim();

      // Check empty
      if (!rawValue) {
        showError('Please add a link');
        urlInput.focus();
        return;
      }

      // Check URL validity
      if (!isValidUrl(rawValue)) {
        showError('Please enter a valid URL');
        urlInput.focus();
        return;
      }

      const formattedUrl = formatInputUrl(rawValue);

      // Check if already shortened recently
      const existing = shortenedLinks.find(
        link => link.originalUrl.toLowerCase() === formattedUrl.toLowerCase()
      );
      if (existing) {
        urlInput.value = '';
        const cardElem = linksList.querySelector('[data-id="' + existing.id + '"]');
        if (cardElem) {
          cardElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          cardElem.style.transition = 'outline 0.3s ease';
          cardElem.style.outline = '2px solid var(--color-cyan)';
          setTimeout(() => {
            cardElem.style.outline = 'none';
          }, 1500);
        }
        return;
      }

      // Set Loading State
      setLoading(true);

      try {
        const shortUrl = await shortenUrl(formattedUrl);

        const newLinkItem = {
          id: 'link_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          originalUrl: formattedUrl,
          shortUrl: shortUrl,
          createdAt: new Date().toISOString()
        };

        shortenedLinks.unshift(newLinkItem);
        saveStoredLinks();
        prependLink(newLinkItem);

        urlInput.value = '';
      } catch (err) {
        console.error('Error shortening link:', err);
        showError('Unable to shorten link. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    });
  }

  function setLoading(isLoading) {
    if (!submitBtn) return;
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle('is-loading', isLoading);
    const textSpan = submitBtn.querySelector('.btn-text');
    if (textSpan) {
      textSpan.textContent = isLoading ? 'Shortening...' : 'Shorten It!';
    }
  }

  // ==========================================================================
  // 8. Initialization
  // ==========================================================================
  function init() {
    initNavigation();
    initClipboardListener();
    initForm();

    // Load persisted links
    shortenedLinks = loadStoredLinks();
    renderLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
