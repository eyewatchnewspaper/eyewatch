# EyeWatch Newspaper Website

Static newspaper website for GitHub Pages with automated PDF scanning, sorting, and thumbnail generation.

## Features

- Landing page with hero, latest 4 issues, inspirational section, and About CTA
- Newspaper archive page in card grid view
- Sort newspapers by date descending from PDF filenames
- Pagination: 20 cards per page, 4 cards per row on desktop
- Contact page with large social icons and contact details
- About page with objective, mission/vision, history, and staff roles
- Build-time scan of `public/newspapers/*.pdf`
- Build-time PDF text scan for volume, number, and publish date when available
- Generated issue metadata is written into `data/newspapers.json` for fast page loading

## Supported PDF filename format

```text
VOL. 7 NO. 43 - 2025-12-08.pdf
```

Pattern used:

```text
VOL. <volume> NO. <number> - YYYY-MM-DD.pdf
```

## Local development

1. Install Node.js 20+
2. Install dependencies:

```bash
npm install
```

3. Build newspaper data (+ thumbnails when poppler is installed):

```bash
npm run build
```

4. Preview static site:

```bash
npm run preview
```

Open: `http://localhost:3000` (or the port shown by `serve`).

## Thumbnail generation notes

- The build script uses `pdftoppm` from poppler to render first-page thumbnails.
- If poppler is not installed locally, the script falls back to generated SVG placeholder thumbnails.
- GitHub Actions workflow installs poppler so production builds generate real PDF thumbnails.
- The build script also scans PDF text for issue metadata and falls back to the filename when the PDF text is incomplete.
- Orphan thumbnails in `public/newspapers/thumbs` are deleted automatically during build.
- The generated JSON stores `issueDateLabel`, `issueDate`, `publishDate`, and `sortDate` for reuse.

## Deployment

- Push to `main`.
- GitHub Actions workflow `.github/workflows/deploy.yml` builds and deploys to GitHub Pages.
- Keep your `CNAME` file in the repository root if you use a custom domain.

## Output artifacts

- `data/newspapers.json` (generated)
- `public/newspapers/thumbs/*` (generated)
