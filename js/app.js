import { ActivityDatabase, formatDate, formatDuration, formatNumber } from './database.js';
import { parseFitFile } from './parser-fit.js';
import { parseGpxFile } from './parser-gpx.js';
import { ActivityTable } from './table.js';
import { DetailView } from './detail.js';

const database = new ActivityDatabase();
const PROJECT_ACTIVITIES_DIR = './activities/';
const PROJECT_MANIFEST_URL = './activities-manifest.json';
const CACHE_DB_NAME = 'sportviewer-cache';
const CACHE_STORE_NAME = 'datasets';
const CACHE_DATASET_KEY = 'project-activities';

const elements = {
    reloadProjectButton: document.getElementById('reloadProjectButton'),
    normalizedInput: document.getElementById('normalizedInput'),
    saveNormalizedButton: document.getElementById('saveNormalizedButton'),
    resetButton: document.getElementById('resetButton'),
    loadingStatus: document.getElementById('loadingStatus'),
    loadingMeta: document.getElementById('loadingMeta'),
    loadingProgress: document.getElementById('loadingProgress'),
    loadingPercent: document.getElementById('loadingPercent'),
    overviewList: document.getElementById('overviewList'),
    loadNotes: document.getElementById('loadNotes'),
    diagnosticsSummary: document.getElementById('diagnosticsSummary'),
    problemTableBody: document.querySelector('#problemTable tbody'),
    summaryValues: {
        activitiesLoaded: document.querySelector('[data-summary="activitiesLoaded"]'),
        fitFiles: document.querySelector('[data-summary="fitFiles"]'),
        gpxFiles: document.querySelector('[data-summary="gpxFiles"]'),
        withGps: document.querySelector('[data-summary="withGps"]'),
        withHr: document.querySelector('[data-summary="withHr"]'),
        withCadence: document.querySelector('[data-summary="withCadence"]'),
        withPower: document.querySelector('[data-summary="withPower"]'),
        dateRange: document.querySelector('[data-summary="dateRange"]')
    },
    tabs: Array.from(document.querySelectorAll('.tab-button')),
    panels: Array.from(document.querySelectorAll('.view-panel')),
    searchInput: document.getElementById('searchInput'),
    yearFilter: document.getElementById('yearFilter'),
    sportFilter: document.getElementById('sportFilter'),
    activityTable: document.getElementById('activityTable'),
    prevPageButton: document.getElementById('prevPageButton'),
    nextPageButton: document.getElementById('nextPageButton'),
    pageInfo: document.getElementById('pageInfo'),
    detailTitle: document.getElementById('detailTitle'),
    detailFormatBadge: document.getElementById('detailFormatBadge'),
    detailSummary: document.getElementById('detailSummary'),
    mapContainer: document.getElementById('mapContainer'),
    mapEmptyState: document.getElementById('mapEmptyState'),
    chartsContainer: document.getElementById('chartsContainer'),
    chartsEmptyState: document.getElementById('chartsEmptyState')
};

const detailView = new DetailView({
    titleElement: elements.detailTitle,
    formatBadgeElement: elements.detailFormatBadge,
    summaryElement: elements.detailSummary,
    mapContainer: elements.mapContainer,
    mapEmptyState: elements.mapEmptyState,
    chartsContainer: elements.chartsContainer,
    chartsEmptyState: elements.chartsEmptyState
});

const activityTable = new ActivityTable({
    tableElement: elements.activityTable,
    searchInput: elements.searchInput,
    yearFilter: elements.yearFilter,
    sportFilter: elements.sportFilter,
    prevPageButton: elements.prevPageButton,
    nextPageButton: elements.nextPageButton,
    pageInfoElement: elements.pageInfo,
    onSelect: (activity) => {
        detailView.render(activity);
    }
});

function setActiveView(viewName) {
    for (const tab of elements.tabs) {
        tab.classList.toggle('active', tab.dataset.view === viewName);
    }

    for (const panel of elements.panels) {
        panel.classList.toggle('active', panel.dataset.panel === viewName);
    }

    requestAnimationFrame(() => detailView.map.invalidateSize());
}

function setLoadingState(status, meta, progressPercent = 0) {
    const safeProgress = Math.max(0, Math.min(100, Math.round(progressPercent)));
    elements.loadingStatus.textContent = status;
    elements.loadingMeta.textContent = meta;
    elements.loadingProgress.value = safeProgress;
    elements.loadingPercent.textContent = `${safeProgress}%`;
}

function metricRow(label, value) {
    const dt = document.createElement('dt');
    dt.textContent = label;

    const dd = document.createElement('dd');
    dd.textContent = value;

    return [dt, dd];
}

function renderLoadNotes() {
    const notes = database.loadNotes;
    if (!notes.length) {
        elements.loadNotes.className = 'notes-list empty-state-text';
        elements.loadNotes.textContent = 'No load notes available.';
        return;
    }

    const list = document.createElement('ul');
    list.className = 'notes-list';

    for (const note of notes) {
        const item = document.createElement('li');
        item.textContent = note;
        list.append(item);
    }

    elements.loadNotes.className = '';
    elements.loadNotes.replaceChildren(list);
}

function renderSummary() {
    const summary = database.getSummary();
    elements.summaryValues.activitiesLoaded.textContent = String(summary.activitiesLoaded);
    elements.summaryValues.fitFiles.textContent = String(summary.fitFiles);
    elements.summaryValues.gpxFiles.textContent = String(summary.gpxFiles);
    elements.summaryValues.withGps.textContent = String(summary.withGps);
    elements.summaryValues.withHr.textContent = String(summary.withHr);
    elements.summaryValues.withCadence.textContent = String(summary.withCadence);
    elements.summaryValues.withPower.textContent = String(summary.withPower);
    elements.summaryValues.dateRange.textContent = summary.earliest && summary.latest
        ? `${formatDate(summary.earliest)} → ${formatDate(summary.latest)}`
        : '-';

    const overviewRows = [
        metricRow('Activities loaded', String(summary.activitiesLoaded)),
        metricRow('FIT files', String(summary.fitFiles)),
        metricRow('GPX files', String(summary.gpxFiles)),
        metricRow('Activities with GPS', String(summary.withGps)),
        metricRow('Activities with heart rate', String(summary.withHr)),
        metricRow('Activities with cadence', String(summary.withCadence)),
        metricRow('Activities with power', String(summary.withPower)),
        metricRow('Date range', summary.earliest && summary.latest ? `${formatDate(summary.earliest)} → ${formatDate(summary.latest)}` : '-'),
        metricRow('Total distance', `${formatNumber(database.getActivities().reduce((sum, activity) => sum + (activity.distanceKm || 0), 0), 1)} km`),
        metricRow('Total duration', formatDuration(database.getActivities().reduce((sum, activity) => sum + (activity.durationSec || 0), 0)))
    ];

    elements.overviewList.replaceChildren(...overviewRows.flat());
    renderLoadNotes();
}

function renderDiagnostics() {
    const diagnostics = database.getDiagnostics();
    const summaryRows = [
        metricRow('Total activities', String(diagnostics.summary.totalActivities)),
        metricRow('FIT activities', String(diagnostics.summary.fitActivities)),
        metricRow('GPX activities', String(diagnostics.summary.gpxActivities)),
        metricRow('Activities with GPS', String(diagnostics.summary.activitiesWithGps)),
        metricRow('Activities with HR', String(diagnostics.summary.activitiesWithHr)),
        metricRow('Activities with cadence', String(diagnostics.summary.activitiesWithCadence)),
        metricRow('Activities with power', String(diagnostics.summary.activitiesWithPower)),
        metricRow('Activities missing timestamps', String(diagnostics.summary.activitiesMissingTimestamps)),
        metricRow('Activities missing elevation', String(diagnostics.summary.activitiesMissingElevation)),
        metricRow('Activities with parsing errors', String(diagnostics.summary.parsingErrors))
    ];

    elements.diagnosticsSummary.replaceChildren(...summaryRows.flat());

    if (!diagnostics.problematicFiles.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 3;
        cell.className = 'empty-cell';
        cell.textContent = 'No problematic files detected in the current dataset.';
        row.append(cell);
        elements.problemTableBody.replaceChildren(row);
        return;
    }

    const rows = diagnostics.problematicFiles.map((problem) => {
        const row = document.createElement('tr');
        const filenameCell = document.createElement('td');
        const issueCell = document.createElement('td');
        const sourceCell = document.createElement('td');
        filenameCell.textContent = problem.filename || 'Unknown file';
        issueCell.textContent = problem.issue || 'Unknown issue';
        sourceCell.textContent = String(problem.source || '-').toUpperCase();
        row.append(filenameCell, issueCell, sourceCell);
        return row;
    });

    elements.problemTableBody.replaceChildren(...rows);
}

function renderActivities() {
    const activities = database.getActivities();
    activityTable.updateFilterOptions({
        years: database.getAvailableYears(),
        sports: database.getAvailableSports()
    });
    activityTable.setActivities(activities);

    if (activities.length) {
        activityTable.setSelectedActivity(activities[0].id);
        detailView.render(activities[0]);
    } else {
        detailView.reset();
    }
}

function renderAll() {
    renderSummary();
    renderDiagnostics();
    renderActivities();
    elements.saveNormalizedButton.disabled = !database.getActivities().length;
}

function getFileFormat(filename) {
    const lowerFilename = String(filename || '').toLowerCase();
    if (lowerFilename.endsWith('.fit')) {
        return 'fit';
    }
    if (lowerFilename.endsWith('.gpx')) {
        return 'gpx';
    }

    return null;
}

function createProjectSourceFile(filename) {
    return {
        filename,
        sourceFormat: getFileFormat(filename),
        async readText() {
            const response = await fetch(`${PROJECT_ACTIVITIES_DIR}${encodeURIComponent(filename)}`, {
                cache: 'no-store'
            });
            if (!response.ok) {
                throw new Error(`Unable to fetch ${filename}`);
            }

            return response.text();
        },
        async readArrayBuffer() {
            const response = await fetch(`${PROJECT_ACTIVITIES_DIR}${encodeURIComponent(filename)}`, {
                cache: 'no-store'
            });
            if (!response.ok) {
                throw new Error(`Unable to fetch ${filename}`);
            }

            return response.arrayBuffer();
        }
    };
}

function openCacheDatabase() {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(CACHE_DB_NAME, 1);

        request.onerror = () => reject(request.error || new Error('Unable to open browser cache'));
        request.onupgradeneeded = () => {
            const databaseInstance = request.result;
            if (!databaseInstance.objectStoreNames.contains(CACHE_STORE_NAME)) {
                databaseInstance.createObjectStore(CACHE_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
    });
}

async function withCacheStore(mode, operation) {
    const cacheDatabase = await openCacheDatabase();

    return new Promise((resolve, reject) => {
        const transaction = cacheDatabase.transaction(CACHE_STORE_NAME, mode);
        const store = transaction.objectStore(CACHE_STORE_NAME);

        let request;
        try {
            request = operation(store);
        } catch (error) {
            cacheDatabase.close();
            reject(error);
            return;
        }

        transaction.oncomplete = () => {
            cacheDatabase.close();
            resolve(request?.result);
        };
        transaction.onerror = () => {
            cacheDatabase.close();
            reject(transaction.error || request?.error || new Error('Browser cache transaction failed'));
        };
        transaction.onabort = () => {
            cacheDatabase.close();
            reject(transaction.error || new Error('Browser cache transaction aborted'));
        };
    });
}

async function loadCachedDataset() {
    try {
        return await withCacheStore('readonly', (store) => store.get(CACHE_DATASET_KEY));
    } catch {
        return null;
    }
}

async function clearCachedDataset() {
    try {
        await withCacheStore('readwrite', (store) => store.delete(CACHE_DATASET_KEY));
    } catch {
        return;
    }
}

async function saveCachedDataset(payload) {
    await withCacheStore('readwrite', (store) => store.put(payload, CACHE_DATASET_KEY));
}

function buildSourceFilesFromProjectFiles(filenames) {
    return filenames
        .filter((filename) => getFileFormat(filename))
        .map((filename) => createProjectSourceFile(filename));
}

function extractProjectFilenamesFromDirectoryListing(htmlText) {
    const parser = new DOMParser();
    const htmlDocument = parser.parseFromString(htmlText, 'text/html');
    const hrefs = Array.from(htmlDocument.querySelectorAll('a'))
        .map((anchor) => anchor.getAttribute('href') || '');

    const filenames = hrefs
        .map((href) => {
            const normalizedHref = href.split('?')[0].split('#')[0];
            const decodedHref = decodeURIComponent(normalizedHref);
            return decodedHref.replace(/^\.?\/?activities\//i, '').replace(/^\.?\//, '');
        })
        .filter((href) => href && !href.endsWith('/') && getFileFormat(href));

    return [...new Set(filenames)].sort((nameA, nameB) => nameA.localeCompare(nameB, undefined, {
        numeric: true,
        sensitivity: 'base'
    }));
}

async function discoverProjectFilesFromManifest() {
    try {
        const response = await fetch(PROJECT_MANIFEST_URL, {
            cache: 'no-store'
        });
        if (!response.ok) {
            return [];
        }

        const payload = await response.json();
        const files = Array.isArray(payload) ? payload : payload?.files;
        return Array.isArray(files)
            ? files.filter((filename) => getFileFormat(filename))
            : [];
    } catch {
        return [];
    }
}

async function discoverProjectFilesFromDirectoryListing() {
    const response = await fetch(PROJECT_ACTIVITIES_DIR, {
        cache: 'no-store'
    });
    if (!response.ok) {
        throw new Error('Unable to access the project activities folder');
    }

    const htmlText = await response.text();
    const filenames = extractProjectFilenamesFromDirectoryListing(htmlText);
    if (!filenames.length) {
        throw new Error('No FIT or GPX files were discovered in the project activities folder');
    }

    return filenames;
}

async function buildProjectSourceFiles() {
    const manifestFiles = await discoverProjectFilesFromManifest();
    const projectFiles = manifestFiles.length
        ? manifestFiles
        : await discoverProjectFilesFromDirectoryListing();

    return buildSourceFilesFromProjectFiles(projectFiles);
}

async function parseSourceFiles(sourceFiles, sourceLabel) {
    if (!sourceFiles.length) {
        throw new Error('No FIT or GPX files were found in the selected source');
    }

    setLoadingState('Preparing import...', `Found ${sourceFiles.length} supported files in ${sourceLabel}.`, 2);

    const activities = [];
    const parsingErrors = [];
    const loadNotes = [
        `Imported ${sourceFiles.length} activity files from ${sourceLabel}`
    ];

    for (let index = 0; index < sourceFiles.length; index += 1) {
        const sourceFile = sourceFiles[index];
        const progressPercent = ((index + 1) / sourceFiles.length) * 100;

        try {
            setLoadingState(
                `Parsing ${index + 1} of ${sourceFiles.length}`,
                sourceFile.filename,
                progressPercent
            );

            const activity = sourceFile.sourceFormat === 'fit'
                ? await parseFitFile({
                    filename: sourceFile.filename,
                    arrayBuffer: await sourceFile.readArrayBuffer()
                })
                : await parseGpxFile({
                    filename: sourceFile.filename,
                    text: await sourceFile.readText()
                });

            activities.push(activity);
        } catch (error) {
            parsingErrors.push({
                filename: sourceFile.filename,
                issue: error?.message || 'Unknown parsing error',
                source: sourceFile.sourceFormat
            });
        }

        if ((index + 1) % 10 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    database.replaceAll(activities, {
        parsingErrors,
        loadNotes
    });

    renderAll();
    setLoadingState(
        'Import complete',
        `Loaded ${activities.length} activities with ${parsingErrors.length} parsing errors from ${sourceLabel}.`,
        100
    );

    return database.serialize();
}

async function loadProjectActivities() {
    elements.reloadProjectButton.disabled = true;

    try {
        setLoadingState('Resetting cached dataset...', 'Removing any previous cached activity database before import.', 1);
        await clearCachedDataset();
        const sourceFiles = await buildProjectSourceFiles();
        const serializedPayload = await parseSourceFiles(sourceFiles, 'project activities folder');
        await saveCachedDataset(serializedPayload);
        setLoadingState('Import complete', `Loaded ${database.getActivities().length} activities and refreshed the local browser cache.`, 100);
        setActiveView('dashboard');
    } finally {
        elements.reloadProjectButton.disabled = false;
    }
}

async function loadNormalizedDataset(file) {
    setLoadingState('Loading normalized dataset...', file.name, 15);
    const rawText = await file.text();
    const payload = JSON.parse(rawText);
    database.loadNormalizedDataset(payload);
    renderAll();
    setLoadingState('Normalized dataset loaded', `Loaded ${database.getActivities().length} activities from ${file.name}.`, 100);
}

function downloadNormalizedDataset() {
    const serialized = JSON.stringify(database.serialize(), null, 2);
    const blob = new Blob([serialized], {
        type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `activities-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function resetApplication() {
    database.reset();
    activityTable.setActivities([]);
    detailView.reset();
    renderSummary();
    renderDiagnostics();
    elements.saveNormalizedButton.disabled = true;
    setLoadingState('No dataset loaded.', 'Load the cached dataset by refreshing the page, or import the project `activities` folder again.', 0);
    elements.normalizedInput.value = '';
}

function bindEvents() {
    for (const tab of elements.tabs) {
        tab.addEventListener('click', () => setActiveView(tab.dataset.view));
    }

    elements.reloadProjectButton.addEventListener('click', async () => {
        try {
            await loadProjectActivities();
        } catch (error) {
            setLoadingState('Auto-load failed', error?.message || 'Unable to load project activities.', 0);
        }
    });

    elements.normalizedInput.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        try {
            await loadNormalizedDataset(file);
            setActiveView('dashboard');
        } catch (error) {
            setLoadingState('Load failed', error?.message || 'Unable to load normalized dataset.', 0);
        } finally {
            event.target.value = '';
        }
    });

    elements.saveNormalizedButton.addEventListener('click', () => {
        if (database.getActivities().length) {
            downloadNormalizedDataset();
        }
    });

    elements.resetButton.addEventListener('click', () => {
        resetApplication();
        setActiveView('dashboard');
    });
}

async function initializeApplication() {
    bindEvents();
    renderAll();
    setActiveView('dashboard');
    setLoadingState('Checking local cache.', 'Looking for a previously imported dataset in this browser.', 5);

    try {
        const cachedPayload = await loadCachedDataset();
        if (!cachedPayload) {
            setLoadingState('No cached dataset.', 'Click `Import Project Activities` to build and cache the dataset for this browser.', 0);
            return;
        }

        database.loadNormalizedDataset(cachedPayload);
        renderAll();
        setLoadingState('Loaded cached dataset.', `Loaded ${database.getActivities().length} activities from the local browser cache.`, 100);
    } catch (error) {
        setLoadingState('Cache load failed', error?.message || 'Unable to load the cached dataset from this browser.', 0);
    }
}

initializeApplication();
