import { formatDate, formatDuration, formatNumber, getActivityName } from './database.js';
import { ChartManager } from './charts.js';

function createMetricRow(term, value) {
    const dt = document.createElement('dt');
    dt.textContent = term;

    const dd = document.createElement('dd');
    dd.textContent = value;

    return [dt, dd];
}

function getRoutePoints(activity) {
    return (activity?.points || []).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
}

export class DetailView {
    constructor({ titleElement, formatBadgeElement, summaryElement, mapContainer, mapEmptyState, chartsContainer, chartsEmptyState }) {
        this.titleElement = titleElement;
        this.formatBadgeElement = formatBadgeElement;
        this.summaryElement = summaryElement;
        this.mapContainer = mapContainer;
        this.mapEmptyState = mapEmptyState;
        this.chartManager = new ChartManager(chartsContainer, chartsEmptyState);

        this.map = L.map(mapContainer, {
            zoomControl: true,
            attributionControl: true
        }).setView([0, 0], 2);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.map);

        this.routeLayer = null;
        this.routeStartMarker = null;
        this.routeEndMarker = null;
        this.reset();
    }

    reset() {
        this.titleElement.textContent = 'No activity selected';
        this.formatBadgeElement.textContent = '-';
        this.summaryElement.replaceChildren();
        this.clearRoute();
        this.mapEmptyState.hidden = false;
        this.chartManager.render(null);
    }

    clearRoute() {
        if (this.routeLayer) {
            this.map.removeLayer(this.routeLayer);
            this.routeLayer = null;
        }

        if (this.routeStartMarker) {
            this.map.removeLayer(this.routeStartMarker);
            this.routeStartMarker = null;
        }

        if (this.routeEndMarker) {
            this.map.removeLayer(this.routeEndMarker);
            this.routeEndMarker = null;
        }
    }

    render(activity) {
        if (!activity) {
            this.reset();
            return;
        }

        this.titleElement.textContent = getActivityName(activity);
        this.formatBadgeElement.textContent = String(activity.sourceFormat || '-').toUpperCase();

        const summaryRows = [
            createMetricRow('Filename', activity.filename || '-'),
            createMetricRow('Date', formatDate(activity.startTime)),
            createMetricRow('Type', activity.sport || '-'),
            createMetricRow('Distance', `${formatNumber(activity.distanceKm, 2)} km`),
            createMetricRow('Duration', formatDuration(activity.durationSec)),
            createMetricRow('Moving Time', formatDuration(activity.movingTimeSec)),
            createMetricRow('Elevation Gain', `${formatNumber(activity.elevationGainM, 0)} m`),
            createMetricRow('Elevation Loss', `${formatNumber(activity.elevationLossM, 0)} m`),
            createMetricRow('Average Speed', `${formatNumber(activity.avgSpeedKmh, 1)} km/h`),
            createMetricRow('Maximum Speed', `${formatNumber(activity.maxSpeedKmh, 1)} km/h`),
            createMetricRow('Average Heart Rate', activity.avgHeartRate !== null ? `${formatNumber(activity.avgHeartRate, 0)} bpm` : '-'),
            createMetricRow('Maximum Heart Rate', activity.maxHeartRate !== null ? `${formatNumber(activity.maxHeartRate, 0)} bpm` : '-'),
            createMetricRow('Average Cadence', activity.avgCadence !== null ? `${formatNumber(activity.avgCadence, 0)} rpm` : '-'),
            createMetricRow('Maximum Cadence', activity.maxCadence !== null ? `${formatNumber(activity.maxCadence, 0)} rpm` : '-'),
            createMetricRow('Average Power', activity.avgPower !== null ? `${formatNumber(activity.avgPower, 0)} W` : '-'),
            createMetricRow('Maximum Power', activity.maxPower !== null ? `${formatNumber(activity.maxPower, 0)} W` : '-'),
            createMetricRow('Calories', activity.calories !== null ? formatNumber(activity.calories, 0) : '-'),
            createMetricRow('Track Points', String(activity.pointCount || 0))
        ];

        this.summaryElement.replaceChildren(...summaryRows.flat());
        this.renderMap(activity);
        this.chartManager.render(activity);
    }

    renderMap(activity) {
        this.clearRoute();

        const routePoints = getRoutePoints(activity);
        if (!routePoints.length) {
            this.mapEmptyState.hidden = false;
            return;
        }

        this.mapEmptyState.hidden = true;
        const latLngs = routePoints.map((point) => [point.lat, point.lon]);
        this.routeLayer = L.polyline(latLngs, {
            color: '#3b82f6',
            weight: 4,
            opacity: 0.85
        }).addTo(this.map);

        const startLatLng = latLngs[0];
        const endLatLng = latLngs[latLngs.length - 1];

        this.routeStartMarker = L.circleMarker(startLatLng, {
            radius: 6,
            color: '#22c55e',
            weight: 2,
            fillColor: '#22c55e',
            fillOpacity: 0.9
        }).addTo(this.map);

        if (latLngs.length > 1) {
            this.routeEndMarker = L.circleMarker(endLatLng, {
                radius: 6,
                color: '#ef4444',
                weight: 2,
                fillColor: '#ef4444',
                fillOpacity: 0.9
            }).addTo(this.map);
        }

        requestAnimationFrame(() => {
            this.map.invalidateSize();

            if (latLngs.length === 1) {
                this.map.setView(startLatLng, 15, {
                    animate: false
                });
                return;
            }

            this.map.fitBounds(this.routeLayer.getBounds(), {
                padding: [24, 24],
                maxZoom: 15,
                animate: false
            });
        });
    }
}
