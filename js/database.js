const SPORT_LABELS = {
    run: 'Run',
    running: 'Run',
    ride: 'Ride',
    cycling: 'Ride',
    bike: 'Ride',
    workout: 'Workout',
    walk: 'Walk',
    walking: 'Walk',
    hike: 'Hike',
    hiking: 'Hike',
    swim: 'Swim',
    swimming: 'Swim',
    alpine_ski: 'Alpine Ski',
    nordic_ski: 'Nordic Ski',
    virtual_ride: 'Virtual Ride',
    virtualrun: 'Virtual Run',
    virtual_run: 'Virtual Run',
    rowing: 'Rowing',
    row: 'Rowing',
    trailrun: 'Trail Run',
    trail_run: 'Trail Run',
    weighttraining: 'Weight Training',
    weight_training: 'Weight Training'
};

function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `activity-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toFiniteNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function toDate(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    const parsedDate = new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function titleCase(value) {
    return String(value)
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

export function normalizeSport(value) {
    if (!value) {
        return 'Unknown';
    }

    const key = String(value).trim().toLowerCase().replace(/\s+/g, '_');
    return SPORT_LABELS[key] || titleCase(value);
}

export function createActivitySkeleton({ id, filename = '', sourceFormat = 'unknown' } = {}) {
    return {
        id: id || createId(),
        name: '',
        filename,
        sourceFormat,
        sport: 'Unknown',
        startTime: null,
        distanceKm: 0,
        durationSec: 0,
        movingTimeSec: 0,
        elevationGainM: 0,
        elevationLossM: 0,
        avgSpeedKmh: 0,
        maxSpeedKmh: 0,
        avgHeartRate: null,
        maxHeartRate: null,
        avgCadence: null,
        maxCadence: null,
        avgPower: null,
        maxPower: null,
        calories: null,
        pointCount: 0,
        hasGps: false,
        hasHeartRate: false,
        hasCadence: false,
        hasPower: false,
        points: [],
        issues: []
    };
}

function toRadians(value) {
    return value * (Math.PI / 180);
}

function haversineDistanceMeters(pointA, pointB) {
    if (pointA.lat === null || pointA.lon === null || pointB.lat === null || pointB.lon === null) {
        return 0;
    }

    const earthRadiusM = 6371000;
    const deltaLat = toRadians(pointB.lat - pointA.lat);
    const deltaLon = toRadians(pointB.lon - pointA.lon);
    const lat1 = toRadians(pointA.lat);
    const lat2 = toRadians(pointB.lat);

    const a = (Math.sin(deltaLat / 2) ** 2) + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(deltaLon / 2) ** 2));
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusM * c;
}

function computeElevationStats(points) {
    let gain = 0;
    let loss = 0;
    let previousElevation = null;

    for (const point of points) {
        if (point.ele === null) {
            continue;
        }

        if (previousElevation !== null) {
            const delta = point.ele - previousElevation;
            if (delta > 0) {
                gain += delta;
            }
            if (delta < 0) {
                loss += Math.abs(delta);
            }
        }

        previousElevation = point.ele;
    }

    return {
        gain,
        loss
    };
}

function computeTimeMetrics(points) {
    const timePoints = points.filter((point) => point.time instanceof Date);
    if (timePoints.length < 2) {
        return {
            durationSec: 0,
            movingTimeSec: 0
        };
    }

    const durationSec = Math.max(0, (timePoints[timePoints.length - 1].time.getTime() - timePoints[0].time.getTime()) / 1000);
    let movingTimeSec = 0;

    for (let index = 1; index < points.length; index += 1) {
        const previousPoint = points[index - 1];
        const currentPoint = points[index];
        if (!(previousPoint.time instanceof Date) || !(currentPoint.time instanceof Date)) {
            continue;
        }

        const deltaSec = Math.max(0, (currentPoint.time.getTime() - previousPoint.time.getTime()) / 1000);
        if (!deltaSec) {
            continue;
        }

        const distanceDeltaM = Math.max(0, (currentPoint.distanceFromStartM ?? 0) - (previousPoint.distanceFromStartM ?? 0));
        const speedKmh = distanceDeltaM > 0 ? (distanceDeltaM / deltaSec) * 3.6 : 0;
        if (speedKmh >= 1) {
            movingTimeSec += deltaSec;
        }
    }

    return {
        durationSec,
        movingTimeSec: movingTimeSec || durationSec
    };
}

function average(values) {
    const validValues = values.filter((value) => Number.isFinite(value));
    if (!validValues.length) {
        return null;
    }

    return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function maximum(values) {
    const validValues = values.filter((value) => Number.isFinite(value));
    if (!validValues.length) {
        return null;
    }

    return Math.max(...validValues);
}

function normalizeCoordinate(value) {
    const numericValue = toFiniteNumber(value);
    if (numericValue === null) {
        return null;
    }

    if (Math.abs(numericValue) > 180) {
        return numericValue * (180 / 2147483648);
    }

    return numericValue;
}

function normalizePoint(point) {
    return {
        lat: normalizeCoordinate(point.lat),
        lon: normalizeCoordinate(point.lon),
        ele: toFiniteNumber(point.ele),
        time: toDate(point.time),
        hr: toFiniteNumber(point.hr),
        cadence: toFiniteNumber(point.cadence),
        power: toFiniteNumber(point.power),
        temperature: toFiniteNumber(point.temperature),
        speedKmh: toFiniteNumber(point.speedKmh),
        distanceFromStartM: toFiniteNumber(point.distanceFromStartM),
        elapsedSec: toFiniteNumber(point.elapsedSec)
    };
}

function enrichPoints(points) {
    let cumulativeDistanceM = 0;
    let previousPoint = null;
    const startTime = points.find((point) => point.time instanceof Date)?.time ?? null;

    return points.map((rawPoint) => {
        const point = normalizePoint(rawPoint);

        if (point.distanceFromStartM === null && previousPoint) {
            cumulativeDistanceM += haversineDistanceMeters(previousPoint, point);
            point.distanceFromStartM = cumulativeDistanceM;
        } else if (point.distanceFromStartM !== null) {
            cumulativeDistanceM = point.distanceFromStartM;
        } else {
            point.distanceFromStartM = 0;
        }

        if (point.time instanceof Date && startTime instanceof Date) {
            point.elapsedSec = Math.max(0, (point.time.getTime() - startTime.getTime()) / 1000);
        }

        if ((point.speedKmh === null || point.speedKmh === 0) && previousPoint && previousPoint.time instanceof Date && point.time instanceof Date) {
            const deltaSec = (point.time.getTime() - previousPoint.time.getTime()) / 1000;
            const deltaDistanceM = point.distanceFromStartM - (previousPoint.distanceFromStartM ?? 0);
            if (deltaSec > 0 && deltaDistanceM >= 0) {
                point.speedKmh = (deltaDistanceM / deltaSec) * 3.6;
            }
        }

        previousPoint = point;
        return point;
    });
}

function serializeActivity(activity) {
    return {
        ...activity,
        startTime: activity.startTime instanceof Date ? activity.startTime.toISOString() : null,
        points: activity.points.map((point) => ({
            ...point,
            time: point.time instanceof Date ? point.time.toISOString() : null
        }))
    };
}

function hydrateActivity(rawActivity) {
    const hydratedActivity = {
        ...createActivitySkeleton({
            id: rawActivity.id,
            filename: rawActivity.filename,
            sourceFormat: rawActivity.sourceFormat
        }),
        ...rawActivity,
        name: rawActivity.name || '',
        startTime: toDate(rawActivity.startTime),
        points: Array.isArray(rawActivity.points)
            ? rawActivity.points.map((point) => ({
                ...point,
                time: toDate(point.time)
            }))
            : [],
        issues: Array.isArray(rawActivity.issues) ? rawActivity.issues : []
    };

    return finalizeActivity(hydratedActivity);
}

export function finalizeActivity(activity) {
    const finalizedActivity = {
        ...createActivitySkeleton({
            id: activity.id,
            filename: activity.filename,
            sourceFormat: activity.sourceFormat
        }),
        ...activity,
        name: String(activity.name || '').trim(),
        sport: normalizeSport(activity.sport),
        startTime: toDate(activity.startTime),
        distanceKm: toFiniteNumber(activity.distanceKm) ?? 0,
        durationSec: toFiniteNumber(activity.durationSec) ?? 0,
        movingTimeSec: toFiniteNumber(activity.movingTimeSec) ?? 0,
        elevationGainM: toFiniteNumber(activity.elevationGainM) ?? 0,
        elevationLossM: toFiniteNumber(activity.elevationLossM) ?? 0,
        avgSpeedKmh: toFiniteNumber(activity.avgSpeedKmh) ?? 0,
        maxSpeedKmh: toFiniteNumber(activity.maxSpeedKmh) ?? 0,
        avgHeartRate: toFiniteNumber(activity.avgHeartRate),
        maxHeartRate: toFiniteNumber(activity.maxHeartRate),
        avgCadence: toFiniteNumber(activity.avgCadence),
        maxCadence: toFiniteNumber(activity.maxCadence),
        avgPower: toFiniteNumber(activity.avgPower),
        maxPower: toFiniteNumber(activity.maxPower),
        calories: toFiniteNumber(activity.calories),
        points: Array.isArray(activity.points) ? enrichPoints(activity.points) : [],
        issues: Array.isArray(activity.issues) ? [...new Set(activity.issues)] : []
    };

    finalizedActivity.pointCount = finalizedActivity.points.length;
    finalizedActivity.hasGps = finalizedActivity.points.some((point) => point.lat !== null && point.lon !== null);
    finalizedActivity.hasHeartRate = finalizedActivity.points.some((point) => point.hr !== null) || finalizedActivity.avgHeartRate !== null || finalizedActivity.maxHeartRate !== null;
    finalizedActivity.hasCadence = finalizedActivity.points.some((point) => point.cadence !== null) || finalizedActivity.avgCadence !== null || finalizedActivity.maxCadence !== null;
    finalizedActivity.hasPower = finalizedActivity.points.some((point) => point.power !== null) || finalizedActivity.avgPower !== null || finalizedActivity.maxPower !== null;

    if (!finalizedActivity.startTime) {
        finalizedActivity.startTime = finalizedActivity.points.find((point) => point.time instanceof Date)?.time ?? null;
    }

    if (!finalizedActivity.distanceKm && finalizedActivity.points.length > 1) {
        const lastDistanceM = finalizedActivity.points[finalizedActivity.points.length - 1].distanceFromStartM ?? 0;
        finalizedActivity.distanceKm = lastDistanceM / 1000;
    }

    const computedElevation = computeElevationStats(finalizedActivity.points);
    if (!finalizedActivity.elevationGainM) {
        finalizedActivity.elevationGainM = computedElevation.gain;
    }
    if (!finalizedActivity.elevationLossM) {
        finalizedActivity.elevationLossM = computedElevation.loss;
    }

    const computedTimeMetrics = computeTimeMetrics(finalizedActivity.points);
    if (!finalizedActivity.durationSec) {
        finalizedActivity.durationSec = computedTimeMetrics.durationSec;
    }
    if (!finalizedActivity.movingTimeSec) {
        finalizedActivity.movingTimeSec = computedTimeMetrics.movingTimeSec;
    }

    if (!finalizedActivity.avgSpeedKmh) {
        const speedTimeBase = finalizedActivity.movingTimeSec || finalizedActivity.durationSec;
        finalizedActivity.avgSpeedKmh = speedTimeBase > 0 ? finalizedActivity.distanceKm / (speedTimeBase / 3600) : 0;
    }

    if (!finalizedActivity.maxSpeedKmh) {
        finalizedActivity.maxSpeedKmh = maximum(finalizedActivity.points.map((point) => point.speedKmh)) ?? 0;
    }

    if (finalizedActivity.avgHeartRate === null) {
        finalizedActivity.avgHeartRate = average(finalizedActivity.points.map((point) => point.hr));
    }
    if (finalizedActivity.maxHeartRate === null) {
        finalizedActivity.maxHeartRate = maximum(finalizedActivity.points.map((point) => point.hr));
    }

    if (finalizedActivity.avgCadence === null) {
        finalizedActivity.avgCadence = average(finalizedActivity.points.map((point) => point.cadence));
    }
    if (finalizedActivity.maxCadence === null) {
        finalizedActivity.maxCadence = maximum(finalizedActivity.points.map((point) => point.cadence));
    }

    if (finalizedActivity.avgPower === null) {
        finalizedActivity.avgPower = average(finalizedActivity.points.map((point) => point.power));
    }
    if (finalizedActivity.maxPower === null) {
        finalizedActivity.maxPower = maximum(finalizedActivity.points.map((point) => point.power));
    }

    if (!finalizedActivity.startTime) {
        finalizedActivity.issues.push('Missing timestamps');
    }

    if (!finalizedActivity.points.some((point) => point.ele !== null)) {
        finalizedActivity.issues.push('Missing elevation data');
    }

    finalizedActivity.issues = [...new Set(finalizedActivity.issues)];
    return finalizedActivity;
}

export function getActivityName(activity) {
    const explicitName = String(activity?.name || '').trim();
    if (explicitName) {
        return explicitName;
    }

    const filename = String(activity?.filename || '').trim();
    if (filename) {
        return filename.replace(/\.[^.]+$/, '');
    }

    return 'Unnamed activity';
}

export class ActivityDatabase {
    constructor() {
        this.reset();
    }

    reset() {
        this.activities = [];
        this.parsingErrors = [];
        this.loadNotes = [];
    }

    replaceAll(activities, { parsingErrors = [], loadNotes = [] } = {}) {
        this.activities = Array.isArray(activities) ? activities.map((activity) => finalizeActivity(activity)) : [];
        this.parsingErrors = Array.isArray(parsingErrors)
            ? parsingErrors.map((error) => ({
                filename: error.filename || 'Unknown file',
                issue: error.issue || error.message || 'Unknown parsing error',
                source: error.source || error.sourceFormat || 'unknown'
            }))
            : [];
        this.loadNotes = Array.isArray(loadNotes) ? loadNotes.filter(Boolean) : [];
    }

    getActivities() {
        return [...this.activities].sort((activityA, activityB) => {
            const timeA = activityA.startTime instanceof Date ? activityA.startTime.getTime() : 0;
            const timeB = activityB.startTime instanceof Date ? activityB.startTime.getTime() : 0;
            return timeB - timeA;
        });
    }

    getSummary() {
        const fitFiles = this.activities.filter((activity) => activity.sourceFormat === 'fit').length;
        const gpxFiles = this.activities.filter((activity) => activity.sourceFormat === 'gpx').length;
        const withGps = this.activities.filter((activity) => activity.hasGps).length;
        const withHr = this.activities.filter((activity) => activity.hasHeartRate).length;
        const withCadence = this.activities.filter((activity) => activity.hasCadence).length;
        const withPower = this.activities.filter((activity) => activity.hasPower).length;
        const datedActivities = this.activities.filter((activity) => activity.startTime instanceof Date);
        const sortedDates = datedActivities.map((activity) => activity.startTime).sort((dateA, dateB) => dateA.getTime() - dateB.getTime());

        return {
            activitiesLoaded: this.activities.length,
            fitFiles,
            gpxFiles,
            withGps,
            withHr,
            withCadence,
            withPower,
            earliest: sortedDates[0] ?? null,
            latest: sortedDates[sortedDates.length - 1] ?? null
        };
    }

    getDiagnostics() {
        const summary = {
            totalActivities: this.activities.length,
            fitActivities: this.activities.filter((activity) => activity.sourceFormat === 'fit').length,
            gpxActivities: this.activities.filter((activity) => activity.sourceFormat === 'gpx').length,
            activitiesWithGps: this.activities.filter((activity) => activity.hasGps).length,
            activitiesWithHr: this.activities.filter((activity) => activity.hasHeartRate).length,
            activitiesWithCadence: this.activities.filter((activity) => activity.hasCadence).length,
            activitiesWithPower: this.activities.filter((activity) => activity.hasPower).length,
            activitiesMissingTimestamps: this.activities.filter((activity) => !activity.startTime).length,
            activitiesMissingElevation: this.activities.filter((activity) => !activity.points.some((point) => point.ele !== null)).length,
            parsingErrors: this.parsingErrors.length
        };

        const issueRows = [];
        for (const activity of this.activities) {
            for (const issue of activity.issues) {
                issueRows.push({
                    filename: activity.filename,
                    issue,
                    source: activity.sourceFormat
                });
            }
        }

        return {
            summary,
            problematicFiles: [...this.parsingErrors, ...issueRows]
        };
    }

    getAvailableYears() {
        return [...new Set(
            this.activities
                .filter((activity) => activity.startTime instanceof Date)
                .map((activity) => activity.startTime.getFullYear())
        )].sort((yearA, yearB) => yearB - yearA);
    }

    getAvailableSports() {
        return [...new Set(this.activities.map((activity) => activity.sport).filter(Boolean))].sort((sportA, sportB) => sportA.localeCompare(sportB));
    }

    serialize() {
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            activities: this.activities.map((activity) => serializeActivity(activity)),
            diagnostics: {
                parsingErrors: this.parsingErrors,
                loadNotes: this.loadNotes
            }
        };
    }

    loadNormalizedDataset(rawPayload) {
        const payload = Array.isArray(rawPayload) ? { activities: rawPayload } : rawPayload;
        const activities = Array.isArray(payload?.activities) ? payload.activities.map((activity) => hydrateActivity(activity)) : [];
        const parsingErrors = Array.isArray(payload?.diagnostics?.parsingErrors) ? payload.diagnostics.parsingErrors : [];
        const loadNotes = Array.isArray(payload?.diagnostics?.loadNotes) ? payload.diagnostics.loadNotes : [];

        this.replaceAll(activities, {
            parsingErrors,
            loadNotes: loadNotes.length ? loadNotes : ['Loaded from normalized dataset']
        });
    }
}

export function formatDuration(durationSec) {
    const safeDuration = Math.max(0, Math.round(toFiniteNumber(durationSec) ?? 0));
    const hours = Math.floor(safeDuration / 3600);
    const minutes = Math.floor((safeDuration % 3600) / 60);
    const seconds = safeDuration % 60;

    if (hours > 0) {
        return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    }

    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function formatDate(value) {
    const date = toDate(value);
    if (!date) {
        return 'Unknown';
    }

    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

export function formatNumber(value, digits = 1, empty = '-') {
    const numericValue = toFiniteNumber(value);
    if (numericValue === null) {
        return empty;
    }

    return numericValue.toLocaleString(undefined, {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits
    });
}
