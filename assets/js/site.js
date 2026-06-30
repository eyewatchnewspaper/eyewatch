async function fetchPapers() {
  const response = await fetch('data/newspapers.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load newspapers list.');
  }

  return response.json();
}

function cardTemplate(paper) {
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

function withBasePath(relativePath) {
  return new URL(relativePath, document.baseURI).href;
}

async function renderLatestOnHome() {
  const mount = document.querySelector('[data-latest-grid]');
  if (!mount) {
    return;
  }

  try {
    const payload = await fetchPapers();
    const latest = payload.items.slice(0, 4);

    if (latest.length === 0) {
      mount.innerHTML = '<p>No newspapers published yet.</p>';
      return;
    }

    mount.innerHTML = latest
      .map((paper) => cardTemplate({
        ...paper,
        pdfPath: withBasePath(paper.pdfPath),
        thumbPath: withBasePath(paper.thumbPath)
      }))
      .join('');
  } catch (error) {
    mount.innerHTML = `<p>${error.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderLatestOnHome();

  const yearMount = document.querySelector('[data-year]');
  if (yearMount) {
    yearMount.textContent = String(new Date().getFullYear());
  }
});
