import { formatDate, formatDuration, formatNumber, getActivityName } from './database.js';

const COLUMNS = [
    {
        key: 'startTime',
        label: 'Date',
        sortable: true,
        getValue: (activity) => activity.startTime instanceof Date ? activity.startTime.getTime() : 0,
        render: (activity) => formatDate(activity.startTime)
    },
    {
        key: 'name',
        label: 'Name',
        sortable: true,
        getValue: (activity) => getActivityName(activity),
        render: (activity) => getActivityName(activity)
    },
    {
        key: 'sport',
        label: 'Activity Type',
        sortable: true,
        getValue: (activity) => activity.sport || '',
        render: (activity) => activity.sport || '-'
    },
    {
        key: 'distanceKm',
        label: 'Distance',
        sortable: true,
        getValue: (activity) => activity.distanceKm || 0,
        render: (activity) => `${formatNumber(activity.distanceKm, 2)} km`
    },
    {
        key: 'durationSec',
        label: 'Duration',
        sortable: true,
        getValue: (activity) => activity.durationSec || 0,
        render: (activity) => formatDuration(activity.durationSec)
    },
    {
        key: 'movingTimeSec',
        label: 'Moving Time',
        sortable: true,
        getValue: (activity) => activity.movingTimeSec || 0,
        render: (activity) => formatDuration(activity.movingTimeSec)
    },
    {
        key: 'elevationGainM',
        label: 'Elevation Gain',
        sortable: true,
        getValue: (activity) => activity.elevationGainM || 0,
        render: (activity) => `${formatNumber(activity.elevationGainM, 0)} m`
    },
    {
        key: 'avgSpeedKmh',
        label: 'Average Speed',
        sortable: true,
        getValue: (activity) => activity.avgSpeedKmh || 0,
        render: (activity) => `${formatNumber(activity.avgSpeedKmh, 1)} km/h`
    },
    {
        key: 'maxSpeedKmh',
        label: 'Maximum Speed',
        sortable: true,
        getValue: (activity) => activity.maxSpeedKmh || 0,
        render: (activity) => `${formatNumber(activity.maxSpeedKmh, 1)} km/h`
    },
    {
        key: 'avgHeartRate',
        label: 'Average Heart Rate',
        sortable: true,
        getValue: (activity) => activity.avgHeartRate || 0,
        render: (activity) => activity.avgHeartRate !== null ? `${formatNumber(activity.avgHeartRate, 0)} bpm` : '-'
    },
    {
        key: 'avgCadence',
        label: 'Average Cadence',
        sortable: true,
        getValue: (activity) => activity.avgCadence || 0,
        render: (activity) => activity.avgCadence !== null ? `${formatNumber(activity.avgCadence, 0)} rpm` : '-'
    },
    {
        key: 'sourceFormat',
        label: 'Source Format',
        sortable: true,
        getValue: (activity) => activity.sourceFormat || '',
        render: (activity) => String(activity.sourceFormat || '-').toUpperCase()
    },
    {
        key: 'filename',
        label: 'Filename',
        sortable: true,
        getValue: (activity) => activity.filename || '',
        render: (activity) => activity.filename || '-'
    }
];

function compareValues(valueA, valueB) {
    if (typeof valueA === 'string' || typeof valueB === 'string') {
        return String(valueA).localeCompare(String(valueB), undefined, {
            numeric: true,
            sensitivity: 'base'
        });
    }

    return (valueA || 0) - (valueB || 0);
}

function preserveWindowScroll(callback) {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    callback();

    requestAnimationFrame(() => {
        window.scrollTo(scrollX, scrollY);
    });
}

export class ActivityTable {
    constructor({ tableElement, searchInput, yearFilter, sportFilter, prevPageButton, nextPageButton, pageInfoElement, onSelect, onRouteGroupSelect }) {
        this.tableElement = tableElement;
        this.thead = tableElement.querySelector('thead');
        this.tbody = tableElement.querySelector('tbody');
        this.searchInput = searchInput;
        this.yearFilter = yearFilter;
        this.sportFilter = sportFilter;
        this.prevPageButton = prevPageButton;
        this.nextPageButton = nextPageButton;
        this.pageInfoElement = pageInfoElement;
        this.onSelect = onSelect;
        this.onRouteGroupSelect = onRouteGroupSelect;

        this.activities = [];
        this.filteredActivities = [];
        this.selectedActivityId = null;
        this.pageSize = 25;
        this.currentPage = 1;
        this.sortKey = 'startTime';
        this.sortDirection = 'desc';

        this.bindEvents();
        this.renderHeader();
        this.renderBody();
    }

    bindEvents() {
        this.searchInput.addEventListener('input', () => {
            this.currentPage = 1;
            this.render();
        });

        this.yearFilter.addEventListener('change', () => {
            this.currentPage = 1;
            this.render();
        });

        this.sportFilter.addEventListener('change', () => {
            this.currentPage = 1;
            this.render();
        });

        this.prevPageButton.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage -= 1;
                this.renderBody();
            }
        });

        this.nextPageButton.addEventListener('click', () => {
            const totalPages = this.getTotalPages();
            if (this.currentPage < totalPages) {
                this.currentPage += 1;
                this.renderBody();
            }
        });
    }

    setActivities(activities) {
        this.activities = Array.isArray(activities) ? [...activities] : [];
        this.currentPage = 1;
        this.render();
    }

    setSelectedActivity(activityId) {
        this.selectedActivityId = activityId;
        this.renderBody();
    }

    updateFilterOptions({ years, sports }) {
        const currentYear = this.yearFilter.value;
        const currentSport = this.sportFilter.value;

        this.yearFilter.innerHTML = '<option value="all">All years</option>';
        for (const year of years) {
            const option = document.createElement('option');
            option.value = String(year);
            option.textContent = String(year);
            this.yearFilter.append(option);
        }

        this.sportFilter.innerHTML = '<option value="all">All types</option>';
        for (const sport of sports) {
            const option = document.createElement('option');
            option.value = sport;
            option.textContent = sport;
            this.sportFilter.append(option);
        }

        this.yearFilter.value = years.map(String).includes(currentYear) ? currentYear : 'all';
        this.sportFilter.value = sports.includes(currentSport) ? currentSport : 'all';
    }

    render() {
        this.filteredActivities = this.getFilteredAndSortedActivities();
        const totalPages = this.getTotalPages();
        this.currentPage = Math.min(this.currentPage, totalPages);
        this.renderHeader();
        this.renderBody();
    }

    renderNameCellContent(activity) {
        const wrapper = document.createElement('div');
        wrapper.className = 'activity-name-cell';

        const nameText = document.createElement('span');
        nameText.textContent = getActivityName(activity);
        wrapper.append(nameText);

        const routeGroupSize = Math.max(1, Number(activity.routeGroupSize) || 1);
        if (routeGroupSize > 1) {
            const routeCountButton = document.createElement('button');
            routeCountButton.type = 'button';
            routeCountButton.className = 'route-count-button';
            routeCountButton.textContent = `(${routeGroupSize})`;
            routeCountButton.setAttribute('aria-label', `Compare ${routeGroupSize} activities on this route`);
            routeCountButton.addEventListener('click', (event) => {
                event.stopPropagation();
                preserveWindowScroll(() => {
                    this.selectedActivityId = activity.id;
                    this.onSelect?.(activity);
                    this.onRouteGroupSelect?.(activity);
                    this.renderBody();
                });
            });
            wrapper.append(document.createTextNode(' '), routeCountButton);
            return wrapper;
        }

        const routeCountText = document.createElement('span');
        routeCountText.className = 'route-count-text';
        routeCountText.textContent = `(${routeGroupSize})`;
        wrapper.append(document.createTextNode(' '), routeCountText);
        return wrapper;
    }

    renderHeader() {
        const row = document.createElement('tr');

        for (const column of COLUMNS) {
            const th = document.createElement('th');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'sort-button';
            button.textContent = column.label;
            button.dataset.key = column.key;

            if (column.sortable) {
                if (this.sortKey === column.key) {
                    button.dataset.direction = this.sortDirection;
                }
                button.addEventListener('click', () => this.handleSort(column.key));
            } else {
                button.disabled = true;
            }

            th.append(button);
            row.append(th);
        }

        this.thead.replaceChildren(row);
    }

    handleSort(columnKey) {
        if (this.sortKey === columnKey) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortKey = columnKey;
            this.sortDirection = columnKey === 'startTime' ? 'desc' : 'asc';
        }

        this.currentPage = 1;
        this.render();
    }

    getFilteredAndSortedActivities() {
        const query = this.searchInput.value.trim().toLowerCase();
        const selectedYear = this.yearFilter.value;
        const selectedSport = this.sportFilter.value;
        const sortColumn = COLUMNS.find((column) => column.key === this.sortKey) || COLUMNS[0];

        const filtered = this.activities.filter((activity) => {
            if (selectedYear !== 'all') {
                const activityYear = activity.startTime instanceof Date ? String(activity.startTime.getFullYear()) : '';
                if (activityYear !== selectedYear) {
                    return false;
                }
            }

            if (selectedSport !== 'all' && activity.sport !== selectedSport) {
                return false;
            }

            if (!query) {
                return true;
            }

            const searchHaystack = [
                getActivityName(activity),
                activity.filename,
                activity.sport,
                activity.sourceFormat,
                activity.startTime instanceof Date ? activity.startTime.toISOString() : ''
            ].join(' ').toLowerCase();

            return searchHaystack.includes(query);
        });

        return filtered.sort((activityA, activityB) => {
            const comparison = compareValues(sortColumn.getValue(activityA), sortColumn.getValue(activityB));
            return this.sortDirection === 'asc' ? comparison : -comparison;
        });
    }

    getTotalPages() {
        return Math.max(1, Math.ceil(this.filteredActivities.length / this.pageSize));
    }

    renderBody() {
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const pageActivities = this.filteredActivities.slice(startIndex, startIndex + this.pageSize);
        const rows = [];

        if (!pageActivities.length) {
            const emptyRow = document.createElement('tr');
            const emptyCell = document.createElement('td');
            emptyCell.colSpan = COLUMNS.length;
            emptyCell.className = 'empty-cell';
            emptyCell.textContent = 'No activities match the current filters.';
            emptyRow.append(emptyCell);
            rows.push(emptyRow);
        }

        for (const activity of pageActivities) {
            const row = document.createElement('tr');
            row.tabIndex = 0;
            row.dataset.activityId = activity.id;
            if (activity.id === this.selectedActivityId) {
                row.classList.add('selected');
            }

            row.addEventListener('click', () => {
                preserveWindowScroll(() => {
                    this.selectedActivityId = activity.id;
                    this.onSelect?.(activity);
                    this.renderBody();
                });
            });

            row.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    preserveWindowScroll(() => {
                        this.selectedActivityId = activity.id;
                        this.onSelect?.(activity);
                        this.renderBody();
                    });
                }
            });

            for (const column of COLUMNS) {
                const cell = document.createElement('td');
                if (column.key === 'name') {
                    cell.append(this.renderNameCellContent(activity));
                } else {
                    cell.textContent = column.render(activity);
                }
                row.append(cell);
            }

            rows.push(row);
        }

        this.tbody.replaceChildren(...rows);

        const totalPages = this.getTotalPages();
        this.pageInfoElement.textContent = `Page ${this.currentPage} of ${totalPages}`;
        this.prevPageButton.disabled = this.currentPage <= 1;
        this.nextPageButton.disabled = this.currentPage >= totalPages;
    }
}
