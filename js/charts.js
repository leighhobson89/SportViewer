function createChartCard(title) {
    const card = document.createElement('article');
    card.className = 'chart-card';

    const heading = document.createElement('h4');
    heading.textContent = title;

    const canvas = document.createElement('canvas');

    card.append(heading, canvas);
    return { card, canvas };
}

function createLineChart(canvas, title, labels, values, yLabel, color) {
    return new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: title,
                data: values,
                borderColor: color,
                backgroundColor: `${color}22`,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.15,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxTicksLimit: 8
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: yLabel
                    }
                }
            }
        }
    });
}

function formatElapsedMinutes(point) {
    const elapsedMinutes = (point.elapsedSec ?? 0) / 60;
    return elapsedMinutes.toLocaleString(undefined, {
        maximumFractionDigits: elapsedMinutes >= 60 ? 0 : 1,
        minimumFractionDigits: 0
    });
}

function formatDistanceKm(point) {
    const distanceKm = (point.distanceFromStartM ?? 0) / 1000;
    return distanceKm.toLocaleString(undefined, {
        maximumFractionDigits: distanceKm >= 20 ? 1 : 2,
        minimumFractionDigits: 0
    });
}

function buildSeries(points, { predicate, labelBuilder, valueBuilder }) {
    const labels = [];
    const values = [];

    for (const point of points) {
        if (!predicate(point)) {
            continue;
        }

        labels.push(labelBuilder(point));
        values.push(valueBuilder(point));
    }

    return labels.length >= 2 ? { labels, values } : null;
}

export class ChartManager {
    constructor(containerElement, emptyStateElement) {
        this.containerElement = containerElement;
        this.emptyStateElement = emptyStateElement;
        this.charts = [];
    }

    clear() {
        for (const chart of this.charts) {
            chart.destroy();
        }

        this.charts = [];
        this.containerElement.replaceChildren();
    }

    render(activity) {
        this.clear();

        if (!activity || !Array.isArray(activity.points) || activity.points.length < 2) {
            this.emptyStateElement.hidden = false;
            return;
        }

        const definitions = [
            {
                title: 'Elevation Profile',
                yLabel: 'Elevation (m)',
                color: '#14b8a6',
                build: () => buildSeries(activity.points, {
                    predicate: (point) => point.ele !== null && point.distanceFromStartM !== null,
                    labelBuilder: formatDistanceKm,
                    valueBuilder: (point) => point.ele
                })
            },
            {
                title: 'Speed Profile',
                yLabel: 'Speed (km/h)',
                color: '#3b82f6',
                build: () => buildSeries(activity.points, {
                    predicate: (point) => point.speedKmh !== null && point.elapsedSec !== null,
                    labelBuilder: formatElapsedMinutes,
                    valueBuilder: (point) => point.speedKmh
                })
            },
            {
                title: 'Heart Rate',
                yLabel: 'Heart Rate (bpm)',
                color: '#ef4444',
                build: () => buildSeries(activity.points, {
                    predicate: (point) => point.hr !== null && point.elapsedSec !== null,
                    labelBuilder: formatElapsedMinutes,
                    valueBuilder: (point) => point.hr
                })
            },
            {
                title: 'Cadence',
                yLabel: 'Cadence',
                color: '#f59e0b',
                build: () => buildSeries(activity.points, {
                    predicate: (point) => point.cadence !== null && point.elapsedSec !== null,
                    labelBuilder: formatElapsedMinutes,
                    valueBuilder: (point) => point.cadence
                })
            },
            {
                title: 'Power',
                yLabel: 'Power (W)',
                color: '#8b5cf6',
                build: () => buildSeries(activity.points, {
                    predicate: (point) => point.power !== null && point.elapsedSec !== null,
                    labelBuilder: formatElapsedMinutes,
                    valueBuilder: (point) => point.power
                })
            }
        ];

        let renderedCount = 0;
        for (const definition of definitions) {
            const series = definition.build();
            if (!series) {
                continue;
            }

            const { card, canvas } = createChartCard(definition.title);
            this.containerElement.append(card);
            const chart = createLineChart(canvas, definition.title, series.labels, series.values, definition.yLabel, definition.color);
            this.charts.push(chart);
            renderedCount += 1;
        }

        this.emptyStateElement.hidden = renderedCount > 0;
    }
}
