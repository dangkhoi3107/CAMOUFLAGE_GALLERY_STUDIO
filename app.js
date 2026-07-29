document.documentElement.classList.add('js');

const state = {
  items: [],
  filteredItems: [],
  activeIndex: 0,
  activeAnimal: null
};

const elements = {
  siteHeader: document.querySelector('#siteHeader'),
  grid: document.querySelector('#galleryGrid'),
  empty: document.querySelector('#emptyState'),
  search: document.querySelector('#searchInput'),
  count: document.querySelector('#itemCount'),
  speciesCount: document.querySelector('#speciesCount'),
  variationCount: document.querySelector('#variationCount'),
  filterChips: document.querySelector('#filterChips'),
  heroVisual: document.querySelector('#heroVisual'),
  heroFeaturedImage: document.querySelector('#heroFeaturedImage'),
  modal: document.querySelector('#viewerModal'),
  modalTitle: document.querySelector('#modalTitle'),
  viewerStage: document.querySelector('#viewerStage'),
  compareFrame: document.querySelector('#compareFrame'),
  compareBase: document.querySelector('#compareBase'),
  compareOutput: document.querySelector('#compareOutput'),
  compareOverlay: document.querySelector('#compareOverlay'),
  compareDivider: document.querySelector('#compareDivider'),
  compareControlBar: document.querySelector('#compareControlBar'),
  compareRange: document.querySelector('#compareRange'),
  previousButton: document.querySelector('#previousButton'),
  nextButton: document.querySelector('#nextButton'),
  qrModal: document.querySelector('#qrModal'),
  qrCanvas: document.querySelector('#qrCanvas'),
  qrUrl: document.querySelector('#qrUrl'),
  qrButton: document.querySelector('#qrButton'),
  shareButton: document.querySelector('#shareButton'),
  copyLinkButton: document.querySelector('#copyLinkButton'),
  toast: document.querySelector('#toast'),
  gallerySection: document.querySelector('.gallery-section')
};

function escapeHtml(value = '') {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => elements.toast.classList.remove('show'), 2200);
}

function getActiveItem() {
  return state.filteredItems[state.activeIndex] || state.items[state.activeIndex];
}

function cardTemplate(item, index) {
  const tags = item.tags?.length ? item.tags : ['camouflage', 'generated'];
  const description = item.description || 'Explore the generated output, original object, and background used for this composition.';
  const variationText = Number.isInteger(item.variation) ? `Variation ${String(item.variation).padStart(2, '0')}` : '';
  return `
    <article class="gallery-card" data-id="${escapeHtml(item.id)}" data-open-card="${escapeHtml(item.id)}">
      <button class="card-image-button" type="button" data-open-card="${escapeHtml(item.id)}" aria-label="View details — ${escapeHtml(item.title)}">
        <div class="card-media">
          <img src="${item.images.output}" alt="Generated output — ${escapeHtml(item.title)}" loading="lazy" decoding="async" />
          <span class="card-open-indicator" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m15 15 5 5M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13ZM8 10.5h5M10.5 8v5"/></svg>
          </span>
        </div>
      </button>
      <div class="card-body">
        <div class="card-title-row">
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            ${variationText ? `<span class="card-variation">${escapeHtml(variationText)}</span>` : ''}
          </div>
        </div>
        <p class="card-description">${escapeHtml(description)}</p>
        <div class="tag-list">${tags.slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
      </div>
    </article>`;
}

let cardObserver;

function revealCards() {
  if (cardObserver) cardObserver.disconnect();
  const cards = [...elements.grid.querySelectorAll('.gallery-card')];

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cards.forEach((card) => card.classList.add('is-visible'));
    return;
  }

  cardObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      cardObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px' });

  cards.forEach((card, index) => {
    card.style.setProperty('--card-order', String(index % 9));
    cardObserver.observe(card);
  });
}

function animateCount(target, el, delay = 0) {
  if (!el) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || target <= 1) {
    el.textContent = String(target);
    return;
  }

  const duration = 700;
  const run = () => {
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (delay > 0) setTimeout(run, delay); else run();
}

function renderGallery(items) {
  elements.grid.innerHTML = items.map(cardTemplate).join('');
  elements.empty.hidden = items.length > 0;
  revealCards();
}

function filterGallery(query) {
  const normalized = query.trim().toLowerCase();
  state.filteredItems = state.items.filter((item) => {
    if (state.activeAnimal && item.animal !== state.activeAnimal) return false;
    if (!normalized) return true;
    const haystack = [item.title, item.description, ...(item.tags || [])].join(' ').toLowerCase();
    return haystack.includes(normalized);
  });
  renderGallery(state.filteredItems);
}

function setAnimalFilter(animal) {
  state.activeAnimal = state.activeAnimal === animal ? null : animal;
  elements.filterChips.querySelectorAll('[data-animal-filter]').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.animalFilter === (state.activeAnimal ?? ''));
  });
  filterGallery(elements.search.value);
}

function buildFilterChips(items) {
  const animals = [...new Set(items.map((item) => item.animal).filter(Boolean))].sort();
  if (!animals.length) {
    elements.filterChips.hidden = true;
    return;
  }
  elements.filterChips.hidden = false;
  elements.filterChips.innerHTML = [
    `<button class="chip active" type="button" data-animal-filter="">All</button>`,
    ...animals.map((animal) => `<button class="chip" type="button" data-animal-filter="${escapeHtml(animal)}">${escapeHtml(capitalize(animal))}</button>`)
  ].join('');
}

function animateElement(element, keyframes, options = {}) {
  if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !element.animate) return;
  element.getAnimations().forEach((animation) => animation.cancel());
  element.animate(keyframes, { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)', ...options });
}

function animateCompareSwap() {
  animateElement(elements.compareFrame, [
    { opacity: 0, transform: 'scale(.98)' },
    { opacity: 1, transform: 'scale(1)' }
  ], { duration: 300 });
}

function animateViewerNavigation(direction) {
  const offset = direction > 0 ? 22 : -22;
  animateElement(elements.viewerStage, [
    { opacity: 0, transform: `translateX(${offset}px)` },
    { opacity: 1, transform: 'translateX(0)' }
  ], { duration: 380 });
  animateElement(elements.modalTitle, [
    { opacity: 0, transform: `translateX(${offset / 2}px)` },
    { opacity: 1, transform: 'translateX(0)' }
  ], { duration: 320 });
}

function createRipple(button, event) {
  if (!button || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rect = button.getBoundingClientRect();
  const diameter = Math.max(rect.width, rect.height) * 1.4;
  const ripple = document.createElement('span');
  ripple.className = 'button-ripple';
  ripple.style.width = `${diameter}px`;
  ripple.style.height = `${diameter}px`;
  ripple.style.left = `${event.clientX - rect.left - diameter / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - diameter / 2}px`;
  button.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

// Shows a subtle shimmer on the stage until the active image(s) finish loading,
// so switching cards never leaves a blank frame while a network fetch is in flight.
function trackImageLoad(...imageEls) {
  elements.viewerStage.classList.add('is-loading');
  let pending = imageEls.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) elements.viewerStage.classList.remove('is-loading');
  };
  imageEls.forEach((img) => {
    if (img.complete) { done(); return; }
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });
}

function setImageSrc(imgEl, src, alt) {
  imgEl.alt = alt;
  if (imgEl.getAttribute('src') !== src) imgEl.src = src;
}

function updateComparePosition(value) {
  const percent = Number(value);
  elements.compareOverlay.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
  elements.compareDivider.style.left = `${percent}%`;
  elements.compareRange.style.setProperty('--fill', `${percent}%`);
}

function renderCompare(animate) {
  const item = getActiveItem();
  setImageSrc(elements.compareBase, item.images.object, `Input Object — ${item.title}`);
  setImageSrc(elements.compareOutput, item.images.output, `Generated Output — ${item.title}`);
  trackImageLoad(elements.compareBase, elements.compareOutput);
  updateComparePosition(elements.compareRange.value);
  if (animate) animateCompareSwap();
}

function openViewer(itemId) {
  const collection = state.filteredItems.length ? state.filteredItems : state.items;
  state.activeIndex = Math.max(0, collection.findIndex((item) => item.id === itemId));
  updateViewer();
  elements.modal.classList.add('open');
  elements.modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  elements.modal.querySelector('.close-button').focus();
}

function updateViewer(animate) {
  const item = getActiveItem();
  if (!item) return;
  elements.modalTitle.textContent = item.title;
  elements.compareRange.value = 50;
  renderCompare(animate);
  elements.previousButton.disabled = state.filteredItems.length <= 1;
  elements.nextButton.disabled = state.filteredItems.length <= 1;
}

function closeViewer() {
  elements.modal.classList.remove('open');
  elements.modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function navigateViewer(direction) {
  const collection = state.filteredItems.length ? state.filteredItems : state.items;
  if (!collection.length) return;
  state.activeIndex = (state.activeIndex + direction + collection.length) % collection.length;
  updateViewer(true);
  animateViewerNavigation(direction);
}

function getShareUrl() {
  return window.location.href.split('#')[0];
}

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(getShareUrl());
    showToast('Link copied');
  } catch {
    showToast("Couldn't copy automatically");
  }
}

async function sharePage() {
  const data = { title: document.title, text: 'Explore the Camouflage Gallery', url: getShareUrl() };
  if (navigator.share) {
    try { await navigator.share(data); } catch (error) { if (error.name !== 'AbortError') copyUrl(); }
  } else {
    copyUrl();
  }
}

function openQr() {
  const url = getShareUrl();
  elements.qrCanvas.innerHTML = '';
  elements.qrUrl.textContent = url;
  if (window.QRCode) {
    new QRCode(elements.qrCanvas, {
      text: url,
      width: 200,
      height: 200,
      colorDark: '#0b0d0f',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  } else {
    elements.qrCanvas.textContent = 'QR library failed to load. Use the copy link button instead.';
  }
  elements.qrModal.classList.add('open');
  elements.qrModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeQr() {
  elements.qrModal.classList.remove('open');
  elements.qrModal.setAttribute('aria-hidden', 'true');
  if (!elements.modal.classList.contains('open')) document.body.classList.remove('modal-open');
}

function bindEvents() {
  elements.grid.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-open-card]');
    if (trigger) openViewer(trigger.dataset.openCard);
  });

  elements.search.addEventListener('input', (event) => filterGallery(event.target.value));
  elements.filterChips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-animal-filter]');
    if (chip) setAnimalFilter(chip.dataset.animalFilter || null);
  });
  document.querySelectorAll('[data-close-modal]').forEach((element) => element.addEventListener('click', closeViewer));
  document.querySelectorAll('[data-close-qr]').forEach((element) => element.addEventListener('click', closeQr));

  elements.compareRange.addEventListener('input', (event) => updateComparePosition(event.target.value));
  const startDragging = () => {
    elements.compareRange.classList.add('is-dragging');
    elements.compareFrame.classList.add('is-dragging');
  };
  const stopDragging = () => {
    elements.compareRange.classList.remove('is-dragging');
    elements.compareFrame.classList.remove('is-dragging');
  };
  elements.compareRange.addEventListener('pointerdown', startDragging);
  ['pointerup', 'pointercancel', 'change'].forEach((eventName) => {
    elements.compareRange.addEventListener(eventName, stopDragging);
  });

  elements.previousButton.addEventListener('click', () => navigateViewer(-1));
  elements.nextButton.addEventListener('click', () => navigateViewer(1));
  elements.shareButton.addEventListener('click', sharePage);
  elements.qrButton.addEventListener('click', openQr);
  elements.copyLinkButton.addEventListener('click', copyUrl);

  document.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('.primary-button, .secondary-button, .icon-button, .stage-nav, .chip');
    if (button) createRipple(button, event);
  });

  document.addEventListener('keydown', (event) => {
    if (elements.qrModal.classList.contains('open') && event.key === 'Escape') return closeQr();
    if (!elements.modal.classList.contains('open')) return;
    if (event.key === 'Escape') return closeViewer();
    if (event.target === elements.compareRange) return; // let the native range input handle its own arrow keys
    if (event.key === 'ArrowLeft') navigateViewer(-1);
    if (event.key === 'ArrowRight') navigateViewer(1);
  });

  let headerCompact = false;
  window.addEventListener('scroll', () => {
    const shouldCompact = window.scrollY > 24;
    if (shouldCompact !== headerCompact) {
      headerCompact = shouldCompact;
      elements.siteHeader.classList.toggle('is-compact', shouldCompact);
    }
  }, { passive: true });
}

function setFeaturedHeroImage(items) {
  const featured = items.find((item) => item.featured) || items[0];
  if (!featured || !elements.heroFeaturedImage) return;
  elements.heroFeaturedImage.src = featured.images.output;
  elements.heroFeaturedImage.alt = `Generated output — ${featured.title}`;
  elements.heroVisual.hidden = false;
}

async function loadGallery() {
  try {
    const response = await fetch('/gallery/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Manifest error: ${response.status}`);
    const manifest = await response.json();
    state.items = manifest.cards || [];
    state.filteredItems = [...state.items];
    animateCount(manifest.totalCards ?? state.items.length, elements.count, 0);
    animateCount(manifest.totalSpecies ?? 0, elements.speciesCount, 120);
    animateCount(manifest.totalCards ?? state.items.length, elements.variationCount, 240);
    buildFilterChips(state.items);
    renderGallery(state.filteredItems);
    setFeaturedHeroImage(state.items);
  } catch (error) {
    console.error(error);
    elements.grid.innerHTML = `
      <div class="empty-state" style="display:block;grid-column:1/-1">
        <strong>Gallery failed to load</strong>
        <span>Run <code>npm run build</code> or <code>npm run dev</code> to generate the manifest.</span>
      </div>`;
  }
}

if ('IntersectionObserver' in window && elements.gallerySection) {
  const sectionObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      elements.gallerySection.classList.add('is-visible');
      observer.disconnect();
    });
  }, { threshold: 0.08 });
  sectionObserver.observe(elements.gallerySection);
} else if (elements.gallerySection) {
  elements.gallerySection.classList.add('is-visible');
}

bindEvents();
loadGallery();
