const perPage = 20;

function toNumberOrNull(value) {
  if (value === '' || value == null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getFilterState() {
  const volume = document.querySelector('[data-filter-volume]')?.value ?? '';
  const number = document.querySelector('[data-filter-number]')?.value ?? '';
  const date = document.querySelector('[data-filter-date]')?.value ?? '';
  const dateStart = document.querySelector('[data-filter-date-start]')?.value ?? '';
  const dateEnd = document.querySelector('[data-filter-date-end]')?.value ?? '';

  return {
    volume: toNumberOrNull(volume),
    number: toNumberOrNull(number),
    date: date || null,
    dateStart: dateStart || null,
    dateEnd: dateEnd || null
  };
}

function setFilterState(filters) {
  const volumeField = document.querySelector('[data-filter-volume]');
  const numberField = document.querySelector('[data-filter-number]');
  const dateField = document.querySelector('[data-filter-date]');
  const dateStartField = document.querySelector('[data-filter-date-start]');
  const dateEndField = document.querySelector('[data-filter-date-end]');

  if (volumeField) volumeField.value = filters.volume ?? '';
  if (numberField) numberField.value = filters.number ?? '';
  if (dateField) dateField.value = filters.date ?? '';
  if (dateStartField) dateStartField.value = filters.dateStart ?? '';
  if (dateEndField) dateEndField.value = filters.dateEnd ?? '';
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(time) ? null : time;
}

function matchesFilters(paper, filters) {
  if (filters.volume != null && paper.volume !== filters.volume) {
    return false;
  }

  if (filters.number != null && paper.number !== filters.number) {
    return false;
  }

  const paperDate = paper.sortDate || paper.issueDate || paper.publishDate || paper.date;
  if (!paperDate) {
    return false;
  }

  if (filters.date && paperDate !== filters.date) {
    return false;
  }

  const paperTime = parseDateValue(paperDate);
  if (paperTime == null) {
    return false;
  }

  const startTime = parseDateValue(filters.dateStart);
  const endTime = parseDateValue(filters.dateEnd);

  if (startTime != null && paperTime < startTime) {
    return false;
  }

  if (endTime != null && paperTime > endTime) {
    return false;
  }

  return true;
}

function buildUrlWithFilters(page, filters) {
  const url = new URL(window.location.href);
  url.searchParams.set('page', String(page));

  const entries = [
    ['volume', filters.volume],
    ['number', filters.number],
    ['date', filters.date],
    ['dateStart', filters.dateStart],
    ['dateEnd', filters.dateEnd]
  ];

  for (const [key, value] of entries) {
    if (value == null || value === '') {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  history.replaceState({}, '', url);
}

function getFiltersFromUrl() {
  const url = new URL(window.location.href);
  return {
    volume: toNumberOrNull(url.searchParams.get('volume')),
    number: toNumberOrNull(url.searchParams.get('number')),
    date: url.searchParams.get('date') || null,
    dateStart: url.searchParams.get('dateStart') || null,
    dateEnd: url.searchParams.get('dateEnd') || null
  };
}

function paperCard(paper) {
  return `
    <article class="card reveal">
      <a class="paper-thumb-link" href="${paper.pdfPath}">
        <img class="paper-thumb" src="${paper.thumbPath}" alt="${paper.title} first-page thumbnail" loading="lazy" />
      </a>
      <div class="card-body">
        <h3 class="card-title">${paper.title}</h3>
        <p class="meta">${paper.issueDateLabel ? `Issue: ${paper.issueDateLabel}` : `Published: ${paper.date}`}</p>
        <p class="meta">Publish date: ${paper.publishDate || paper.date}</p>
      </div>
    </article>
  `;
}

function renderPagination(totalPages, activePage, mount, onPage) {
  if (totalPages <= 1) {
    mount.innerHTML = '';
    return;
  }

  const buttons = [];
  const windowStart = Math.max(1, activePage - 2);
  const windowEnd = Math.min(totalPages, activePage + 2);

  buttons.push(`<button data-page="${Math.max(1, activePage - 1)}">Prev</button>`);

  for (let page = windowStart; page <= windowEnd; page += 1) {
    buttons.push(`<button data-page="${page}" class="${page === activePage ? 'active' : ''}">${page}</button>`);
  }

  buttons.push(`<button data-page="${Math.min(totalPages, activePage + 1)}">Next</button>`);

  mount.innerHTML = buttons.join('');

  mount.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      const nextPage = Number(button.getAttribute('data-page'));
      if (Number.isInteger(nextPage) && nextPage !== activePage) {
        onPage(nextPage);
      }
    });
  });
}

async function loadPapers() {
  const response = await fetch('data/newspapers.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load newspaper data.');
  }

  const payload = await response.json();
  return payload.items || [];
}

function getPageFromUrl() {
  const url = new URL(window.location.href);
  const value = Number(url.searchParams.get('page') || '1');
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function withBasePath(relativePath) {
  return new URL(relativePath, document.baseURI).href;
}

document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.querySelector('[data-papers-grid]');
  const pagination = document.querySelector('[data-pagination]');
  const summary = document.querySelector('[data-summary]');
  const applyButton = document.querySelector('[data-filter-apply]');
  const resetButton = document.querySelector('[data-filter-reset]');

  if (!grid || !pagination || !summary) {
    return;
  }

  try {
    const papers = await loadPapers();
    let activeFilters = getFiltersFromUrl();

    setFilterState(activeFilters);

    if (papers.length === 0) {
      grid.innerHTML = '<p>No newspapers were found in /public/newspapers.</p>';
      pagination.innerHTML = '';
      summary.textContent = '0 results';
      return;
    }

    let filtered = papers.filter((paper) => matchesFilters(paper, activeFilters));
    let totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    let activePage = Math.min(getPageFromUrl(), totalPages);

    function renderPage(page) {
      totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
      activePage = Math.min(Math.max(1, page), totalPages);
      const start = (activePage - 1) * perPage;
      const end = start + perPage;
      const current = filtered.slice(start, end).map((paper) => ({
        ...paper,
        pdfPath: withBasePath(paper.pdfPath),
        thumbPath: withBasePath(paper.thumbPath)
      }));

      grid.innerHTML = current.length > 0 ? current.map(paperCard).join('') : '<p>No newspapers match the selected filters.</p>';
      summary.textContent = filtered.length > 0
        ? `Showing ${start + 1}-${Math.min(end, filtered.length)} of ${filtered.length} newspapers`
        : 'No newspapers match the selected filters.';
      renderPagination(totalPages, activePage, pagination, renderPage);
      buildUrlWithFilters(activePage, activeFilters);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function applyFilters() {
      activeFilters = getFilterState();
      filtered = papers.filter((paper) => matchesFilters(paper, activeFilters));
      activePage = 1;
      renderPage(activePage);
    }

    function resetFilters() {
      activeFilters = { volume: null, number: null, date: null, dateStart: null, dateEnd: null };
      setFilterState(activeFilters);
      filtered = papers.slice();
      activePage = 1;
      renderPage(activePage);
    }

    if (applyButton) {
      applyButton.addEventListener('click', applyFilters);
    }

    if (resetButton) {
      resetButton.addEventListener('click', resetFilters);
    }

    [
      '[data-filter-volume]',
      '[data-filter-number]',
      '[data-filter-date]',
      '[data-filter-date-start]',
      '[data-filter-date-end]'
    ].forEach((selector) => {
      const field = document.querySelector(selector);
      if (field) {
        field.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            applyFilters();
          }
        });
      }
    });

    window.addEventListener('popstate', () => {
      activeFilters = getFiltersFromUrl();
      setFilterState(activeFilters);
      filtered = papers.filter((paper) => matchesFilters(paper, activeFilters));
      activePage = Math.min(getPageFromUrl(), Math.max(1, Math.ceil(filtered.length / perPage)));
      renderPage(activePage);
    });

    renderPage(activePage);
  } catch (error) {
    grid.innerHTML = `<p>${error.message}</p>`;
    pagination.innerHTML = '';
    summary.textContent = 'Unable to display newspapers';
  }

  const yearMount = document.querySelector('[data-year]');
  if (yearMount) {
    yearMount.textContent = String(new Date().getFullYear());
  }
});
