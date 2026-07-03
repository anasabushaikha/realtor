(function () {
  const { buildListingRecord } = window.RealtorFilters;

  const els = {
    form: document.getElementById('search-form'),
    input: document.getElementById('search-url'),
    loadBtn: document.getElementById('load-btn'),
    status: document.getElementById('load-status'),
    filtersPanel: document.getElementById('filters-panel'),
    results: document.getElementById('results'),
    resultsSummary: document.getElementById('results-summary'),
    sortSelect: document.getElementById('sort-select'),
    ownershipChecks: document.getElementById('ownership-checks'),
    parkingFilter: document.getElementById('parking-filter'),
    priceMin: document.getElementById('price-min'),
    priceMax: document.getElementById('price-max'),
    keyword: document.getElementById('keyword-filter'),
    resetBtn: document.getElementById('reset-filters'),
    errorBox: document.getElementById('error-box'),
    saveFavBtn: document.getElementById('save-fav-btn'),
    favoritesRow: document.getElementById('favorites-row'),
  };

  // On GitHub Pages there's no local proxy, so calls go to the deployed Cloudflare
  // Worker instead. Local dev (node server.js) keeps using its own /api/search.
  const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const SEARCH_ENDPOINT = isLocalDev ? '/api/search' : 'https://realtor-ca-proxy.anas-abushaikha.workers.dev/';

  let state = { listings: [], ownershipTypes: [] };
  const LAST_URL_KEY = 'realtor-filter:last-url';
  const FAVORITES_KEY = 'realtor-filter:favorites';
  const DEFAULT_FAVORITES = [
    {
      label: '1BR rentals ≤$1750, KW',
      url: 'https://www.realtor.ca/map#ZoomLevel=11&Center=43.453357%2C-80.500448&LatitudeMax=43.60172&LongitudeMax=-80.10185&LatitudeMin=43.30463&LongitudeMin=-80.89905&view=list&Sort=6-D&PropertyTypeGroupID=1&TransactionTypeId=3&PropertySearchTypeId=0&RentMax=1750&BedRange=1-1&BathRange=1-1&Currency=CAD',
    },
  ];

  function loadFavorites() {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      if (raw === null) {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(DEFAULT_FAVORITES));
        return [...DEFAULT_FAVORITES];
      }
      return JSON.parse(raw);
    } catch (e) {
      return [...DEFAULT_FAVORITES];
    }
  }

  function saveFavoritesList(list) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  }

  function renderFavorites() {
    const favorites = loadFavorites();
    els.favoritesRow.innerHTML = favorites.length
      ? favorites
          .map(
            (f, i) => `
        <button type="button" class="fav-chip" data-index="${i}">
          <span class="fav-label">${escapeHtml(f.label)}</span>
          <span class="fav-remove" data-remove-index="${i}" title="Remove">×</span>
        </button>`
          )
          .join('')
      : '<span class="fav-empty">No saved links yet — click ☆ Save to add this one.</span>';

    els.favoritesRow.querySelectorAll('.fav-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = Number(btn.dataset.removeIndex);
        const favorites = loadFavorites();
        favorites.splice(idx, 1);
        saveFavoritesList(favorites);
        renderFavorites();
      });
    });

    els.favoritesRow.querySelectorAll('.fav-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const idx = Number(chip.dataset.index);
        const fav = loadFavorites()[idx];
        if (fav) {
          els.input.value = fav.url;
          loadFromUrl(fav.url);
        }
      });
    });
  }

  function saveCurrentAsFavorite() {
    const url = els.input.value.trim();
    if (!url) {
      showError('Paste a link first, then save it.');
      return;
    }
    const label = window.prompt('Name this saved search:', 'My Search');
    if (label === null) return;
    const favorites = loadFavorites();
    favorites.push({ label: label.trim() || 'Saved search', url });
    saveFavoritesList(favorites);
    renderFavorites();
  }

  function setStatus(text) {
    els.status.textContent = text || '';
  }

  function showError(message) {
    els.errorBox.textContent = message;
    els.errorBox.hidden = !message;
  }

  function setLoading(isLoading) {
    els.loadBtn.disabled = isLoading;
    els.loadBtn.textContent = isLoading ? 'Loading…' : 'Load listings';
  }

  function badge(label, statusValue) {
    const cls = statusValue === 'yes' ? 'badge-yes' : statusValue === 'no' ? 'badge-no' : 'badge-unknown';
    const icon = statusValue === 'yes' ? '✓' : statusValue === 'no' ? '✕' : '?';
    return `<span class="badge ${cls}">${icon} ${label}</span>`;
  }

  function parseSearchParams(rawInput) {
    let url;
    try {
      url = new URL(rawInput.trim());
    } catch (e) {
      return null;
    }
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    if (!hash) return null;
    const usp = new URLSearchParams(hash);
    const obj = {};
    for (const [k, v] of usp.entries()) obj[k] = v;
    if (!obj.LatitudeMax || !obj.LatitudeMin || !obj.LongitudeMax || !obj.LongitudeMin) return null;
    return obj;
  }

  async function loadFromUrl(rawInput) {
    showError('');
    const params = parseSearchParams(rawInput);
    if (!params) {
      showError('Could not read search filters from that link. Paste a realtor.ca map/list URL that includes the map bounds (it should contain "LatitudeMax=" etc. after the #).');
      return;
    }

    setLoading(true);
    els.filtersPanel.hidden = true;
    els.results.innerHTML = '';
    els.resultsSummary.textContent = '';
    setStatus('Searching realtor.ca…');

    try {
      const res = await fetch(SEARCH_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ params }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Search failed (HTTP ${res.status}).`);
      }

      const records = (data.results || []).map(buildListingRecord);
      state.listings = records;
      state.ownershipTypes = [...new Set(records.map(r => r.ownershipType))].sort();

      localStorage.setItem(LAST_URL_KEY, rawInput);

      let statusMsg = `Loaded ${records.length} of ${data.totalRecords} matching listings.`;
      if (data.truncated) statusMsg += ' (realtor.ca has more than this app fetches per search — narrow your map area for full coverage.)';
      setStatus(statusMsg);

      renderFilterOptions();
      els.filtersPanel.hidden = false;
      applyFiltersAndRender();
    } catch (err) {
      console.error(err);
      showError(err.message || 'Something went wrong loading this search.');
      setStatus('');
    } finally {
      setLoading(false);
    }
  }

  function renderFilterOptions() {
    els.ownershipChecks.innerHTML = state.ownershipTypes
      .map(t => `
        <label class="checkbox-row">
          <input type="checkbox" class="ownership-check" value="${escapeHtml(t)}" checked />
          ${escapeHtml(t)}
        </label>`)
      .join('');
    els.ownershipChecks.querySelectorAll('.ownership-check').forEach(cb => cb.addEventListener('change', applyFiltersAndRender));

    const prices = state.listings.map(l => l.priceSortValue).filter(p => typeof p === 'number');
    if (prices.length) {
      els.priceMin.placeholder = `Min (e.g. ${Math.min(...prices)})`;
      els.priceMax.placeholder = `Max (e.g. ${Math.max(...prices)})`;
    }
  }

  function currentFilters() {
    const checkedOwnership = new Set([...els.ownershipChecks.querySelectorAll('.ownership-check:checked')].map(cb => cb.value));
    return {
      ownershipTypes: checkedOwnership,
      parking: els.parkingFilter.value,
      keyword: els.keyword.value.trim().toLowerCase(),
      priceMin: els.priceMin.value ? Number(els.priceMin.value) : null,
      priceMax: els.priceMax.value ? Number(els.priceMax.value) : null,
    };
  }

  function matches(listing, f) {
    if (f.ownershipTypes.size && !f.ownershipTypes.has(listing.ownershipType)) return false;
    if (f.parking !== 'any' && listing.parkingStatus !== f.parking) return false;
    if (f.keyword && !listing.searchableText.includes(f.keyword)) return false;
    if (f.priceMin !== null && (listing.priceSortValue === null || listing.priceSortValue < f.priceMin)) return false;
    if (f.priceMax !== null && (listing.priceSortValue === null || listing.priceSortValue > f.priceMax)) return false;
    return true;
  }

  function sortListings(list) {
    const mode = els.sortSelect.value;
    const copy = [...list];
    if (mode === 'price-asc') copy.sort((a, b) => (a.priceSortValue ?? Infinity) - (b.priceSortValue ?? Infinity));
    else if (mode === 'price-desc') copy.sort((a, b) => (b.priceSortValue ?? -Infinity) - (a.priceSortValue ?? -Infinity));
    else if (mode === 'newest') copy.sort((a, b) => (b.insertedSortValue ?? 0) - (a.insertedSortValue ?? 0));
    return copy;
  }

  function applyFiltersAndRender() {
    const f = currentFilters();
    const filtered = sortListings(state.listings.filter(l => matches(l, f)));
    els.resultsSummary.textContent = `Showing ${filtered.length} of ${state.listings.length} loaded listings`;
    els.results.innerHTML = filtered.map(renderCard).join('') || '<p class="empty-state">No listings match these filters.</p>';
  }

  function renderCard(listing) {
    const img = listing.imageUrl
      ? `<img src="${listing.imageUrl}" alt="${escapeHtml(listing.street)}" loading="lazy" />`
      : `<div class="img-placeholder">No photo</div>`;
    const priceSuffix = listing.isRent ? '' : '';

    return `
      <article class="card">
        <div class="card-img">${img}</div>
        <div class="card-body">
          <div class="card-price">${escapeHtml(listing.priceDisplay || 'Price n/a')}</div>
          <div class="card-subtype">${escapeHtml(listing.buildingType)}</div>
          <div class="card-address">${escapeHtml(listing.street || 'Address unavailable')}</div>
          <div class="card-citystate">${escapeHtml(listing.cityLine)}</div>
          <div class="card-stats">
            ${listing.beds ? `${listing.beds} bd` : '—'} ·
            ${listing.baths ? `${listing.baths} ba` : '—'} ·
            ${listing.sqft ? escapeHtml(listing.sqft) : 'sqft n/a'}
          </div>
          ${listing.timeOnRealtor ? `<div class="card-dom">On realtor.ca ${escapeHtml(listing.timeOnRealtor)}</div>` : ''}
          <div class="card-badges">
            ${badge('Parking', listing.parkingStatus)}
            <span class="badge badge-info">${escapeHtml(listing.ownershipType)}</span>
          </div>
          <div class="card-footer">
            <span class="mls-id">${listing.mlsNumber ? `MLS® #${escapeHtml(listing.mlsNumber)}` : ''}</span>
            ${listing.detailsUrl ? `<a href="${listing.detailsUrl}" target="_blank" rel="noopener">View on Realtor.ca ↗</a>` : ''}
          </div>
        </div>
      </article>`;
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function resetFilters() {
    els.ownershipChecks.querySelectorAll('.ownership-check').forEach(cb => (cb.checked = true));
    els.parkingFilter.value = 'any';
    els.keyword.value = '';
    els.priceMin.value = '';
    els.priceMax.value = '';
    els.sortSelect.value = 'newest';
    applyFiltersAndRender();
  }

  els.form.addEventListener('submit', e => {
    e.preventDefault();
    loadFromUrl(els.input.value);
  });

  [els.parkingFilter, els.sortSelect].forEach(el => el.addEventListener('change', applyFiltersAndRender));
  els.keyword.addEventListener('input', debounce(applyFiltersAndRender, 250));
  [els.priceMin, els.priceMax].forEach(el => el.addEventListener('input', debounce(applyFiltersAndRender, 300)));
  els.resetBtn.addEventListener('click', resetFilters);
  els.saveFavBtn.addEventListener('click', saveCurrentAsFavorite);

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  const lastUrl = localStorage.getItem(LAST_URL_KEY);
  if (lastUrl) els.input.value = lastUrl;

  renderFavorites();
})();
