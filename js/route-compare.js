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
        key: 'distanceKm',
        label: 'Distance',
        sortable: true,
        getValue: (activity) => activity.distanceKm || 0,
        render: (activity) => `${formatNumber(activity.distanceKm, 2)} km`
    },
    {
        key: 'avgSpeedKmh',
        label: 'Average Speed',
        sortable: true,
        getValue: (activity) => activity.avgSpeedKmh || 0,
        render: (activity) => `${formatNumber(activity.avgSpeedKmh, 1)} km/h`
    },
    {
        key: 'elevationGainM',
        label: 'Elevation Gain',
        sortable: true,
        getValue: (activity) => activity.elevationGainM || 0,
        render: (activity) => `${formatNumber(activity.elevationGainM, 0)} m`
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
        key: 'avgPower',
        label: 'Average Power',
        sortable: true,
        getValue: (activity) => activity.avgPower || 0,
        render: (activity) => activity.avgPower !== null ? `${formatNumber(activity.avgPower, 0)} W` : '-'
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

export class RouteComparisonTable {
    constructor({ tableElement, emptyStateElement, onSelect }) {
        this.tableElement = tableElement;
        this.thead = tableElement.querySelector('thead');
        this.tbody = tableElement.querySelector('tbody');
        this.emptyStateElement = emptyStateElement;
        this.onSelect = onSelect;

        this.activities = [];
        this.selectedActivityId = null;
        this.sortKey = 'startTime';
        this.sortDirection = 'desc';

        this.renderHeader();
        this.renderBody();
    }

    setComparisonActivities(activities) {
        this.activities = Array.isArray(activities) ? [...activities] : [];
        if (!this.activities.some((activity) => activity.id === this.selectedActivityId)) {
            this.selectedActivityId = this.activities[0]?.id || null;
        }
        this.render();
    }

    setSelectedActivity(activityId) {
        this.selectedActivityId = activityId;
        this.renderBody();
    }

    render() {
        this.renderHeader();
        this.renderBody();
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

        this.renderBody();
    }

    getSortedActivities() {
        const sortColumn = COLUMNS.find((column) => column.key === this.sortKey) || COLUMNS[0];

        return [...this.activities].sort((activityA, activityB) => {
            const comparison = compareValues(sortColumn.getValue(activityA), sortColumn.getValue(activityB));
            return this.sortDirection === 'asc' ? comparison : -comparison;
        });
    }

    renderBody() {
        const sortedActivities = this.getSortedActivities();

        this.emptyStateElement.hidden = sortedActivities.length > 0;
        this.tableElement.hidden = sortedActivities.length === 0;

        if (!sortedActivities.length) {
            this.tbody.replaceChildren();
            return;
        }

        const rows = sortedActivities.map((activity) => {
            const row = document.createElement('tr');
            row.tabIndex = 0;
            row.dataset.activityId = activity.id;

            if (activity.id === this.selectedActivityId) {
                row.classList.add('selected');
            }

            row.addEventListener('click', () => {
                this.selectedActivityId = activity.id;
                this.onSelect?.(activity);
                this.renderBody();
            });

            row.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.selectedActivityId = activity.id;
                    this.onSelect?.(activity);
                    this.renderBody();
                }
            });

            for (const column of COLUMNS) {
                const cell = document.createElement('td');
                cell.textContent = column.render(activity);
                row.append(cell);
            }

            return row;
        });

        this.tbody.replaceChildren(...rows);
    }
}
