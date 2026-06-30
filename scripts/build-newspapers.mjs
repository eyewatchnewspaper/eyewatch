import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const rootDir = process.cwd();
const newspapersDir = path.join(rootDir, "public", "newspapers");
const thumbsDir = path.join(newspapersDir, "thumbs");
const dataDir = path.join(rootDir, "data");
const outputDataFile = path.join(dataDir, "newspapers.json");

const filenamePattern = /^VOL\.\s*(\d+)\s+NO\.\s*(\d+)\s*-\s*(\d{4}-\d{2}-\d{2})\.pdf$/i;
const issueHeaderPattern = /VOL\.\s*(\d+)\s+NO\.\s*(\d+)\s*(?:[-–—:]\s*)?([A-Z]+\s+\d{1,2}(?:-\d{1,2})?,\s+\d{4})/i;
const filenameIsoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

const monthLookup = new Map([
  ["january", "01"],
  ["february", "02"],
  ["march", "03"],
  ["april", "04"],
  ["may", "05"],
  ["june", "06"],
  ["july", "07"],
  ["august", "08"],
  ["september", "09"],
  ["october", "10"],
  ["november", "11"],
  ["december", "12"]
]);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function encodeSegment(segment) {
  return encodeURIComponent(segment).replace(/%2F/g, "/");
}

function commandExists(command) {
  const checker = process.platform === "win32" ? "where" : "which";

  try {
    execFileSync(checker, [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function createFallbackThumb(filePath, title) {
  const escapedTitle = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#f5f1e8"/>
      <stop offset="100%" stop-color="#dfd4c1"/>
    </linearGradient>
  </defs>
  <rect width="900" height="1200" fill="url(#g)"/>
  <rect x="56" y="56" width="788" height="1088" rx="18" fill="#fffaf1" stroke="#c8baa3" stroke-width="4"/>
  <text x="90" y="180" fill="#2d2a26" font-size="62" font-family="Georgia, Times New Roman, serif" font-weight="700">EyeWatch</text>
  <text x="90" y="260" fill="#6a6258" font-size="30" font-family="Arial, sans-serif">Weekly Community Newspaper</text>
  <line x1="90" y1="300" x2="810" y2="300" stroke="#b9ad99" stroke-width="3"/>
  <text x="90" y="380" fill="#1f1d1a" font-size="38" font-family="Arial, sans-serif" font-weight="700">${escapedTitle}</text>
  <text x="90" y="460" fill="#6a6258" font-size="28" font-family="Arial, sans-serif">Thumbnail placeholder (install poppler for PDF preview)</text>
</svg>`;

  fs.writeFileSync(filePath, svg, "utf8");
}

function sanitizeIssueValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePdfDate(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const compactMatch = trimmed.match(/^D:(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }

  const isoMatch = trimmed.match(filenameIsoDatePattern);
  if (isoMatch) {
    return trimmed;
  }

  return null;
}

function normalizeDayRangeLabel(label) {
  return label.replace(/\s+/g, " ").trim();
}

function issueLabelToIsoStart(issueLabel) {
  if (!issueLabel) {
    return null;
  }

  const normalized = issueLabel.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^([A-Z]+)\s+(\d{1,2})(?:-(\d{1,2}))?,\s+(\d{4})$/i);

  if (!match) {
    return null;
  }

  const month = monthLookup.get(match[1].toLowerCase());
  if (!month) {
    return null;
  }

  const day = String(Number(match[2])).padStart(2, "0");
  const year = match[4];
  return `${year}-${month}-${day}`;
}

function formatIssueLabelFromText(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(issueHeaderPattern);
  if (!match) {
    return null;
  }

  return {
    volume: Number(match[1]),
    number: Number(match[2]),
    issueLabel: normalizeDayRangeLabel(match[3]),
    source: "pdf-text"
  };
}

function parsePdfInfo(info) {
  if (!info) {
    return null;
  }

  const publishDate = parsePdfDate(info.CreationDate) ?? parsePdfDate(info.ModDate);
  return {
    publishDate,
    pdfCreationDate: parsePdfDate(info.CreationDate),
    pdfModifiedDate: parsePdfDate(info.ModDate)
  };
}

function getYear(value) {
  const match = typeof value === "string" ? value.match(/^(\d{4})-/) : null;
  return match ? Number(match[1]) : null;
}

function reconcileDateWithFilename(extractedDate, filenameDate) {
  if (!extractedDate) {
    return filenameDate;
  }

  if (!filenameDate) {
    return extractedDate;
  }

  const extractedYear = getYear(extractedDate);
  const filenameYear = getYear(filenameDate);

  if (!extractedYear || !filenameYear) {
    return extractedDate;
  }

  const yearDelta = Math.abs(extractedYear - filenameYear);
  return yearDelta > 0 ? filenameDate : extractedDate;
}

function reconcileIssueLabelWithFilename(issueLabel, filenameDate) {
  if (!issueLabel) {
    return filenameDate;
  }

  const extractedYear = getYear(issueLabelToIsoStart(issueLabel) || "");
  const filenameYear = getYear(filenameDate);

  if (!extractedYear || !filenameYear) {
    return issueLabel;
  }

  return Math.abs(extractedYear - filenameYear) > 0 ? filenameDate : issueLabel;
}

async function extractIssueMetadataFromPdf(pdfAbsolutePath) {
  const data = new Uint8Array(fs.readFileSync(pdfAbsolutePath));
  const loadingTask = pdfjsLib.getDocument({ data, useWorkerFetch: false });
  const pdfDocument = await loadingTask.promise;
  const pagesToScan = Math.min(pdfDocument.numPages, 4);
  let combinedText = "";
  const pdfInfo = parsePdfInfo((await pdfDocument.getMetadata()).info);

  for (let pageNumber = 1; pageNumber <= pagesToScan; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => (typeof item.str === "string" ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    combinedText = `${combinedText} ${pageText}`.trim();

    const issue = formatIssueLabelFromText(combinedText);
    if (issue) {
      const issueDate = issueLabelToIsoStart(issue.issueLabel);

      return {
        ...issue,
        issueDate,
        publishDate: pdfInfo?.publishDate ?? issueDate,
        pdfCreationDate: pdfInfo?.pdfCreationDate ?? null,
        pdfModifiedDate: pdfInfo?.pdfModifiedDate ?? null
      };
    }
  }

  return pdfInfo;
}

function generateThumbWithPoppler(pdfAbsolutePath, outputBasePath) {
  execFileSync(
    "pdftoppm",
    ["-f", "1", "-singlefile", "-jpeg", "-jpegopt", "quality=86", pdfAbsolutePath, outputBasePath],
    { stdio: "ignore" }
  );
}

function resolveThumbPathForSlug(safeSlug) {
  const jpgRelative = `/public/newspapers/thumbs/${safeSlug}.jpg`;
  const svgRelative = `/public/newspapers/thumbs/${safeSlug}.svg`;

  const jpgAbsolute = path.join(thumbsDir, `${safeSlug}.jpg`);
  if (fs.existsSync(jpgAbsolute)) {
    return jpgRelative;
  }

  const svgAbsolute = path.join(thumbsDir, `${safeSlug}.svg`);
  if (fs.existsSync(svgAbsolute)) {
    return svgRelative;
  }

  return null;
}

function isThumbnailFresh(pdfAbsolutePath, thumbAbsolutePath) {
  if (!fs.existsSync(thumbAbsolutePath)) {
    return false;
  }

  const pdfMtime = fs.statSync(pdfAbsolutePath).mtimeMs;
  const thumbMtime = fs.statSync(thumbAbsolutePath).mtimeMs;
  return thumbMtime >= pdfMtime;
}

function cleanupOrphanThumbs(validSlugs) {
  if (!fs.existsSync(thumbsDir)) {
    return { removed: [] };
  }

  const removed = [];
  const thumbFiles = fs.readdirSync(thumbsDir);

  for (const fileName of thumbFiles) {
    const lower = fileName.toLowerCase();
    const isThumb = lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".svg");
    if (!isThumb) {
      continue;
    }

    const slug = fileName.replace(/\.(jpg|jpeg|svg)$/i, "");
    if (!validSlugs.has(slug)) {
      fs.unlinkSync(path.join(thumbsDir, fileName));
      removed.push(fileName);
    }
  }

  return { removed };
}

async function main() {
  ensureDir(newspapersDir);
  ensureDir(thumbsDir);
  ensureDir(dataDir);

  const files = fs
    .readdirSync(newspapersDir)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort();

  const hasPoppler = commandExists("pdftoppm");
  const ignored = [];
  const papers = [];
  let createdCount = 0;
  let reusedCount = 0;
  const validSlugs = new Set();

  for (const fileName of files) {
    const pdfAbsolutePath = path.join(newspapersDir, fileName);
    const extracted = await extractIssueMetadataFromPdf(pdfAbsolutePath);
    const fileMatch = fileName.match(filenamePattern);

    const fallbackVolume = fileMatch ? Number(fileMatch[1]) : null;
    const fallbackNumber = fileMatch ? Number(fileMatch[2]) : null;
    const fallbackDate = fileMatch ? fileMatch[3] : null;

    const volume = extracted?.volume ?? fallbackVolume;
    const number = extracted?.number ?? fallbackNumber;
    const issueDate = reconcileDateWithFilename(extracted?.issueDate, fallbackDate);
    const publishDate = reconcileDateWithFilename(extracted?.publishDate, fallbackDate);
    const sortDate = issueDate ?? publishDate ?? fallbackDate;
    const issueDateLabel = reconcileIssueLabelWithFilename(extracted?.issueLabel, fallbackDate);

    if (!volume || !number || !sortDate) {
      ignored.push(fileName);
      continue;
    }

    const title = `VOL. ${volume} NO. ${number}`;
    const displayDate = issueDateLabel ?? issueDate ?? publishDate ?? fallbackDate;
    const safeSlug = `vol-${volume}-no-${number}-${sortDate}`.toLowerCase();
    validSlugs.add(safeSlug);

    let thumbRelativePath = resolveThumbPathForSlug(safeSlug);
    const thumbAbsoluteJpg = path.join(thumbsDir, `${safeSlug}.jpg`);
    const thumbAbsoluteSvg = path.join(thumbsDir, `${safeSlug}.svg`);

    if (!thumbRelativePath || (thumbRelativePath.endsWith(".jpg") && !isThumbnailFresh(pdfAbsolutePath, thumbAbsoluteJpg))) {
      if (fs.existsSync(thumbAbsoluteJpg)) {
        fs.unlinkSync(thumbAbsoluteJpg);
      }

      if (fs.existsSync(thumbAbsoluteSvg)) {
        fs.unlinkSync(thumbAbsoluteSvg);
      }

      if (hasPoppler) {
        try {
          generateThumbWithPoppler(pdfAbsolutePath, thumbAbsoluteJpg.replace(/\.jpg$/i, ""));
          thumbRelativePath = `/public/newspapers/thumbs/${safeSlug}.jpg`;
        } catch {
          const fallbackSvgPath = path.join(thumbsDir, `${safeSlug}.svg`);
          createFallbackThumb(fallbackSvgPath, title);
          thumbRelativePath = `/public/newspapers/thumbs/${safeSlug}.svg`;
        }
      } else {
        createFallbackThumb(thumbAbsoluteSvg, title);
        thumbRelativePath = `/public/newspapers/thumbs/${safeSlug}.svg`;
      }

      createdCount += 1;
    } else {
      reusedCount += 1;

      const matchingSvg = path.join(thumbsDir, `${safeSlug}.svg`);
      const matchingJpg = path.join(thumbsDir, `${safeSlug}.jpg`);
      if (fs.existsSync(matchingSvg) && fs.existsSync(matchingJpg)) {
        fs.unlinkSync(matchingSvg);
      }
    }

    papers.push({
      title,
      volume,
      number,
      date: displayDate,
      issueDateLabel,
      issueDate,
      publishDate,
      sortDate,
      metadataConflict: Boolean(extracted?.issueDate && fallbackDate && getYear(extracted.issueDate) !== getYear(fallbackDate)),
      filename: fileName,
      pdfPath: `public/newspapers/${encodeSegment(fileName)}`,
      thumbPath: thumbRelativePath.replace(/^\//, ""),
      source: extracted ? extracted.source : "filename"
    });
  }

  const cleanupResult = cleanupOrphanThumbs(validSlugs);

  papers.sort((a, b) => {
    const byDate = new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime();
    if (byDate !== 0) {
      return byDate;
    }

    if (b.volume !== a.volume) {
      return b.volume - a.volume;
    }

    return b.number - a.number;
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    sourcePattern: "VOL. <volume> NO. <number> - YYYY-MM-DD.pdf",
    count: papers.length,
    ignoredFiles: ignored,
    thumbnailCleanupRemoved: cleanupResult.removed,
    items: papers
  };

  fs.writeFileSync(outputDataFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const status = hasPoppler
    ? "Generated newspaper index. Missing thumbnails were rendered from PDF first pages."
    : "Generated newspaper index. Missing thumbnails used SVG placeholders because poppler is not available.";

  console.log(status);
  console.log(`Newspapers indexed: ${papers.length}`);
  console.log(`Thumbnails reused: ${reusedCount}`);
  console.log(`Thumbnails created: ${createdCount}`);
  console.log(`Orphan thumbnails removed: ${cleanupResult.removed.length}`);
  if (ignored.length > 0) {
    console.log(`Ignored files (${ignored.length}): ${ignored.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
